import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Icon } from "@/components/icon";
import { SignOut } from "@/components/sign-out";
import { WorkspaceFooter } from "@/components/workspace-footer";
export function AdminShell({title,path,children}:{title:string;path:string;children:ReactNode}) {return <div className="admin-layout"><Sidebar currentPath={path}/><div className="admin-content"><header className="admin-header"><div className="page-brand"><span><Icon name="grid"/></span><div><h1>{title}</h1><small>Platform management</small></div></div><SignOut/></header><main className="admin-main">{children}</main><WorkspaceFooter /></div></div>}
