// Fixed demo logins (this is a demo site; the owner chose to hardcode them).
export type DemoRole = "student" | "counsellor";

export const DEMO_ACCOUNTS: Record<DemoRole, { email: string; password: string; name: string }> = {
  student: { email: "student@futureme.in", password: "Student@2026", name: "Demo Student" },
  counsellor: {
    email: "counsellor@futureme.in",
    password: "Counsellor@2026",
    name: "Demo Counsellor",
  },
};
