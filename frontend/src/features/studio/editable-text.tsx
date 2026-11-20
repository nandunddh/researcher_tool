"use client";
import { createElement, useEffect, useRef, useState } from "react";

/** Minimal editing contract EditableText needs (EditHooks satisfies it). */
type EditMode = { readOnly: boolean };

/** Plain text for visitors; in the editor, double-click to edit it in place. */
export function EditableText({ tag, value, placeholder, edit, multiline, onCommit, ...rest }: {
  tag: string; value: string; placeholder: string; edit?: EditMode; multiline?: boolean;
  onCommit: (text: string) => void; [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [active]);
  const canEdit = !!edit && !edit.readOnly;
  return createElement(tag, {
    ...rest,
    ref,
    "data-placeholder": edit ? `Add ${placeholder}` : undefined,
    contentEditable: active ? "plaintext-only" : undefined,
    suppressContentEditableWarning: true,
    title: canEdit && !active ? "Double-click to edit text" : undefined,
    onDoubleClick: canEdit ? () => setActive(true) : undefined,
    onBlur: active ? () => {
      setActive(false);
      const next = (ref.current?.innerText ?? value).replace(/ /g, " ");
      if (next !== value) onCommit(multiline ? next : next.replace(/\s*\n\s*/g, " ").trim());
    } : undefined,
    onKeyDown: active ? (e: KeyboardEvent & { currentTarget: HTMLElement; preventDefault(): void }) => {
      if (e.key === "Escape") { e.currentTarget.textContent = value; e.currentTarget.blur(); }
      else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.blur(); }
    } : undefined,
  }, value);
}

