/**
 * Turns a YouTube or Vimeo address into a privacy-friendly embed address.
 * Only the video id is taken from what the organiser pasted; the embed address is always built here,
 * so a pasted link can never point the frame anywhere else.
 */
export type VideoEmbed = { provider: "youtube" | "vimeo"; src: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

/** "1h2m3s", "90s" or "90" -> seconds; anything else -> 0. */
function seconds(value: string | null): number {
  if (!value) return 0;
  if (/^\d{1,6}$/.test(value)) return Number(value);
  const match = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,5})s)?$/.exec(value);
  if (!match || !match[0]) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export function videoEmbed(raw: unknown): VideoEmbed | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let youtube: string | undefined;
  if (host === "youtu.be") youtube = parts[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    youtube = parts[0] === "watch" ? url.searchParams.get("v") ?? undefined
      : ["embed", "shorts", "live", "v"].includes(parts[0] ?? "") ? parts[1] : undefined;
  }
  if (youtube !== undefined) {
    if (!YOUTUBE_ID.test(youtube)) return null;
    const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${youtube}${start ? `?start=${start}` : ""}` };
  }

  let vimeo: string | undefined;
  if (host === "vimeo.com") vimeo = parts.find(part => VIMEO_ID.test(part));
  else if (host === "player.vimeo.com" && parts[0] === "video") vimeo = parts[1];
  if (vimeo !== undefined && VIMEO_ID.test(vimeo)) return { provider: "vimeo", src: `https://player.vimeo.com/video/${vimeo}?dnt=1` };
  return null;
}
