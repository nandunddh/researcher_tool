"use client";
/**
 * One renderer for SciStudio pages. The editor canvas passes `edit` to add selection
 * and in-place text editing; without it the output is the visitor-facing page.
 */
import { useMemo, type MouseEvent, type ReactNode } from "react";
import { EditableText } from "./editable-text";
import { Icon } from "@/components/icon";
import { SectionBlock, hasBlock } from "./section-blocks";
import type { Section } from "./document";
import {
  buildSiteCss, getElements, linkHref, safeImage, sectionAnchor,
  type LinkContext, type PageRef, type SiteElement,
} from "./site-schema";
import styles from "./site-renderer.module.css";

export type CanvasSelection = { sectionId: string; elementId?: string };
export type EditHooks = {
  selection: CanvasSelection | null;
  readOnly: boolean;
  onSelect: (selection: CanvasSelection) => void;
  onText: (sectionId: string, elementId: string, text: string) => void;
  /** In-place edit of a value inside a content section's data. */
  onField?: (sectionId: string, path: (string | number)[], text: string) => void;
  dragging?: string | null;
  onDropSection?: (beforeId: string) => void;
};
/** Draws sections the renderer has no element design for yet (library previews). */
export type RenderFallback = (section: Section) => ReactNode;

const labels: Record<string, string> = {
  logo: "brand name", eyebrow: "small label", headline: "headline", subheadline: "description",
  cta: "button text", primary: "button text", secondary: "second button text",
};

function ElementView({ element, section, ctx, edit }: { element: SiteElement; section: Section; ctx: LinkContext; edit?: EditHooks }) {
  const selected = edit?.selection?.elementId === element.id;
  const common = {
    "data-el": element.id,
    "data-kind": element.kind,
    "data-role": element.role,
    ...(edit ? {
      "data-editable": true,
      "data-selected": selected || undefined,
      onClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); edit.onSelect({ sectionId: section.id, elementId: element.id }); },
    } : {}),
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
          data-el={element.id} data-kind="button" data-role={element.role}
          {...(edit ? { "data-editable": true, "data-selected": selected || undefined, onClick: common.onClick } : {})}>
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
        <nav className={styles.menu} aria-label="Main navigation" {...common}>
          <ul>
            {(element.items ?? []).map(item => {
              const itemHref = linkHref(item.link, ctx);
              const itemTab = item.link?.type === "url" && item.link.newTab;
              return <li key={item.id}><a href={edit ? undefined : itemHref} {...(itemTab && !edit ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{item.label || (edit ? "Untitled link" : "")}</a></li>;
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
      onDragOver: (e: React.DragEvent) => { if (edit.dragging) e.preventDefault(); },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); edit.onDropSection?.(section.id); },
    } : {}),
  };
  if (section.hidden === true && !edit) return null;
  if (!elements && hasBlock(section.type)) {
    return (
      <section className={styles.block} data-hidden={section.hidden === true || undefined} {...sectionProps}>
        <SectionBlock section={section} ctx={ctx} edit={edit} />
        {edit && section.hidden === true && <span className={styles.classicBadge}>Hidden from visitors</span>}
      </section>
    );
  }
  if (!elements) {
    const preview = fallback?.(section);
    if (!edit) return preview ? <section className={styles.preservedPreview} {...sectionProps}>{preview}</section> : null;
    return (
      <section className={preview ? styles.preservedPreview : styles.preserved} {...sectionProps}>
        {preview ?? <>
          <strong>{section.title || section.type}</strong>
          <p>This section keeps its current design.</p>
        </>}
        <span className={styles.classicBadge}>Design preview · editing coming soon</span>
      </section>
    );
  }
  const slot = (name: string): ReactNode[] =>
    elements.filter(e => e.slot === name).map(e => <ElementView key={e.id} element={e} section={section} ctx={ctx} edit={edit} />);

  if (section.type === "navbar") {
    return (
      <header className={styles.navbar} {...sectionProps}>
        <div className={styles.brand}>{slot("brand")}</div>
        <div className={styles.links}>{slot("links")}</div>
        <div className={styles.actions}>{slot("actions")}</div>
      </header>
    );
  }
  const image = elements.find(e => e.slot === "media");
  const hasImage = layout !== "text_only" && !!image;
  return (
    <section className={styles.hero} data-has-image={hasImage || undefined} {...sectionProps}>
      <div className={styles.heroContent}>
        {slot("content")}
        <div className={styles.heroActions}>{slot("actions")}</div>
      </div>
      {hasImage && <div className={styles.heroMedia}>{slot("media")}</div>}
    </section>
  );
}

export function SiteRenderer({ sections, pages, siteSlug, siteId, edit, fallback, pagePath }: {
  sections: Section[]; pages?: PageRef[]; siteSlug?: string; siteId?: string; edit?: EditHooks; fallback?: RenderFallback;
  /** Where links to other pages point (the preview keeps them inside the preview). */
  pagePath?: (page: PageRef) => string;
}) {
  const css = useMemo(() => buildSiteCss(sections), [sections]);
  const ctx = useMemo(() => ({ sections, pages, siteSlug, siteId, pagePath }), [sections, pages, siteSlug, siteId, pagePath]);
  return (
    <div className={styles.site} data-editing={edit ? true : undefined}>
      <style>{css}</style>
      {sections.map(section => <SectionView key={section.id} section={section} ctx={ctx} edit={edit} fallback={fallback} />)}
    </div>
  );
}
