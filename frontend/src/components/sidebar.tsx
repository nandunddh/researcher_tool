import { Icon, type IconName } from "@/components/icon";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
const COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";

interface NavItem {
  label: string;
  url: string;
  icon: IconName;
}

const ROOT_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/root/dashboard", icon: "bolt" },
  { label: "Add Account", url: "/root/add-account", icon: "doc" },
  { label: "Manage Accounts", url: "/root/accounts", icon: "doc" },
  { label: "Plans", url: "/root/plans", icon: "grid" },
  { label: "Demo requests", url: "/root/demo-requests", icon: "user" },
  { label: "Design Library", url: "/root/designs", icon: "layers" },
];

const ORG_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/dashboard", icon: "bolt" },
  { label: "Billing & plan", url: "/billing", icon: "doc" },
  { label: "Account", url: "/account", icon: "user" },
];

const CLIENT_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/dashboard", icon: "bolt" },
  { label: "Billing & plan", url: "/billing", icon: "doc" },
  { label: "Account", url: "/account", icon: "user" },
];

const CONFERENCE_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/dashboard", icon: "bolt" },
];

export function Sidebar({
  currentPath,
  namespace = "root",
}: {
  currentPath: string;
  namespace?: "root" | "organization" | "client" | "conference";
}) {
  const effectiveNamespace =
    namespace !== "root"
      ? namespace
      : currentPath.startsWith("/organization")
      ? "organization"
      : currentPath.startsWith("/client")
      ? "client"
      : currentPath.startsWith("/conference")
      ? "conference"
      : "root";

  const links =
    effectiveNamespace === "organization"
      ? ORG_LINKS
      : effectiveNamespace === "client"
      ? CLIENT_LINKS
      : effectiveNamespace === "conference"
      ? CONFERENCE_LINKS
      : ROOT_LINKS;

  const heading =
    effectiveNamespace === "organization"
      ? "WORKSPACE"
      : effectiveNamespace === "client"
      ? "WORKSPACE"
      : effectiveNamespace === "conference"
      ? "CONFERENCE TEAM"
      : "ROOT ADMIN";

  const studioUrl = "/scistudio";
  const collectUrl = "/collector";

  return (
    <aside className="app-sidebar">
      <a className="sidebar-brand" href={effectiveNamespace === "root" ? "/root/dashboard" : "/dashboard"} aria-label="SciProspect dashboard">
        <span className="sciprospect-original-mark" aria-hidden="true" />
        <div className="collector-brand-name">
          SciProspect
        </div>
      </a>

      <div className="product-switch" role="group" aria-label="SciProspect products">
        <a className={`product-tab ${currentPath.includes("/collector") ? "active" : ""}`} href={collectUrl}><Icon name="bolt" size={16} />Collect</a>
        <a className={`product-tab ${currentPath.includes("/scistudio") ? "active" : ""}`} href={studioUrl}><Icon name="layers" size={16} />Studio</a>
      </div>

      <div className="sidebar-section sidebar-collector-section">
        <div className="sidebar-heading">{heading}</div>
        <nav className="sidebar-nav">
          {links.map((item) => (
            <a
              key={item.url}
              className={`nav-tab ${currentPath === item.url ? "active" : ""}`}
              href={item.url}
              title={item.label}
            >
              <Icon name={item.icon} size={18} />
              <span className="nav-label">{item.label}</span>
            </a>
          ))}
        </nav>
      </div>

      {/* Workspaces that pay for a plan get a clear way to upgrade, pinned to the bottom of the sidebar. */}
      {(effectiveNamespace === "client" || effectiveNamespace === "organization") && (
        <a className={`sidebar-upgrade ${currentPath === "/billing" ? "active" : ""}`} href="/billing">
          <span className="sidebar-upgrade-icon"><Icon name="bolt" size={18} /></span>
          <span><b>Upgrade plan</b><small>More contacts, websites and team seats</small></span>
        </a>
      )}

      {/* Version and build, set when the app is built (next.config.ts). */}
      <div className="sidebar-version" title={COMMIT ? `Build ${COMMIT}` : undefined}>
        SciProspect v{VERSION}{COMMIT && <> · build {COMMIT}</>}
      </div>
    </aside>
  );
}

