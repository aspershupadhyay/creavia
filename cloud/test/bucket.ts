// An in-memory stand-in for the Worker's R2 binding (the same calls lib/store.ts makes there), for tests that store files.
/** The R2 binding's surface, kept in a Map (keys exactly as the bucket would hold them). */
export function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  const meta = (key: string, v: Uint8Array) => ({
    key,
    size: v.length,
    etag: "e",
    httpEtag: '"e"',
    uploaded: new Date(),
    httpMetadata: {},
  });
  return {
    objects,
    async get(key: string) {
      const v = objects.get(key);
      return v ? { ...meta(key, v), body: new Response(v as BodyInit).body } : null;
    },
    async head(key: string) {
      const v = objects.get(key);
      return v ? meta(key, v) : null;
    },
    async put(key: string, v: Uint8Array | string) {
      objects.set(key, typeof v === "string" ? new TextEncoder().encode(v) : v);
    },
    async delete(keys: string | string[]) {
      for (const k of [keys].flat()) objects.delete(k);
    },
    async list({ prefix = "", delimiter }: { prefix?: string; delimiter?: string }) {
      const under = [...objects.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const dirs = new Set<string>();
      const files = [];
      for (const [k, v] of under) {
        const rest = k.slice(prefix.length);
        if (delimiter && rest.includes(delimiter)) dirs.add(prefix + rest.slice(0, rest.indexOf(delimiter) + 1));
        else files.push(meta(k, v));
      }
      return { objects: files, truncated: false, delimitedPrefixes: [...dirs] };
    },
  };
}
