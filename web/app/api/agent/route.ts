import { auth } from "@/auth";
import {
  ensureDefaultProject,
  getOwnedProject,
  addMessage,
  getMessages,
  getClientFiles,
  listFiles,
  readFile,
  writeFile,
  updateMessageContent,
  renameProject,
  isDefaultProjectName,
  extractHtmlTitle,
} from "@/lib/projects";
import { createBackup } from "@/lib/backup";
import { generateThumbnail } from "@/lib/thumbnail";
import { THUMBNAIL_PATH } from "@/lib/og-image";
import {
  CONCEPT_PATH,
  DESIGN_PATH,
  SEO_GEO_PATH,
  isInternalVfsPath,
} from "@/lib/concept";
import { resolveLocale } from "@/lib/locale";
import {
  evaluateSeo,
  composeSeoGeoMd,
  parseSiteType,
  siteTypeNeedsSeo,
} from "@/lib/seo-checklist";
import {
  getWorld,
  sampleInterviewCandidates,
  sampleWorldCandidates,
} from "@/lib/design-worlds";
import { composeDesignMd, composeFallbackDesignMd } from "@/lib/agent/design";
import { lintDensity, type DensityFinding } from "@/lib/density-lint";
import { listAttachments } from "@/lib/attachments";
import { runAgent } from "@/lib/agent/run";
import { partialStringValue } from "@/lib/agent/stream-json";
import { modelForTask } from "@/lib/cortecs/config";
import {
  ensureCredit,
  billModelUsage,
  computeBilledEur,
  recordUsageAndDeduct,
  type ModelTokens,
} from "@/lib/cortecs/billing";
import {
  parseInterviewState,
  validateAnswers,
  validateAnswersV1,
} from "@/lib/interview";
import {
  buildAnswersPrompt,
  buildSkipPrompt,
  generateInterview,
  renderInterviewForTranscript,
} from "@/lib/agent/interview";

