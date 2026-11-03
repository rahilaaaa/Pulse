export type IconName =
  | "workspace"
  | "people"
  | "organization"
  | "studio"
  | "modules"
  | "roles"
  | "settings"
  | "billing"
  | "notifications"
  | "audit"
  | "leave"
  | "parties"
  | "projects"
  | "crm"
  | "commerce"
  | "custom-entities";

export type ShellLink = {
  code: string;
  label: string;
  to: string;
  icon: IconName;
  section: "Workspace" | "Administration";
  end?: boolean;
};

export const SHELL_LINKS: ShellLink[] = [
  { code: "dashboard", label: "Workspace", to: "/app", icon: "workspace", section: "Workspace", end: true },
  { code: "users", label: "People", to: "/app/people", icon: "people", section: "Workspace" },
  { code: "organization", label: "Organization", to: "/app/organization", icon: "organization", section: "Workspace" },
  { code: "studio", label: "Admin Studio", to: "/app/studio", icon: "studio", section: "Administration" },
  { code: "modules", label: "Modules", to: "/app/modules", icon: "modules", section: "Administration" },
  { code: "roles", label: "Roles & Permissions", to: "/app/roles", icon: "roles", section: "Administration" },
  { code: "settings", label: "Configuration", to: "/app/settings", icon: "settings", section: "Administration" },
  { code: "custom-entities", label: "Custom Records", to: "/app/custom-entities", icon: "custom-entities", section: "Administration" },
  { code: "billing", label: "Billing & Plan", to: "/app/billing", icon: "billing", section: "Administration" },
  { code: "notifications", label: "Notifications", to: "/app/notifications", icon: "notifications", section: "Administration" },
  { code: "audit", label: "Audit", to: "/app/audit", icon: "audit", section: "Administration" },
  { code: "hrms", label: "HRMS", to: "/app/hrms", icon: "leave", section: "Workspace" },
  { code: "parties", label: "Parties", to: "/app/parties", icon: "parties", section: "Workspace" },
  { code: "projects", label: "Projects", to: "/app/projects", icon: "projects", section: "Workspace" },
  { code: "crm", label: "CRM", to: "/app/crm", icon: "crm", section: "Workspace" },
  { code: "commerce", label: "Commerce", to: "/app/commerce", icon: "commerce", section: "Workspace" },
];

export function NavIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-[18px] w-[18px] shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "workspace") {
    return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
  }
  if (name === "people") {
    return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-2.8 2.8-4.5 5.5-4.5S14 16.2 14.5 19" /><circle cx="17" cy="9" r="2.2" /><path d="M16.2 14.6c2 .4 3.4 1.8 3.8 4.4" /></svg>;
  }
  if (name === "organization") {
    return <svg {...common}><path d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5H11v15" /><path d="M11 9h7.5A1.5 1.5 0 0 1 20 10.5V20" /><path d="M7 9h2M7 13h2M7 17h2M14 13h3M14 17h3" /></svg>;
  }
  if (name === "studio") {
    return <svg {...common}><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9h17M9 9v11" /></svg>;
  }
  if (name === "modules") {
    return <svg {...common}><path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" /><path d="M12 12.5 20 8M12 12.5 4 8M12 12.5v8" /></svg>;
  }
  if (name === "roles") {
    return <svg {...common}><path d="M12 3.5 19 6v6.2c0 3.6-2.6 6.4-7 8.3-4.4-1.9-7-4.7-7-8.3V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></svg>;
  }
  if (name === "settings") {
    return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.4l1.6 1.6M17.5 16l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.6 6.5 16M17.5 8l1.6-1.6" /></svg>;
  }
  if (name === "billing") {
    return <svg {...common}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M3.5 10h17" /></svg>;
  }
  if (name === "notifications") {
    return <svg {...common}><path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>;
  }
  if (name === "audit") {
    return <svg {...common}><path d="M8 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5Z" /><path d="M16 4.5V8h3.5M9 12h6M9 16h6" /></svg>;
  }
  if (name === "custom-entities") {
    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h10" /><path d="M18 15v4M16 17h4" /></svg>;
  }
  return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3.5V7M16 3.5V7M4 10h16" /></svg>;
}
