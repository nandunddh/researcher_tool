/** Groups list items by one text field, keeping the order the organiser wrote them in. */
export type Row<T> = { index: number; data: T };
export type Group<T> = { label: string; rows: Row<T>[] };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Items with the same field text share a group; a group sits where its first item was. Items without the field form one unnamed group. */
export function groupByField<T extends Record<string, unknown>>(items: T[], field: string): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  items.forEach((data, index) => {
    const label = text(data[field]);
    const group = groups.get(label) ?? { label, rows: [] };
    group.rows.push({ index, data });
    groups.set(label, group);
  });
  return [...groups.values()];
}