// The Agent SDK needs Node APIs (and may spawn a subprocess) — never the edge
// runtime. Allow long-running agent turns.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  // A turn is EITHER a chat message OR the answers to a pending concept
  // interview (the second request of the first-prompt interview flow).
  const message = typeof body?.message === "string" ? body.message : "";
  const interviewInput = parseInterviewInput(body);
  if (!interviewInput && message.trim() === "") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve the target project (scoped to this user). Read the prior chat
  // history BEFORE recording this turn, so the new message isn't duplicated in
  // the transcript we feed back to the agent.
  const project = body?.projectId
    ? await getOwnedProject(body.projectId, userId)
    : await ensureDefaultProject(userId);

  // Pre-flight budget gate. Token usage is only known AFTER a turn (which can be
  // up to 50 sub-turns), so we can't pre-charge — we gate on balance > 0, run,
  // then deduct. A user near zero may overshoot slightly negative on their last
  // turn; the next request's gate then blocks until they top up. Grants the free
  // tier lazily on first use.
  const balanceEur = await ensureCredit(userId);
  if (balanceEur <= 0) {
    return Response.json(
      { error: "insufficient_credit", balanceEur },
      { status: 402 },
    );
  }

  const history = await getMessages(project.id);
  // The agent's distilled design memory (durable decisions). Survives the
  // transcript window cap; always re-injected so it's considered every turn.
  const concept = await readFile(project.id, CONCEPT_PATH);
  // Resolved once up front (before streaming) for the auto-maintained SEO/GEO
  // report — the user's language for a user-facing file. Never let a locale
  // read break a turn; German is the product default.
  const locale = await resolveLocale().catch(() => "de" as const);

  let turnPrompt: string;
  // Whether this turn should open with the concept interview instead of a
  // build (first user prompt of the project; generation failure falls back).
  let firstPromptInterview = false;
  if (interviewInput) {
    // Second request of the interview flow: validate + persist the answers and
    // turn them into the build prompt. The original request is already in the
    // history; no new user message is recorded.
    const resolved = await resolveInterviewTurn(
      project.id,
      history,
      interviewInput,
    );
    if ("error" in resolved) {
      return Response.json(
        { error: resolved.error },
        { status: resolved.status },
      );
    }
    turnPrompt = await withAttachmentContext(project.id, resolved.prompt, body);
  } else {
    // Typing a normal message while an interview card is still open counts as
    // skipping it — the card must never dead-end the chat.
    await skipPendingInterviews(project.id, history);
    firstPromptInterview = history.every((m) => m.role !== "user");
    await addMessage(project.id, "user", message);

    // Make the agent aware of the project's uploaded reference files so it knows
    // to reach for list_attachments / read_attachment. The note is prepended to
    // the prompt (not stored as the user's message). attachmentIds flags the ones
    // just attached this turn for extra emphasis.
    turnPrompt = await withAttachmentContext(project.id, message, body);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        // A closed controller (client navigated away mid-run) must not kill
        // the turn — persistence and billing below still have to happen.
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {}
      };
      // SSE comment frames keep idle proxies (Traefik) from cutting the
      // connection during long silent stretches; the client skips non-data lines.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 15_000);

      send({ type: "project", id: project.id });

      // Ordered log of what this turn produced, mirroring the client's live
      // view: separate assistant text bubbles interleaved with tool-call rows.
      // Persisted row-by-row so a reload reconstructs the same transcript
      // instead of one merged blob with the tool lines lost.
      const turnMessages: {
        role: "assistant" | "tool";
        content: string;
        tool?: string;
      }[] = [];
      let filesChanged = false;
      // Which VFS paths changed this turn — lets us regenerate the OG thumbnail
      // only when the entry document actually changed (see the post-turn block).
      const changedPaths = new Set<string>();
      // The SDK's terminal `result` message carries per-model token usage — our
      // billing source (we self-compute EUR cost; total_cost_usd is Anthropic-
      // priced and meaningless under Cortecs).
      let modelUsage: Record<string, ModelTokens> | null = null;
      // --- Live progress (includePartialMessages) ---
      // Raw stream events let us forward assistant text as it's generated and
      // show tool-input generation (the minutes-long silent stretch of a build)
      // as live progress. The complete assistant message still follows and
      // stays the source of truth for persistence; streamedTextChars tracks how
      // much of the current message's text already went out as deltas so the
      // committed block isn't sent twice.
      let streamedTextChars = 0;
      // The tool_use block currently streaming its input, if any.
      // Live "watch the file being typed" streaming of a write_file's content
      // (see components/sandpack-workspace.tsx): a steady ~10 updates/s, not one
      // per model token; a hard buffer cap keeps a pathologically large file from
      // streaming (it still commits normally via file_changed).
      const STREAM_THROTTLE_MS = 90;
      const MAX_STREAM_BUF = 512 * 1024;
      let liveTool: {
        name: string;
        path?: string;
        chars: number;
        // First bytes of the input JSON, scanned once for a complete "path"
        // value (capped so a content-first input can't trigger O(n²) rescans).
        sniff: string;
        lastSentChars: number;
        lastSentAt: number;
        // When the model STARTED emitting this tool call — used to log the
        // "input" window (how long the model spent generating the arguments),
        // the dominant cost behind a slow-looking tool row.
        startedAt: number;
        // write_file content streaming: accumulate the raw input JSON, extract
        // the growing `content` value, and emit only the newly-typed chars.
        streamable: boolean;
        buf: string;
        contentSentLen: number;
        streaming: boolean;
        lastStreamAt: number;
      } | null = null;
      try {
        // First user prompt: ask the concept interview instead of building.
        // The build then runs on the follow-up request that carries the
        // answers. If generation fails, fall through to a normal build — the
        // interview must never block a user's first version.
        if (firstPromptInterview) {
          const asked = await runInterviewPhase({
            userId,
            projectId: project.id,
            message,
            send,
          });
          if (asked) {
            send({ type: "done" });
            return; // finally below closes the stream
          }
          // Interview generation failed → normal build, but still with a
          // deliberate design direction: sample ONE world and write its DNA
          // (the prompt below is assembled after this, so it's included).
          try {
            const [candidate] = sampleWorldCandidates(1);
            await writeFile(
              project.id,
              DESIGN_PATH,
              composeFallbackDesignMd(candidate.world, candidate.mutations),
            );
          } catch (designError) {
            // Never let the DNA fallback break a user's first build.
            console.error("[agent] fallback design DNA failed", designError);
          }
        }

        // Each agent turn is a fresh SDK query() with no memory of prior
        // turns, so we reconstruct context from the persisted concept, the
        // design DNA and the chat history and prepend it. Assembled HERE —
        // after the interview handling — so a /DESIGN.md that this very
        // request just wrote (interview answered/skipped, or the fallback
        // below) is already part of the prompt.
        const design = await readFile(project.id, DESIGN_PATH);
        // Measured density of the CURRENT page (advisory): recomputed from the
        // live VFS every turn, so it also reaches projects whose page is
        // already too dense and disappears by itself once the page is edited
        // down. A lint failure must never block a turn.
        let density: DensityFinding[] = [];
        // SEO/GEO checklist status — a SOFT per-turn reminder for websites so the
        // agent knows where it stands, without ever doing the (paid) work
        // unprompted. Only when the /CONCEPT.md marker says website/hybrid AND
        // items are still open; recomputed from the live VFS, so it self-clears.
        let seoStatus: { done: number; total: number } | null = null;
        try {
          const indexHtml = await readFile(project.id, "/index.html");
          if (indexHtml) {
            density = lintDensity(indexHtml);
            if (siteTypeNeedsSeo(parseSiteType(concept))) {
              const paths = new Set(
                (await listFiles(project.id)).map((f) => f.path),
              );
              const ev = evaluateSeo(indexHtml, {
                hasRobots: paths.has("/robots.txt"),
                hasSitemap: paths.has("/sitemap.xml"),
                hasLlms: paths.has("/llms.txt"),
              });
              if (ev.done < ev.total)
                seoStatus = { done: ev.done, total: ev.total };
            }
          }
        } catch {}
        const prompt = withProjectContext(
          concept,
          design,
          history,
          turnPrompt,
          density,
          seoStatus,
        );

        const run = await runAgent({
          projectId: project.id,
          prompt,
          onFileEvent: (event) => {
            filesChanged = true;
            if ("path" in event) changedPaths.add(event.path);
            // Internal files (CONCEPT.md) are agent memory: snapshot them in a
            // version, but never surface them in the client's file tree/preview.
            if ("path" in event && isInternalVfsPath(event.path)) return;
            send(event);
          },
        });

        for await (const msg of run) {
          if (msg.type === "stream_event") {
            if (msg.parent_tool_use_id) continue; // subagent-internal, not ours
            const ev = msg.event;
            if (ev.type === "message_start") {
              streamedTextChars = 0;
            } else if (ev.type === "content_block_start") {
              if (ev.content_block.type === "tool_use") {
                const tool = ev.content_block.name.replace(/^mcp__[a-z]+__/, "");
                const startedAt = Date.now();
                liveTool = {
                  name: tool,
                  chars: 0,
                  sniff: "",
                  lastSentChars: 0,
                  lastSentAt: startedAt,
                  startedAt,
                  streamable: tool === "write_file",
                  buf: "",
                  contentSentLen: 0,
                  streaming: false,
                  lastStreamAt: startedAt,
                };
                send({ type: "tool_start", tool });
              }
            } else if (ev.type === "content_block_delta") {
              if (ev.delta.type === "text_delta" && ev.delta.text) {
                streamedTextChars += ev.delta.text.length;
                send({ type: "assistant_text", text: ev.delta.text });
              } else if (ev.delta.type === "input_json_delta" && liveTool) {
                liveTool.chars += ev.delta.partial_json.length;
                let pathFound = false;
                if (liveTool.path === undefined && liveTool.sniff.length < 8192) {
                  liveTool.sniff += ev.delta.partial_json;
                  const m = liveTool.sniff.match(
                    /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/,
                  );
                  if (m) {
                    try {
                      liveTool.path = JSON.parse(`"${m[1]}"`) as string;
                    } catch {
                      liveTool.path = m[1];
                    }
                    pathFound = true;
                  }
                }
                const now = Date.now();
                if (
                  pathFound ||
                  liveTool.chars - liveTool.lastSentChars >= 2048 ||
                  now - liveTool.lastSentAt >= 750
                ) {
                  liveTool.lastSentChars = liveTool.chars;
                  liveTool.lastSentAt = now;
                  send({
                    type: "tool_progress",
                    tool: liveTool.name,
                    path: liveTool.path,
                    chars: liveTool.chars,
                  });
                }
                // Live content stream for write_file: rebuild the growing file
                // text from the raw input JSON and emit just the newly-typed
                // chars, so the code view types it out. Skips internal files (they
                // never reach the tree) and over-large buffers (commit still works).
                if (liveTool.streamable && liveTool.buf.length <= MAX_STREAM_BUF) {
                  liveTool.buf += ev.delta.partial_json;
                  if (
                    liveTool.path !== undefined &&
                    !isInternalVfsPath(liveTool.path) &&
                    (!liveTool.streaming ||
                      now - liveTool.lastStreamAt >= STREAM_THROTTLE_MS)
                  ) {
                    const content = partialStringValue(liveTool.buf, "content");
                    if (content !== null && content.length > liveTool.contentSentLen) {
                      send({
                        type: "file_stream",
                        path: liveTool.path,
                        delta: content.slice(liveTool.contentSentLen),
                        first: !liveTool.streaming,
                      });
                      liveTool.contentSentLen = content.length;
                      liveTool.streaming = true;
                      liveTool.lastStreamAt = now;
                    }
                  }
                }
              }
            } else if (ev.type === "content_block_stop") {
              if (liveTool) {
                // Flush any streamed tail the throttle held back, so the live
                // view shows the whole file a beat before the commit rasts in.
                if (liveTool.streaming && liveTool.path) {
                  const content = partialStringValue(liveTool.buf, "content");
                  if (
                    content !== null &&
                    content.length > liveTool.contentSentLen
                  ) {
                    send({
                      type: "file_stream",
                      path: liveTool.path,
                      delta: content.slice(liveTool.contentSentLen),
                      first: false,
                    });
                  }
                }
                // Time the model spent generating this tool's arguments — the
                // "input" window. Pairs with the tool's own "exec" line (see
                // timed-tool.ts): input ≫ exec means the model, not the tool,
                // is the bottleneck (typically true for write_file/add_icons).
                console.log(
                  `[agent] tool ${liveTool.name} input ${
                    Date.now() - liveTool.startedAt
                  }ms, ${liveTool.chars} chars${
                    liveTool.path ? ` (${liveTool.path})` : ""
                  }`,
                );
              }
              liveTool = null;
            }
          } else if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                // Merge into the current assistant bubble, or start a new one
                // if a tool row intervened — matches the client's live
                // assistant_text handling so live and reloaded views agree.
                const last = turnMessages[turnMessages.length - 1];
                if (last?.role === "assistant") last.content += block.text;
                else
                  turnMessages.push({ role: "assistant", content: block.text });
                // Live view: only what wasn't already streamed as deltas
                // (normally nothing — the whole block streamed already).
                const alreadyStreamed = Math.min(
                  streamedTextChars,
                  block.text.length,
                );
                streamedTextChars -= alreadyStreamed;
                const remainder = block.text.slice(alreadyStreamed);
                if (remainder) send({ type: "assistant_text", text: remainder });
              } else if (block.type === "tool_use") {
                const tool = block.name.replace(/^mcp__[a-z]+__/, "");
                const path = (block.input as { path?: string } | undefined)
                  ?.path;
                const label = `${tool}${path ? ` ${path}` : ""}`;
                turnMessages.push({ role: "tool", content: label, tool });
                send({ type: "tool_use", tool, path });
              }
            }
            // A message that streamed no deltas (or was synthetic) must not
            // leak its counter into the next round.
            streamedTextChars = 0;
          } else if (msg.type === "result") {
            modelUsage = msg.modelUsage as Record<string, ModelTokens>;
          }
        }

        // Persist the turn in order. Sequential awaits keep createdAt
        // monotonic, so getMessages' createdAt ordering restores this exact
        // sequence. Skip empty assistant bubbles (e.g. a trailing tool call
        // with no closing text).
        for (const tm of turnMessages) {
          if (tm.role === "assistant" && tm.content.trim() === "") continue;
          await addMessage(project.id, tm.role, tm.content, tm.tool);
        }
        // Auto-maintain the SEO/GEO report for websites — deterministic, no LLM
        // cost. Recomputed from the LIVE VFS so its checkmarks reflect the real
        // page (a `[x]` is measured, never claimed by the agent). Reads CONCEPT
        // FRESH because this very turn may have just written the `Site type:`
        // marker. Internal like CONCEPT/DESIGN, so the getClientFiles snapshot
        // below ships it on the `internal` channel. Fully fail-safe — a lint or
        // write error must never break the turn.
        if (filesChanged) {
          try {
            const siteType = parseSiteType(
              await readFile(project.id, CONCEPT_PATH),
            );
            if (siteTypeNeedsSeo(siteType)) {
              const [indexHtml, allFiles] = await Promise.all([
                readFile(project.id, "/index.html"),
                listFiles(project.id),
              ]);
              if (indexHtml) {
                const paths = new Set(allFiles.map((f) => f.path));
                const ev = evaluateSeo(indexHtml, {
                  hasRobots: paths.has("/robots.txt"),
                  hasSitemap: paths.has("/sitemap.xml"),
                  hasLlms: paths.has("/llms.txt"),
                });
                await writeFile(
                  project.id,
                  SEO_GEO_PATH,
                  composeSeoGeoMd(ev, { locale }),
                );
              }
            }
          } catch (seoError) {
            console.error("[agent] SEO checklist update failed", seoError);
          }
        }
        const client = await getClientFiles(project.id);
        send({
          type: "files",
          files: client.files,
          assets: client.assets,
          internal: client.internal,
        });
        // Adopt the generated <title> as the project name, so the user doesn't
        // have to name the app up front. Gated ONLY to a still-default name:
        // once we (or the user) set a real name it's no longer a default, so
        // this fires at most once and never overwrites a manual rename or a
        // landing prompt-derived name. Runs before createBackup so the snapshot
        // already carries the final name.
        if (filesChanged && isDefaultProjectName(project.name)) {
          const title = extractHtmlTitle(client.files["/index.html"] ?? "");
          if (title && title !== project.name) {
            await renameProject(project.id, userId, title);
            send({ type: "project_renamed", name: title });
          }
        }
        // Regenerate the OG thumbnail when the entry document changed this turn.
        // Runs AFTER the files snapshot (the app is already visible to the user)
        // and BEFORE the backup, so the auto-snapshot carries the fresh image.
        // Fully fail-safe + time-boxed inside generateThumbnail — a screenshot
        // failure or a missing service must never break the turn.
        if (changedPaths.has("/index.html")) {
          try {
            const asset = await generateThumbnail(project.id);
            if (asset) {
              send({ type: "asset_changed", path: THUMBNAIL_PATH, asset });
            }
          } catch (thumbError) {
            console.error("[agent] thumbnail generation failed", thumbError);
          }
        }
        // Snapshot the whole app so the user can restore it later.
        if (filesChanged) {
          const backup = await createBackup(project.id, "auto");
          send({
            type: "version",
            id: backup.id,
            kind: backup.kind,
            label: backup.label,
            createdAt: backup.createdAt,
          });
        }

        // Bill the turn and surface the cost. A billing failure must NEVER lose
        // the user's work, so it's isolated — log and continue to `done`.
        if (modelUsage) {
          try {
            const { model: buildModel } = await modelForTask("build");
            const billed = await billModelUsage(modelUsage, buildModel);
            if (billed) {
              const newBalanceEur = await recordUsageAndDeduct({
                userId,
                projectId: project.id,
                task: "build",
                model: billed.model,
                provider: billed.provider,
                usage: billed.usage,
                cost: billed.cost,
              });
              send({
                type: "usage",
                model: billed.model,
                inputTokens: billed.usage.inputTokens,
                outputTokens: billed.usage.outputTokens,
                cacheReadTokens: billed.usage.cacheReadTokens,
                cacheCreationTokens: billed.usage.cacheCreationTokens,
                billedEur: billed.cost.billedEur,
                balanceEur: newBalanceEur,
              });
            }
          } catch (billingError) {
            console.error("[agent] billing failed", billingError);
          }
        }

        send({ type: "done" });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Agent error",
        });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Prepends a note about available reference files so the agent uses its tools. */
