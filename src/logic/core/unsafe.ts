/** Nesting deeper than this is refused (a real file is about five levels deep). */
export const MAX_JSON_DEPTH = 64;

export type UnsafeFinding = { kind: 'key'; path: string } | { kind: 'deep'; path: string };

/**
 * Looks for pollution keys anywhere in a parsed JSON tree, and for nesting beyond `MAX_JSON_DEPTH`.
 * Iterative (explicit stack), so a file nested 100 000 levels deep cannot overflow the call stack.
 * `path` is like `.rules[0].__proto__`; the order is the one of a depth-first walk.
 */
export function findUnsafe(root: unknown, forbidden: readonly string[]): UnsafeFinding | null {
  const stack: { v: unknown; path: string; depth: number }[] = [{ v: root, path: '', depth: 0 }];
  while (stack.length > 0) {
    const { v, path, depth } = stack.pop() as { v: unknown; path: string; depth: number };
    if (typeof v !== 'object' || v === null) continue;
    if (depth > MAX_JSON_DEPTH) return { kind: 'deep', path };
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) {
        stack.push({ v: v[i], path: `${path}[${i}]`, depth: depth + 1 });
      }
    } else {
      const keys = Object.keys(v);
      // forbidden keys of this level first (they are reported before anything below them)
      for (const k of keys) if (forbidden.includes(k)) return { kind: 'key', path: `${path}.${k}` };
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i] as string;
        stack.push({
          v: (v as Record<string, unknown>)[k],
          path: `${path}.${k}`,
          depth: depth + 1,
        });
      }
    }
  }
  return null;
}

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
