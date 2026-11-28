"use client";
import { useState } from "react";
import type { Template } from "@/lib/contracts";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icon";
export function Templates({ templates, onUse, onClose }: { templates: Template[]; onUse: (id: string) => void; onClose: () => void }) {
  const [preview, setPreview] = useState<Template | null>(null);
  return <Modal wide title={preview ? preview.name : "Explore templates"} onClose={onClose}>
    {preview ? <><div className="toolbar"><button onClick={() => setPreview(null)}><Icon name="arrow" />All templates</button><button className="primary" onClick={() => onUse(preview.id)}>Use template</button></div><iframe className="template-preview" title={`${preview.name} preview`} sandbox="" src={`/studio-templates/${encodeURIComponent(preview.id)}`} /></> : <><p>Preview a design, then make it yours.</p><div className="template-grid">{templates.map(template => <article className="template-card" key={template.id}>
      <div className="thumbnail">{template.id === "blank" ? <div className="blank-preview"><Icon name="plus" size={36} /></div> : <iframe loading="lazy" title={`${template.name} thumbnail`} tabIndex={-1} sandbox="allow-same-origin" scrolling="no" src={`/studio-templates/${encodeURIComponent(template.id)}`} />}</div>
      <div className="card-content"><small>{template.category}{template.page_count ? ` · ${template.page_count} page${template.page_count > 1 ? "s" : ""}` : ""}</small><h3>{template.name}</h3><p>{template.description}</p><div className="actions"><button onClick={() => setPreview(template)}>Preview</button><button className="primary" onClick={() => onUse(template.id)}>Use template</button></div></div>
    </article>)}</div></>}
  </Modal>;
}
