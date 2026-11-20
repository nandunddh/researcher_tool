export type IconName = "grid" | "plus" | "arrow" | "power" | "search" | "layers" | "user" | "close" | "edit" | "external" | "eye" | "eye-off" | "bolt" | "doc" | "undo" | "redo" | "desktop" | "tablet" | "mobile" | "check" | "panel" | "sun" | "moon";
const paths: Record<IconName, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  plus: "M12 5v14 M5 12h14", arrow: "M19 12H5 M11 6l-6 6 6 6",
  power: "M12 2v10 M6 5a9 9 0 1 0 12 0", search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  layers: "M12 3 2 8l10 5 10-5-10-5z M2 12l10 5 10-5 M2 16l10 5 10-5",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3",
  close: "m6 6 12 12 M18 6 6 18", edit: "m16 3 5 5-12 12-6 1 1-6 12-12z",
  external: "M14 3h7v7 M21 3 11 13 M10 3H4v17h17v-6",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  "eye-off": "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  doc: "M3 4h18v16H3z M7 9h10 M7 14h6",
  undo: "M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3", redo: "m15 14 5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3",
  desktop: "M3 4h18v12H3z M8 20h8 M12 16v4", tablet: "M6 2h12v20H6z M11 18h2", mobile: "M8 2h8v20H8z M11 18h2",
  check: "m5 12 5 5 9-10", panel: "M3 4h18v16H3z M9 4v16",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
