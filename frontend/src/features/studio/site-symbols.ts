/** Outline symbols for visitor-facing pages (24x24 grid, drawn with a stroke). Separate from the editor's own interface icons. */
export const SYMBOLS = {
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3 3",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3 M9 21h6",
  users: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14a6.5 6.5 0 0 1 3.5 6",
  ticket: "M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z M14 7v10",
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c3 3.2 3 14.8 0 18 M12 3c-3 3.2-3 14.8 0 18",
  award: "M12 3a6 6 0 1 0 0 12a6 6 0 0 0 0-12z M8.5 14.5L7 21l5-3 5 3-1.5-6.5",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  circle: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  diamond: "M12 3l9 9-9 9-9-9z",
} as const;

export type SymbolName = keyof typeof SYMBOLS;
export const symbolNames = Object.keys(SYMBOLS) as SymbolName[];
export const isSymbol = (value: unknown): value is SymbolName => typeof value === "string" && Object.hasOwn(SYMBOLS, value);
/** The path for a saved symbol name; anything unknown falls back to a plain circle instead of drawing nothing. */
export const symbolPath = (value: unknown): string => SYMBOLS[isSymbol(value) ? value : "circle"];

/** Illustrations that can be added as a block. */
export const ILLUSTRATIONS = ["orbit"] as const;
export type Illustration = (typeof ILLUSTRATIONS)[number];
export const isIllustration = (value: unknown): value is Illustration => typeof value === "string" && (ILLUSTRATIONS as readonly string[]).includes(value);
