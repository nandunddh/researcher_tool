/** Groups a schedule's sessions by day, keeping the order the organiser wrote them in. */
export type SessionRow = { index: number; data: Record<string, unknown> };
export type DayGroup = { day: string; sessions: SessionRow[] };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Sessions with the same day text share a group; the group sits where its first session was. Sessions without a day form one unnamed group. */
export function groupByDay(sessions: Record<string, unknown>[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  sessions.forEach((data, index) => {
    const day = text(data.day);
    const group = groups.get(day) ?? { day, sessions: [] };
    group.sessions.push({ index, data });
    groups.set(day, group);
  });
  return [...groups.values()];
}
