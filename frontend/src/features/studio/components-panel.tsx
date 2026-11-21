"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { ComponentThumbnail } from "./component-library";
import { componentCatalog, filterComponents, type LibraryComponent, type LibraryGroup } from "./component-catalog";
import { instantiateComponent } from "./component-instance";
import { useImportedDesigns } from "./design-library";
import { elementSections } from "./site-schema";
import { hasBlock } from "./section-blocks";
import { COMPONENT_MIME } from "./site-renderer";
import styles from "./react-editor.module.css";

/** True when the new editor can edit this design item by item. */
export const editableIds = new Set(
  componentCatalog
    .filter(item => { const type = instantiateComponent(item).type; return (elementSections as readonly string[]).includes(type) || hasBlock(type); })
    .map(item => item.id),
);

const isEditable = (item: LibraryComponent) => editableIds.has(item.id) || Boolean(item.preset);

const groups: LibraryGroup[] = ["Sections", "Elements", "Assets"];

export function ComponentsPanel({ disabled, onAdd, onDragItem }: { disabled: boolean; onAdd: (item: LibraryComponent) => void; onDragItem?: (id: string | null) => void }) {
  useImportedDesigns();
  const [group, setGroup] = useState<LibraryGroup>("Sections");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const categories = ["All", ...new Set(componentCatalog.filter(c => c.group === group).map(c => c.category))];
  const items = filterComponents("all", query, group, category)
    .sort((a, b) => Number(isEditable(b)) - Number(isEditable(a)));

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
          const editable = isEditable(item);
          return (
            <li key={item.id} className={styles.card} data-disabled={disabled || undefined} draggable={!disabled}
              onDragStart={e => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData(COMPONENT_MIME, item.id); onDragItem?.(item.id); }}
              onDragEnd={() => onDragItem?.(null)}>
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
