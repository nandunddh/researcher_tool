"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} className={wide ? "modal wide" : "modal"} aria-labelledby="dialog-title" onCancel={onClose}>
    <header className="modal-head"><h2 id="dialog-title">{title}</h2><button onClick={onClose} className="icon-button" aria-label="Close"><Icon name="close" /></button></header>
    <div className="modal-body">{children}</div>
  </dialog>;
}
