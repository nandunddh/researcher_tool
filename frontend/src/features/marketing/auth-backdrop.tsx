"use client";
import { NetworkCanvas } from "./motion";
import styles from "./auth-backdrop.module.css";

/** The home page's live researcher network and glow, behind the sign-in, sign-up and billing screens. */
export function AuthBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.aurora}><i /><i /><i /></div>
      <NetworkCanvas className={styles.network} />
    </div>
  );
}