async function withAttachmentContext(
  projectId: string,
  message: string,
  body: unknown,
): Promise<string> {
  const all = await listAttachments(projectId);
  if (all.length === 0) return message;

  const newIds = new Set(
    Array.isArray((body as { attachmentIds?: unknown })?.attachmentIds)
      ? ((body as { attachmentIds: unknown[] }).attachmentIds.filter(
          (x): x is string => typeof x === "string",
        ))
      : [],
  );

  const list = all
    .map(
      (a) =>
        `#${a.id} ${a.filename} (${a.kind})${newIds.has(a.id) ? " [just attached]" : ""}`,
    )
    .join(", ");

  return (
    `[Reference files the user uploaded for this project — read the relevant ones ` +
    `with list_attachments / read_attachment before building: ${list}.]\n\n` +
    message
  );
}

// How much prior conversation to replay. The actual app state lives in the VFS
// (the agent reads it with its tools), so the transcript only needs to carry the
// dialogue — we cap it to keep the prompt bounded on long-running projects.
const HISTORY_MAX_MESSAGES = 24;
const HISTORY_MAX_CHARS_PER_MESSAGE = 4000;

/**
 * Prepends the project's durable concept and the prior conversation so the agent
 * treats this turn as a continuation of one evolving project rather than a
 * standalone request. Without this, each SDK query() starts blind — the root
 * cause of the agent rebuilding from scratch and ignoring earlier instructions.
 * Code isn't included here: the agent reads the current files from the VFS itself.
 */
