import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Icon } from "@/components/icon";
import { SignOut } from "@/components/sign-out";

export function OrgShell({
  title,
  orgName,
  path = "/organization/dashboard",
  children,
}: {
  title: string;
  orgName?: string;
  path?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-layout">
      <Sidebar currentPath={path} namespace="organization" />
      <div className="admin-content">
        <header className="admin-header">
          <div className="page-brand">
            <span>
              <Icon name="grid" />
            </span>
            <div>
              <h1>{title}</h1>
              <small>{orgName || "Organization Workspace"}</small>
            </div>
          </div>
          <SignOut />
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
