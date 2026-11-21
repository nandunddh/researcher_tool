"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { componentCatalog, type LibraryComponent, type LibraryLevel } from "./component-catalog";

export type ImportedDesign = {
  id: string; kind: "section" | "template"; name: string; category: string; level: LibraryLevel; description: string; created_at: string;
  section?: NonNullable<LibraryComponent["preset"]>;
};

let loading: Promise<void> | null = null;

/** Adds the root admin's imported section designs to the component catalog (once per page load). */
export function registerImported(items: ImportedDesign[]) {
  for (let i = componentCatalog.length - 1; i >= 0; i--) if (componentCatalog[i].imported) componentCatalog.splice(i, 1);
  componentCatalog.unshift(...items.filter(d => d.kind === "section" && d.section).map(d => ({
    id: `lib-${d.id}`, version: 1, name: d.name, category: d.category, group: "Sections" as const, level: d.level,
    description: d.description, variant: d.section!.type, features: ["New"], preset: d.section, imported: true,
  })));
}

/** Re-renders the caller once imported designs are in the catalog. */
export function useImportedDesigns() {
  const [, setReady] = useState(0);
  useEffect(() => {
    loading ??= api<{ items: ImportedDesign[] }>("/api/library").then(r => registerImported(r.items)).catch(() => { loading = null; });
    let live = true;
    void loading.then(() => { if (live) setReady(n => n + 1); });
    return () => { live = false; };
  }, []);
}