function withProjectContext(
  concept: string | null,
  design: string | null,
  history: { role: string; content: string; kind?: string | null }[],
  currentPrompt: string,
  density: DensityFinding[] = [],
  seoStatus: { done: number; total: number } | null = null,
): string {
  const prior = history
    // Interview cards persist as JSON — replay answered ones as a readable
    // Q→A block and drop pending/skipped ones, so raw JSON never leaks into
    // the agent's transcript.
    .map((m) => {
      if (m.kind !== "interview") return m;
      const state = parseInterviewState(m.content);
      const rendered = state ? renderInterviewForTranscript(state) : null;
      return rendered ? { role: "assistant", content: rendered } : null;
    })
    .filter((m): m is { role: string; content: string } => m !== null)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-HISTORY_MAX_MESSAGES);
  if (prior.length === 0 && !concept?.trim() && !design?.trim()) {
    return currentPrompt;
  }

  const sections: string[] = [];

  if (concept?.trim()) {
    sections.push(
      `## Project concept (your durable memory of this project)\n` +
        `These are the established decisions for this project. Honor them, and ` +
        `keep this file (${CONCEPT_PATH}) up to date as decisions evolve.\n\n` +
        concept.trim(),
    );
  }

  if (design?.trim()) {
    sections.push(
      `## Design DNA (${DESIGN_PATH} — binding)\n` +
        `This project's deliberate visual identity. Every styling decision in ` +
        `this turn must stay inside it, including its VERBOTEN list; change it ` +
        `only on an explicit redesign request.\n\n` +
        design.trim(),
    );
  }

  // Advisory density readout — only when the page is clearly over the line
  // (several findings at once), so a single debatable measurement (e.g. a
  // legitimate repeated app-toolbar button) never turns into a standing nag.
  if (density.length >= 2) {
    sections.push(
      `## Measured density (computed from the current /index.html)\n` +
        density.map((f) => `- ${f.measured}`).join("\n") +
        `\n\nA real site would have been edited tighter before shipping. When ` +
        `this turn touches one of these areas anyway, fix it as part of the ` +
        `work — but do NOT start an unrequested full rewrite for this alone, ` +
        `and never cut content the user explicitly asked for. If the design ` +
        `DNA above or the user's wishes explicitly call for this density, ` +
        `they win — keep it and ignore this readout.`,
    );
  }

  // SEO/GEO checklist status for websites — soft awareness, never a mandate to
  // do the (paid) work. Present only when the marker says website/hybrid and
  // items are open (computed in the route from the live VFS).
  if (seoStatus) {
    sections.push(
      `## SEO/GEO checklist status\n` +
        `This site's SEO/GEO checklist stands at ${seoStatus.done}/${seoStatus.total} ` +
        `(system-maintained in ${SEO_GEO_PATH}). Work through the OPEN items ONLY ` +
        `when the user has asked you to — it is optional, paid work; never start ` +
        `it unprompted or as a side-effect of an unrelated change. Always keep the ` +
        `baseline meta. If you have not offered it before, you may offer once and ` +
        `then wait.`,
    );
  }

  if (prior.length > 0) {
    const transcript = prior
      .map((m) => {
        const speaker = m.role === "assistant" ? "Assistant" : "User";
        const text =
          m.content.length > HISTORY_MAX_CHARS_PER_MESSAGE
            ? m.content.slice(0, HISTORY_MAX_CHARS_PER_MESSAGE) + " […truncated]"
            : m.content;
        return `${speaker}: ${text}`;
      })
      .join("\n\n");
    sections.push(
      `## Conversation so far\n` +
        `This is the ongoing history of this project. Read it, then treat the new ` +
        `request below as the next step — iterate on the existing files rather ` +
        `than starting over.\n\n` +
        transcript,
    );
  }

  sections.push(`## New request\n${currentPrompt}`);
  return sections.join("\n\n");
}

