"use client";
/**
 * One renderer for SciStudio pages. The editor canvas passes `edit` to add selection
 * and in-place text editing; without it the output is the visitor-facing page.
 */
import { themeVariables } from "./studio-theme";
import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { EditableText } from "./editable-text";
import { Icon } from "@/components/icon";
import { SectionBlock, hasBlock } from "./section-blocks";
import type { Section } from "./document";
import {
  buildSiteCss, getElements, linkHref, safeImage, sectionAnchor,
  type LinkContext, type MenuItem, type PageRef, type SiteElement,
} from "./site-schema";
import styles from "./site-renderer.module.css";

/** Data type used when dragging a library design onto the canvas. */
export const COMPONENT_MIME = "application/x-scistudio-component";
export type CanvasSelection = { sectionId: string; elementId?: string; path?: string };
export type EditHooks = {
  selection: CanvasSelection | null;
  readOnly: boolean;
  onSelect: (selection: CanvasSelection) => void;
  onText: (sectionId: string, elementId: string, text: string) => void;
  /** In-place edit of a value inside a content section's data. */
  onField?: (sectionId: string, path: (string | number)[], text: string) => void;
  onFormFields?: (sectionId: string, action: string | { from: number; to: number }) => void;
  dragging?: string | null;
  onDropSection?: (beforeId: string) => void;
  /** Drag and drop on the canvas: move sections by their handle, drop library designs between sections. */
  dropTarget?: string | null;
  onDragSection?: (id: string | null) => void;
  onDragHover?: (id: string | null) => void;
  onDropComponent?: (itemId: string, beforeId: string | null) => void;
};
/** Draws sections the renderer has no element design for yet (library previews). */
export type RenderFallback = (section: Section) => ReactNode;

const labels: Record<string, string> = {
  logo: "brand name", eyebrow: "small label", headline: "headline", subheadline: "description",
  cta: "button text", primary: "button text", secondary: "second button text",
};

