export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function personName(first: string, last: string, email = "") {
  const name = `${first} ${last}`.trim();
  return name || email || "Unnamed person";
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "No login";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "No login";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

const ACTION_LABELS: Record<string, string> = {
  "company.created": "Workspace created",
  "company.updated": "Workspace updated",
  "company.profile_completed": "Company profile completed",
  "company.billing_profile_completed": "Billing profile completed",
  "person.created": "Person added",
  "membership.invited": "Invitation sent",
  "membership.invitation_revoked": "Invitation revoked",
  "membership.invitation_accepted": "Invitation accepted",
  "membership.status_changed": "Membership updated",
  "membership.roles_changed": "Roles updated",
  "organization_unit.created": "Organization unit added",
  "organization_unit.updated": "Organization unit updated",
  "organization_unit.deactivated": "Organization unit deactivated",
  "organization_unit.members_changed": "Unit members updated",
  "organization_unit_type.saved": "Unit type saved",
  "module.installed": "Module installed",
  "subscription.plan_selected": "Plan selected",
  "role.created": "Role created",
  "role.permissions_changed": "Role permissions updated",
  "role.duplicated": "Role duplicated",
  "dashboard.published": "Dashboard published",
  "custom_field.created": "Field added",
  "custom_field.deleted": "Field deleted",
  "announcement.published": "Announcement published",
  "hrms.leave.decided": "Leave decided",
};

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll(/[._]/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function objectLabel(objectType: string | undefined) {
  if (!objectType) return "Workspace";
  return objectType.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function codeFromName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
