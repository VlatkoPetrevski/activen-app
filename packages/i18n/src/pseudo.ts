/**
 * Pseudo-localization for layout testing: accents Latin letters and pads text by ~35 % (typical
 * expansion of translations) while leaving ICU syntax and placeholders untouched.
 * "Training Load" → "[Ŧřȧȧíñíñĝ Ŀöȧȧđ ~~~~~]".
 */
const MAP: Record<string, string> = {
  a: "ȧ",
  b: "ƀ",
  c: "ç",
  d: "đ",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ķ",
  l: "ĺ",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: "ʠ",
  r: "ř",
  s: "ŝ",
  t: "ŧ",
  u: "ü",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Ȧ",
  B: "Ɓ",
  C: "Ç",
  D: "Đ",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ķ",
  L: "Ŀ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ö",
  P: "Þ",
  Q: "Ǫ",
  R: "Ř",
  S: "Ŝ",
  T: "Ŧ",
  U: "Ü",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

export function pseudoLocalize(message: string): string {
  let depth = 0;
  let out = "";
  let letters = 0;
  for (const ch of message) {
    if (ch === "{") depth += 1;
    if (depth === 0 || (depth % 2 === 0 && ch !== "}")) {
      // Text outside placeholders, or inside a plural/select branch ({count, plural, one {…}}).
      const mapped = MAP[ch];
      if (mapped) letters += 1;
      out += mapped ?? ch;
    } else {
      out += ch;
    }
    if (ch === "}") depth -= 1;
  }
  return `[${out} ${"~".repeat(Math.max(1, Math.ceil(letters * 0.35)))}]`;
}

/** A whole catalog in pseudo form (e.g. served as locale "en-XA" in development builds). */
export function pseudoCatalog<T extends Record<string, string>>(
  catalog: T,
): Record<keyof T, string> {
  return Object.fromEntries(
    Object.entries(catalog).map(([k, v]) => [k, pseudoLocalize(v)]),
  ) as Record<keyof T, string>;
}
