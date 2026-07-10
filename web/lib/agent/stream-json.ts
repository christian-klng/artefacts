// Pulls the value of a string key out of a STILL-GROWING JSON object buffer —
// used by the agent route to reconstruct a write_file's `content` live from the
// model's `input_json_delta` chunks, so the code view can show the file being
// typed out (see app/api/agent/route.ts). Pure + dependency-free so it stays
// unit-testable (npm run check:stream), mirroring lib/appdb/sql.ts.

/**
 * Returns the de-escaped value of `key` in the partial JSON `buf` so far, or
 * null if the key/value hasn't started yet. Tolerant of a chunk boundary that
 * lands mid-string (no closing quote yet) or mid-escape (a dangling backslash /
 * incomplete `\uXXXX` at the buffer edge is dropped, reappearing once the rest
 * arrives). Assumes `key` occurs once (true for our tool argument objects).
 */
export function partialStringValue(buf: string, key: string): string | null {
  const marker = `"${key}"`;
  const ki = buf.indexOf(marker);
  if (ki === -1) return null;
  let i = buf.indexOf(":", ki + marker.length);
  if (i === -1) return null;
  i++;
  while (i < buf.length) {
    const c = buf.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) i++;
    else break;
  }
  if (buf.charCodeAt(i) !== 34 /* " */) return null; // value not a string / not started
  const start = i + 1;
  // Walk to the closing unescaped quote, skipping escape pairs. Stops at the end
  // of the buffer while the value is still streaming.
  let j = start;
  let end = -1;
  while (j < buf.length) {
    const c = buf.charCodeAt(j);
    if (c === 92 /* \ */) {
      j += 2; // skip the escaped char (may run past the edge — handled below)
      continue;
    }
    if (c === 34 /* " */) {
      end = j;
      break;
    }
    j++;
  }
  const closed = end !== -1;
  let raw = buf.slice(start, closed ? end : buf.length);
  if (!closed) raw = trimDanglingEscape(raw); // buffer edge may split an escape
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    // A malformed fragment (shouldn't happen with well-formed model output) —
    // skip this tick; the next, longer buffer parses.
    return "";
  }
}

/** Drops an incomplete escape at the very end of a still-streaming raw string. */
function trimDanglingEscape(raw: string): string {
  let backslashes = 0;
  for (let k = raw.length - 1; k >= 0 && raw.charCodeAt(k) === 92; k--) {
    backslashes++;
  }
  if (backslashes % 2 === 1) return raw.slice(0, -1); // lone trailing backslash
  const u = raw.match(/\\u[0-9a-fA-F]{0,3}$/); // incomplete \uXXXX
  if (u) return raw.slice(0, u.index);
  return raw;
}
