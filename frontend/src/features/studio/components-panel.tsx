"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ComponentThumbnail } from "./component-library";
import { componentCatalog, filterComponents, type LibraryComponent, type LibraryGroup } from "./component-catalog";
import { instantiateComponent } from "./component-instance";
import { elementSections } from "./site-schema";
import styles from "./react-editor.module.css";

/** True when the new editor can edit this design item by item. */
export const editableIds = new Set(
  componentCatalog
    .filter(item => (elementSections as readonly string[]).includes(instantiateComponent(item).type))
    .map(item => item.id),
);

const groups: LibraryGroup[] = ["Sections", "Elements", "Assets"];

export function ComponentsPanel({ disabled, onAdd }: { disabled: boolean; onAdd: (item: LibraryComponent) => void }) {
  const [group, setGroup] = useState<LibraryGroup>("Sections");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const categories = useMemo(() => ["All", ...new Set(componentCatalog.filter(c => c.group === group).map(c => c.category))], [group]);
  const items = filterComponents("all", query, group, category)
    .sort((a, b) => Number(editableIds.has(b.id)) - Number(editableIds.has(a.id)));

  return (
    <div className={styles.components}>
      <label className={styles.search}>
        <Icon name="search" size={15} />
        <input type="search" placeholder="Search components" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search components" />
      </label>
      <div className={styles.tabs} role="tablist" aria-label="Component type">
        {groups.map(g => (
          <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => { setGroup(g); setCategory("All"); }}>{g}</button>
        ))}
      </div>
      <div className={styles.chips} aria-label="Category">
        {categories.map(c => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
      </div>
      <p className={styles.hint}>Click a design to add it below the selected section.</p>
      <ul className={styles.cards}>
        {items.map(item => {
          const editable = editableIds.has(item.id);
          return (
            <li key={item.id} className={styles.card} data-disabled={disabled || undefined}>
              {/* The preview contains its own buttons, so the card is a box with one
                  full-size Add button layered on top instead of a button wrapper. */}
              <div className={styles.cardThumb}><ComponentThumbnail item={item} /></div>
              <div className={styles.cardBody}>
                <strong>{item.name}</strong>
                <span className={styles.badge} data-editable={editable || undefined}>
                  {editable ? <><Icon name="check" size={12} /> Editable</> : "Preview · editing coming soon"}
                </span>
              </div>
              <span className={styles.cardAdd} aria-hidden="true"><Icon name="plus" size={14} /></span>
              <button type="button" className={styles.cardHit} disabled={disabled} onClick={() => onAdd(item)}
                aria-label={`Add ${item.name}`}
                title={editable ? "Fully editable" : "Added as a design preview. Editing its content is coming soon."} />
            </li>
          );
        })}
        {!items.length && <li className={styles.hint}>No components match “{query}”.</li>}
      </ul>
    </div>
  );
}
