// Deterministic, order-independent fingerprint of a project's virtual
// filesystem. Used purely for change detection — telling whether the LIVE files
// differ from the PUBLISHED snapshot, so the "Aktualisieren" affordance can show
// whether a re-publish is needed. Not a security/crypto hash.
//
// Lives outside `server-only` lib so the same function runs on the server (over
// a stored snapshot) and the client (over live in-memory files); both are
// plain `Record<path, content>`, so identical content yields an identical
// signature on both sides (cyrb53-style, V8/JS-deterministic).

// Builds the map that feeds filesSignature for a project that may contain binary
// assets. Text files contribute their content; binary files contribute a stable
// `binary:<hash>` marker (the server provides the hash, so the client never needs
// the bytes). Both sides build the SAME map → identical signature → correct
// publish-dirty detection even with embedded images.
export function canonicalSignatureMap(
  textFiles: Record<string, string>,
  assets: Record<string, { hash: string }>,
): Record<string, string> {
  const map: Record<string, string> = { ...textFiles };
  for (const [path, meta] of Object.entries(assets)) {
    map[path] = `binary:${meta.hash}`;
  }
  return map;
}

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
