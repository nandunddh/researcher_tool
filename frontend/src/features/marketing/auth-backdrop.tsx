"use client";
import { NetworkCanvas } from "./motion";
import styles from "./auth-backdrop.module.css";

/** The home page's quiet dot grid and researcher network, behind sign-in, sign-up and billing. */
export function AuthBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.dots} />
      <NetworkCanvas className={styles.network} />
    </div>
  );
}