// --- First-prompt concept interview ------------------------------------------

type InterviewInput = {
  messageId: string;
  skip: boolean;
  selections: Record<string, string>;
  /** v2 answers pick a style; v1 (legacy pending rows) pick a palette. */
  styleId: string;
  paletteId: string;
};

/** Extracts and type-checks the `interview` request variant; null if absent. */
function parseInterviewInput(body: unknown): InterviewInput | null {
  const raw = (body as { interview?: unknown } | null)?.interview;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.messageId !== "string" || r.messageId === "") return null;

  const selections: Record<string, string> = {};
  if (r.selections && typeof r.selections === "object") {
    for (const [key, value] of Object.entries(
      r.selections as Record<string, unknown>,
    )) {
      if (typeof value === "string") selections[key] = value;
    }
  }
  return {
    messageId: r.messageId,
    skip: r.skip === true,
    selections,
    styleId: typeof r.styleId === "string" ? r.styleId : "",
    paletteId: typeof r.paletteId === "string" ? r.paletteId : "",
  };
}

/**
 * Validates the submitted answers against the pending interview card, persists
 * the answered/skipped state on the SAME message row, writes the chosen (or,
 * on skip, a system-picked) style's design DNA to /DESIGN.md, and returns the
 * build turn's prompt. The in-memory `history` row keeps its pending content
 * on purpose: this turn's transcript then omits the card, so the answers
 * appear exactly once (in "New request"); later turns re-read the row as
 * answered. Legacy v1 rows (palette interviews from before the style-world
 * upgrade) keep their original palette flow and never touch /DESIGN.md.
 */
