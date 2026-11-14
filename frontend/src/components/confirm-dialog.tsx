"use client";
import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  title,
  description,
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const id = useId();

  useEffect(() => {
    previousFocus.current = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirm-symbol">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.3 3.9 2.1 18.1A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4m0 4h.01" />
        </svg>
      </div>
      <h2 id={id}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      <div className="confirm-actions">
        <button autoFocus disabled={busy} onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className="confirm-destructive"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? "Please wait..." : label}
        </button>
      </div>
    </dialog>
  );
}
