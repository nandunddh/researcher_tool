/** "Prof. Amara Okafor" -> "AO": shown in place of a photo until one is added. Titles are skipped. */
export function initials(name: unknown): string {
  if (typeof name !== "string") return "";
  const words = name.trim().split(/\s+/).filter(word => !/^(prof|dr|mr|mrs|ms|mx|sir|dame)\.?$/i.test(word));
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined].map(word => word ? Array.from(word)[0] : "");
  return letters.join("").toLocaleUpperCase();
}