async function resolveInterviewTurn(
  projectId: string,
  history: { id: string; content: string; kind: string | null }[],
  input: InterviewInput,
): Promise<{ prompt: string } | { error: string; status: number }> {
  const row = history.find(
    (m) => m.id === input.messageId && m.kind === "interview",
  );
  if (!row) return { error: "interview_not_found", status: 400 };
  const state = parseInterviewState(row.content);
  if (!state) return { error: "interview_invalid", status: 400 };
  if (state.status !== "pending") {
    return { error: "interview_not_pending", status: 409 };
  }

  if (input.skip) {
    state.status = "skipped";
  } else if (state.v === 1) {
    if (!validateAnswersV1(state.spec, input.selections, input.paletteId)) {
      return { error: "interview_invalid_answers", status: 400 };
    }
    state.status = "answered";
    state.answers = {
      selections: input.selections,
      paletteId: input.paletteId,
    };
  } else {
    if (!validateAnswers(state.spec, input.selections, input.styleId)) {
      return { error: "interview_invalid_answers", status: 400 };
    }
    state.status = "answered";
    state.answers = {
      selections: input.selections,
      styleId: input.styleId,
    };
  }
  await updateMessageContent(row.id, projectId, JSON.stringify(state));

  // Persist the design DNA before the build turn (the prompt is assembled
  // after this, so the fresh /DESIGN.md is already injected). On skip the
  // server picks one of the generated, project-fitted directions — skipping
  // means "no preference", not "give me the generic AI look".
  let designWritten = false;
  if (state.v === 2) {
    const style = input.skip
      ? state.spec.styles[Math.floor(Math.random() * state.spec.styles.length)]
      : (state.spec.styles.find((s) => s.id === input.styleId) ?? null);
    const world = style ? getWorld(style.worldId) : null;
    if (style && world) {
      await writeFile(
        projectId,
        DESIGN_PATH,
        composeDesignMd(world, style, { systemChosen: input.skip }),
      );
      designWritten = true;
    }
  }

  return {
    prompt: input.skip
      ? buildSkipPrompt(designWritten)
      : buildAnswersPrompt(state),
  };
}

