import { groupByField } from "./grouping";

/** Groups a schedule's sessions by day, keeping the order the organiser wrote them in. */
export type SessionRow = { index: number; data: Record<string, unknown> };
export type DayGroup = { day: string; sessions: SessionRow[] };

export function groupByDay(sessions: Record<string, unknown>[]): DayGroup[] {
  return groupByField(sessions, "day").map(({ label, rows }) => ({ day: label, sessions: rows }));
}
