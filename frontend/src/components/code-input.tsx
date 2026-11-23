"use client";
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/** A one-time code as separate boxes, one digit each. Typing moves on by itself, Backspace goes back, a pasted or
 *  auto-filled code spreads over the boxes, and onComplete runs once when the last digit is in.
 *  A hidden field named `name` carries the value, so it also works inside a normal <form>. */
export function CodeInput({ value, onChange, onComplete, length = 6, name = "code", disabled = false, autoFocus = false, label = "6-digit code", invalid = false }: {
  value: string; onChange: (next: string) => void; onComplete?: (code: string) => void;
  length?: number; name?: string; disabled?: boolean; autoFocus?: boolean; label?: string; invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const done = useRef(false);

  useEffect(() => {
    if (value.length === length) {
      if (!done.current) { done.current = true; onComplete?.(value); }
    } else done.current = false;
  }, [value, length, onComplete]);
  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);
  // After a wrong code the parent clears the value: put the cursor back on the first box.
  const before = useRef(value);
  useEffect(() => {
    if (before.current.length === length && value === "" && !disabled) refs.current[0]?.focus();
    before.current = value;
  }, [value, disabled, length]);

  const digits = value.padEnd(length, " ").split("");
  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  const fill = (from: number, text: string) => {
    const typed = text.replace(/\D/g, "");
    if (!typed) return;
    const next = (value.slice(0, from) + typed).slice(0, length);
    onChange(next);
    focus(Math.min(next.length, length - 1));
  };
  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i] !== " ") onChange(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) { onChange(value.slice(0, i - 1) + value.slice(i)); focus(i - 1); }
    } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
  };
  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); fill(i, e.clipboardData.getData("text")); };

  return (
    <div className="code-boxes" role="group" aria-label={label} data-code-input="" data-invalid={invalid || undefined}>
      {digits.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }} value={d === " " ? "" : d} inputMode="numeric" pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1} of ${length}`} disabled={disabled}
          onChange={e => fill(i, e.target.value)} onKeyDown={e => onKeyDown(i, e)} onPaste={e => onPaste(i, e)} onFocus={e => e.target.select()} />
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
