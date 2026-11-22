import { Icon, type IconName } from "@/components/icon";

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
  { label: "Design Library", url: "/root/designs", icon: "layers" },
  { label: "Data Collector", url: "/root/collector", icon: "bolt" },
];

const ORG_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/organization/dashboard", icon: "bolt" },
  { label: "Billing & plan", url: "/billing", icon: "doc" },
  { label: "Data Collector", url: "/organization/collector", icon: "bolt" },
];

const CLIENT_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/client/dashboard", icon: "bolt" },
  { label: "Billing & plan", url: "/billing", icon: "doc" },
  { label: "Data Collector", url: "/client/collector", icon: "bolt" },
];

const CONFERENCE_LINKS: NavItem[] = [
  { label: "Dashboard", url: "/conference/dashboard", icon: "bolt" },
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
      ? "ORGANIZATION"
      : effectiveNamespace === "client"
      ? "CLIENT WORKSPACE"
      : effectiveNamespace === "conference"
      ? "CONFERENCE TEAM"
      : "ROOT ADMIN";

  const studioUrl = `/${effectiveNamespace}/scistudio`;

  return (
    <aside className="app-sidebar">
      <a className="sidebar-brand" href={`/${effectiveNamespace}/dashboard`} aria-label="SciProspect dashboard">
        <span className="sciprospect-original-mark" aria-hidden="true" />
        <div className="collector-brand-name">
          SciProspect
        </div>
      </a>

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

      <div className="sidebar-section sidebar-studio-section">
        <div className="sidebar-heading">STUDIO</div>
        <nav className="sidebar-nav">
          <a
            href={studioUrl}
            className={`nav-tab studio-nav-card ${currentPath.includes("/scistudio") ? "active" : ""}`}
            title="SciStudio Website builder"
          >
            <Icon name="layers" size={18} />
            <span className="nav-label studio-nav-copy">
              <span>SciStudio</span>
              <small>Website builder</small>
            </span>
          </a>
        </nav>
      </div>
    </aside>
  );
}

