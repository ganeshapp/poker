/**
 * Tiny classNames helper (keeps the dep tree lean — no clsx).
 * Accepts strings, falsy values, and { className: boolean } maps.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>;

export function cx(...parts: ClassValue[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === "string" || typeof p === "number") {
      out.push(String(p));
    } else if (typeof p === "object") {
      for (const key in p) if (p[key]) out.push(key);
    }
  }
  return out.join(" ");
}
