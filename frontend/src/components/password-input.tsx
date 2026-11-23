"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./icon";

/** A password field with a Show / Hide button. "auth" matches the dark sign-in screens, "app" the light workspace dialogs. */
export function PasswordInput({ variant = "app", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { variant?: "auth" | "app" }) {
  const [shown, setShown] = useState(false);
  const label = shown ? "Hide password" : "Show password";
  return (
    <div className={variant === "auth" ? "input-wrapper password-wrapper" : "password-field"}>
      <input {...props} type={shown ? "text" : "password"} />
      <button type="button" className="password-toggle-btn" onClick={() => setShown(v => !v)} aria-label={label} aria-pressed={shown} title={label}>
        <Icon name={shown ? "eye-off" : "eye"} size={18} />
      </button>
    </div>
  );
}
