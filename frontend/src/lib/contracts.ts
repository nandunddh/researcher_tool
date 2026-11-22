export const namespaces = ["root", "organization", "client", "conference"] as const;
export type Namespace = (typeof namespaces)[number];
export function isNamespace(value: string): value is Namespace {
  return namespaces.some(item => item === value);
}
export type User = {
  client_name: string; client_email: string; is_admin?: boolean; is_member?: boolean;
  scistudio_access?: boolean; workspace_namespace: Namespace; tier?: string;
  /** Signed in, but two-step sign-in must be set up before anything else. */
  mfa_setup_required?: boolean;
};
export type Session = { authenticated: boolean; user: User };
export type Site = {
  site_id: string; name: string; slug: string; status: string;
  updated_at?: string; conference_id?: string | null;
};
export type Conference = { conference_id: string; name: string; description?: string };
export type Template = { id: string; name: string; description: string; category: string; page_count?: number };
export type Account = {
  client_name: string; client_email: string; org_name?: string; account_type: string;
  is_root?: boolean; tier: string; status: string; scistudio_access: boolean;
  members: { name: string; email: string; role: string }[];
};
export type ClientBrief = {
  conference_name: string; start_date: string; end_date: string;
  venue_format: string; contact_email: string;
};
export function studioPath(namespace: Namespace, siteId?: string, action: "edit" | "preview" = "edit") {
  // "edit" opens the React editor; the classic editor stays reachable from its toolbar.
  return `/${namespace}/scistudio${siteId ? `/${encodeURIComponent(siteId)}/${action === "edit" ? "react-edit" : action}` : ""}`;
}
export function safeReturnPath(path: string | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path)) return null;
  return namespaces.some(namespace => path.startsWith(`/${namespace}/`)) ? path : null;
}