/** `mirror` draws a second copy of an element (the mobile menu): no editor hooks and no data-* ids, so ids stay unique. */
function ElementView({ element, section, ctx, edit, mirror = false }: { element: SiteElement; section: Section; ctx: LinkContext; edit?: EditHooks; mirror?: boolean }) {
  const selected = edit?.selection?.elementId === element.id;
  const onClick = edit ? (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); edit.onSelect({ sectionId: section.id, elementId: element.id }); } : undefined;
  const common = mirror ? {} : {
    "data-el": element.id,
    "data-kind": element.kind,
    "data-role": element.role,
    ...(edit ? { "data-editable": true, "data-selected": selected || undefined, onClick } : {}),
  };
  const textValue = element.text ?? "";
  const editable = (tag: string, className?: string, multiline = false) => (
    <EditableText key={`${element.id}:${textValue}`} tag={tag} className={className} value={textValue} edit={edit}
      multiline={multiline} placeholder={labels[element.role ?? ""] ?? "text"}
      onCommit={text => edit?.onText(section.id, element.id, text)} {...common} />
  );
  const href = linkHref(element.link, ctx);
  const newTab = element.link?.type === "url" && element.link.newTab;

  switch (element.kind) {
    case "logo": {
      const src = element.mode === "image" ? safeImage(element.src) : undefined;
      if (src) return <span className={styles.logo} {...common}><img src={src} alt={element.alt || element.text || "Logo"} /></span>;
      if (!textValue && !edit) return null;
      return editable("span", styles.logo);
    }
    case "heading":
      if (!textValue && !edit) return null;
      return editable(element.role === "headline" ? "h1" : "h2", styles.heading);
    case "text":
      if (!textValue && !edit) return null;
      return editable(element.role === "eyebrow" ? "small" : "p", element.role === "eyebrow" ? styles.eyebrow : styles.text, true);
    case "button":
      if (!textValue && !edit) return null;
      return (
        <a className={`${styles.button} ${element.role === "secondary" ? styles.secondary : ""}`} href={edit ? undefined : href}
          {...(newTab && !edit ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          {...(mirror ? {} : { "data-el": element.id, "data-kind": "button", "data-role": element.role })}
          {...(edit ? { "data-editable": true, "data-selected": selected || undefined, onClick } : {})}>
          <EditableText key={`${element.id}:${textValue}`} tag="span" value={textValue} edit={edit}
            placeholder={labels[element.role ?? ""] ?? "button text"} onCommit={text => edit?.onText(section.id, element.id, text)} />
        </a>
      );
    case "image": {
      const src = safeImage(element.src);
      if (src) return <img className={styles.image} src={src} alt={element.alt ?? ""} loading="lazy" {...common} />;
      // Same-size placeholder everywhere, so the layout does not change until an image is added.
      return <div className={styles.imagePlaceholder} data-public={edit ? undefined : true} {...common}>{edit ? "Add an image" : <Icon name="layers" size={36} />}</div>;
    }
    case "menu":
      return (
        <nav className={styles.menu} aria-label={mirror ? "Menu" : "Main navigation"} {...common}>
          <ul>
            {(element.items ?? []).map(item => {
              const anchor = (entry: MenuItem, label = entry.label) => {
                const entryTab = entry.link?.type === "url" && entry.link.newTab;
                return <a href={edit ? undefined : linkHref(entry.link, ctx)} {...(entryTab && !edit ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{label || (edit ? "Untitled link" : "")}</a>;
              };
              if (!item.children?.length) return <li key={item.id}>{anchor(item)}</li>;
              return (
                <li key={item.id}>
                  {/* A small menu that opens on click or Enter without scripts; the page script closes it on outside click or Escape. */}
                  <details data-submenu>
                    <summary>{item.label || (edit ? "Untitled link" : "Menu")}</summary>
                    <ul className={styles.submenu}>
                      {item.link && <li>{anchor(item)}</li>}
                      {item.children.map(child => <li key={child.id}>{anchor(child)}</li>)}
                    </ul>
                  </details>
                </li>
              );
            })}
            {edit && !element.items?.length && <li className={styles.muted}>Add links in the panel</li>}
          </ul>
        </nav>
      );
  }
}

function SectionView({ section, ctx, edit, fallback }: { section: Section; ctx: LinkContext; edit?: EditHooks; fallback?: RenderFallback }) {
  const elements = getElements(section);
  const layout = typeof section.data.layout_variant === "string" ? section.data.layout_variant : "";
  const sectionProps = {
    id: sectionAnchor(section),
    "data-section": section.id,
    "data-type": section.type,
    "data-layout": layout || undefined,
    ...(edit ? {
      "data-selected": (edit.selection?.sectionId === section.id && !edit.selection.elementId) || undefined,
      onClick: () => edit.onSelect({ sectionId: section.id }),
      "data-drop-target": edit.dropTarget === section.id || undefined,
      onDragOver: (e: React.DragEvent) => {
        if (!edit.dragging && !e.dataTransfer.types.includes(COMPONENT_MIME)) return;
        e.preventDefault(); e.stopPropagation();
        if (edit.dropTarget !== section.id) edit.onDragHover?.(section.id);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        const item = e.dataTransfer.getData(COMPONENT_MIME);
        if (item) edit.onDropComponent?.(item, section.id); else edit.onDropSection?.(section.id);
      },
    } : {}),
  };
  const handle = edit && !edit.readOnly ? (
    <span className={styles.dragHandle} draggable title="Drag to move this section" aria-hidden="true"
      onClick={e => e.stopPropagation()}
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", section.id); edit.onDragSection?.(section.id); }}
      onDragEnd={() => edit.onDragSection?.(null)}>⠿ Move</span>
  ) : null;
  if (section.hidden === true && !edit) return null;
  if (!elements && hasBlock(section.type)) {
    return (
      <section className={styles.block} data-hidden={section.hidden === true || undefined} {...sectionProps}>{handle}
        <SectionBlock section={section} ctx={ctx} edit={edit} />
        {edit && section.hidden === true && <span className={styles.classicBadge}>Hidden from visitors</span>}
      </section>
    );
  }
  if (!elements) {
    const preview = fallback?.(section);
    if (!edit) return preview ? <section className={styles.preservedPreview} {...sectionProps}>{handle}{preview}</section> : null;
    return (
      <section className={preview ? styles.preservedPreview : styles.preserved} {...sectionProps}>{handle}
        {preview ?? <>
          <strong>{section.title || section.type}</strong>
          <p>This section keeps its current design.</p>
        </>}
        <span className={styles.classicBadge}>Design preview · editing coming soon</span>
      </section>
    );
  }
  const slot = (name: string, mirror = false): ReactNode[] =>
    elements.filter(e => e.slot === name).map(e => <ElementView key={e.id} element={e} section={section} ctx={ctx} edit={mirror ? undefined : edit} mirror={mirror} />);

  if (section.type === "navbar") {
    return (
      <header className={styles.navbar} data-collapsible={!edit || undefined} {...sectionProps}>{handle}
        <div className={styles.brand}>{slot("brand")}</div>
        <div className={styles.links}>{slot("links")}</div>
        <div className={styles.actions}>{slot("actions")}</div>
        {!edit && (
          // Small screens: the links and buttons move into a menu that opens without scripts (so it also works in a downloaded site).
          <details className={styles.mobileMenu}>
            <summary><span aria-hidden="true">☰</span> Menu</summary>
            <div className={styles.mobilePanel}>{slot("links", true)}{slot("actions", true)}</div>
          </details>
        )}
      </header>
    );
  }
  const image = elements.find(e => e.slot === "media");
  const hasImage = layout !== "text_only" && !!image;
  return (
    <section className={styles.hero} data-has-image={hasImage || undefined} {...sectionProps}>{handle}
      <div className={styles.heroContent}>
        {slot("content")}
        <div className={styles.heroActions}>{slot("actions")}</div>
      </div>
      {hasImage && <div className={styles.heroMedia}>{slot("media")}</div>}
    </section>
  );
}

export function SiteRenderer({ themeConfig, sections, pages, siteSlug, siteId, edit, fallback, pagePath, event }: {
  themeConfig?: unknown; event?: unknown; sections: Section[]; pages?: PageRef[]; siteSlug?: string; siteId?: string; edit?: EditHooks; fallback?: RenderFallback;
  /** Where links to other pages point (the preview keeps them inside the preview). */
  pagePath?: (page: PageRef) => string;
}) {
  const css = useMemo(() => buildSiteCss(sections), [sections]);
  const root = useRef<HTMLDivElement>(null);
  // Open sub-menus close on a click elsewhere, after following a link, and with Escape (focus returns to the menu name).
  useEffect(() => {
    const site = root.current;
    if (!site) return;
    const openMenus = () => site.querySelectorAll<HTMLDetailsElement>("details[data-submenu][open]");
    const onClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const keep = target && !target.closest("a") ? target.closest("details[data-submenu]") : null;
      openMenus().forEach(menu => { if (menu !== keep) menu.open = false; });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const current = document.activeElement instanceof Element ? document.activeElement.closest<HTMLDetailsElement>("details[data-submenu][open]") : null;
      openMenus().forEach(menu => { menu.open = false; });
      current?.querySelector("summary")?.focus();
    };
    document.addEventListener("click", onClick);
    site.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); site.removeEventListener("keydown", onKey); };
  }, []);
  const ctx = useMemo(() => ({ sections, pages, siteSlug, siteId, pagePath, event: event && typeof event === "object" ? event as Record<string, unknown> : undefined }),
    [sections, pages, siteSlug, siteId, pagePath, event]);
  return (
    <div ref={root} className={styles.site} style={themeVariables(themeConfig) as CSSProperties} data-editing={edit ? true : undefined}>
      <style>{css}</style>
      {sections.map(section => <SectionView key={section.id} section={section} ctx={ctx} edit={edit} fallback={fallback} />)}
      {edit?.dragging && (
        <div data-drop-end data-drop-target={edit.dropTarget === "__end" || undefined}
          onDragOver={e => { e.preventDefault(); if (edit.dropTarget !== "__end") edit.onDragHover?.("__end"); }}
          onDrop={e => { e.preventDefault(); const item = e.dataTransfer.getData(COMPONENT_MIME); if (item) edit.onDropComponent?.(item, null); else edit.onDropSection?.("__end"); }}>
          Drop here to place at the end
        </div>
      )}
    </div>
  );
}
