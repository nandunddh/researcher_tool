/** Numbers that count up when they scroll into view: "60+" counts to 60 and keeps the "+", "1,200" keeps its comma. */
export type CountUp = { value: number; format: (n: number) => string };

export function countUpTarget(text: string): CountUp | null {
  const match = /^(\D{0,3}?)(\d{1,3}(?:,\d{3})+|\d{1,7})(\D{0,12})$/.exec(text.trim());
  if (!match) return null;
  const [, before, digits, after] = match;
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 2) return null;
  const grouped = digits.includes(",");
  return { value, format: n => `${before}${grouped ? n.toLocaleString("en-US") : String(n)}${after}` };
}