/** Marks any still-pending interview card as skipped (user typed past it). */
async function skipPendingInterviews(
  projectId: string,
  history: { id: string; content: string; kind: string | null }[],
) {
  for (const m of history) {
    if (m.kind !== "interview") continue;
    const state = parseInterviewState(m.content);
    if (!state || state.status !== "pending") continue;
    state.status = "skipped";
    await updateMessageContent(m.id, projectId, JSON.stringify(state));
  }
}

/**
 * Generates the interview for the project's first prompt, persists it as an
 * assistant message (kind 'interview'), bills the call, and streams it to the
 * client. Returns false when generation failed — the caller then proceeds
 * with a normal build turn.
 */
async function runInterviewPhase({
  userId,
  projectId,
  message,
  send,
}: {
  userId: string;
  projectId: string;
  message: string;
  send: (event: unknown) => void;
}): Promise<boolean> {
  // Tell the client to show the "generating design suggestions" indicator
  // immediately — generation is one LLM call that can take a few seconds.
  send({ type: "interview_generating" });
  const attachmentNames = (await listAttachments(projectId)).map(
    (a) => a.filename,
  );
  // The dice roll: which style worlds (and which in-world variation) this
  // project gets offered at all. Real server entropy, STRATIFIED across
  // registers so a B2B request always has professional options to be offered
  // and a playful one always has expressive ones — see lib/design-worlds.
  const candidates = sampleInterviewCandidates(6);
  const generated = await generateInterview(message, attachmentNames, candidates);
  if (!generated) return false;

  const state = {
    v: 2 as const,
    status: "pending" as const,
    spec: generated.spec,
    answers: null,
  };
  const row = await addMessage(
    projectId,
    "assistant",
    JSON.stringify(state),
    undefined,
    "interview",
  );
  send({ type: "interview", id: row.id, spec: generated.spec });

  // Bill the generation call. Isolated like the build billing — a billing
  // failure must not lose the interview that was already sent.
  const { usage } = generated;
  const usedTokens =
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadTokens +
    usage.cacheCreationTokens;
  if (usedTokens > 0) {
    try {
      const { model: configuredModel } = await modelForTask("interview");
      const cost = await computeBilledEur(
        generated.model,
        usage,
        configuredModel,
      );
      const newBalanceEur = await recordUsageAndDeduct({
        userId,
        projectId,
        task: "interview",
        model: generated.model,
        provider: cost.provider,
        usage,
        cost,
      });
      send({
        type: "usage",
        model: generated.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        billedEur: cost.billedEur,
        balanceEur: newBalanceEur,
      });
    } catch (billingError) {
      console.error("[agent] interview billing failed", billingError);
    }
  }
  return true;
}
