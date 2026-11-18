// Browser-safe role routing for the single sign-in page. Roles come from
// public.user_roles (readable only for the signed-in user's own rows) and are
// re-checked on the server by every protected function; this only decides where
// to send someone after sign-in.
export type AppRole = "admin" | "counsellor" | "student";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  counsellor: "Counsellor",
  student: "Student",
};

/** Highest role first: an admin who is also a counsellor is treated as an admin. */
export function primaryRole(roles: readonly string[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("counsellor")) return "counsellor";
  if (roles.includes("student")) return "student";
  return null;
}

export function homeFor(role: AppRole): string {
  return role === "admin" ? "/admin" : role === "counsellor" ? "/counsellor" : "/me";
}

function isInternal(path: string | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth");
}

/** Where to go after sign-in: a requested page only if this role may open it. */
export function destinationFor(role: AppRole, requested: string | undefined): string {
  if (!isInternal(requested)) return homeFor(role);
  const team = requested.startsWith("/admin") || requested.startsWith("/counsellor");
  if (role === "admin") return requested;
  if (role === "counsellor") return requested.startsWith("/counsellor") ? requested : homeFor(role);
  return team ? homeFor(role) : requested;
}
