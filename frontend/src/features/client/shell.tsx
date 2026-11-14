import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Icon } from "@/components/icon";
import { SignOut } from "@/components/sign-out";

export function ClientShell({
  title,
  clientName,
  path = "/client/dashboard",
  children,
}: {
  title: string;
  clientName?: string;
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
          <SignOut />
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
