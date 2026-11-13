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
  { label: "Open Data Collector", url: "/root/collector", icon: "bolt" },
];

export function Sidebar({ currentPath }: { currentPath: string }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="collector-brand-symbol">
          S<span>·</span>
        </span>
        <div className="collector-brand-name">
          SciProspect
          <small>Research intelligence</small>
        </div>
      </div>

      <div className="sidebar-section sidebar-collector-section">
        <div className="sidebar-heading">ROOT ADMIN</div>
        <nav className="sidebar-nav">
          {ROOT_LINKS.map((item) => (
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
            href="/root/scistudio"
            className="nav-tab studio-nav-card"
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

