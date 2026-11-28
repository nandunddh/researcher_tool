import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Icon } from "@/components/icon";
import { SignOut } from "@/components/sign-out";
import { WorkspaceFooter } from "@/components/workspace-footer";

export function ClientShell({
  title,
  clientName,
  path = "/dashboard",
  actions,
  children,
}: {
  title: string;
  clientName?: string;
  /** Buttons shown in the top bar, left of sign-out (e.g. Upgrade, Account). */
  actions?: ReactNode;
  path?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-layout">
      <Sidebar currentPath={path} namespace="client" />
      <div className="admin-content">
        <header className="admin-header">
          <div className="page-brand">
            <span>
              <Icon name="grid" />
            </span>
            <div>
              <h1>{title}</h1>
              <small>{clientName || "Solo Researcher Workspace"}</small>
            </div>
          </div>
          <div className="header-actions">{actions}<SignOut /></div>
        </header>
        <main className="admin-main">{children}</main><WorkspaceFooter />
      </div>
    </div>
  );
}
