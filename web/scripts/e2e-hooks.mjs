// Node module-customization hooks that let the standalone E2E harness import the
// REAL Next route handlers + server libs (which use the `@/` path alias and the
// `server-only` marker) under plain `node` type-stripping. No bundler, no Next
// server: we call the production POST/GET functions directly.
//
//   node --import ./scripts/e2e-register.mjs scripts/publish-db-e2e.mjs
//
// - `@/x`        → <WEB>/x                       (the tsconfig "@/*" alias)
// - `server-only`→ empty module                 (the RSC marker, a no-op here)
// - `./x` (ours) → ./x.ts | ./x/index.ts …      (extensionless TS, which Node's
//                   native resolver won't add on its own)
// Bare specifiers (zod, pg, drizzle-orm, node:crypto) fall through to Node.

import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = process.env.E2E_WEB_DIR;
if (!WEB) throw new Error("E2E_WEB_DIR not set");

const CANDIDATES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

function resolveFile(absNoExt) {
  for (const suffix of CANDIDATES) {
    const p = absNoExt + suffix;
    try {
      if (statSync(p).isFile()) return pathToFileURL(p).href;
    } catch {
      // not this candidate
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "e2e-shim:server-only", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const url = resolveFile(`${WEB}/${specifier.slice(2)}`);
    if (url) return { url, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    // Only rewrite OUR extensionless TS imports; node_modules relatives resolve
    // normally via nextResolve. Try Node first, fall back to our TS resolution.
    try {
      return await nextResolve(specifier, context);
    } catch (e) {
      const abs = fileURLToPath(new URL(specifier, context.parentURL));
      const url = resolveFile(abs);
      if (url) return { url, shortCircuit: true };
      throw e;
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "e2e-shim:server-only") {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return nextLoad(url, context);
}
