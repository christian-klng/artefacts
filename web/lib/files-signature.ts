// Deterministic, order-independent fingerprint of a project's virtual
// filesystem. Used purely for change detection — telling whether the LIVE files
// differ from the PUBLISHED snapshot, so the "Aktualisieren" affordance can show
// whether a re-publish is needed. Not a security/crypto hash.
//
// Lives outside `server-only` lib so the same function runs on the server (over
// a stored snapshot) and the client (over live in-memory files); both are
// plain `Record<path, content>`, so identical content yields an identical
// signature on both sides (cyrb53-style, V8/JS-deterministic).

export function filesSignature(files: Record<string, string>): string {
  const keys = Object.keys(files).sort();
  let h1 = 0xdeadbeef ^ keys.length;
  let h2 = 0x41c6ce57 ^ keys.length;

  const mix = (str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  };

  for (const k of keys) {
    mix(k);
    mix(":"); // path/content delimiter
    mix(files[k]);
    mix(";"); // entry delimiter
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
}
