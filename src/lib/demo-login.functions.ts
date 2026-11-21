import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEMO_ACCOUNTS, type DemoRole } from "@/lib/demo-accounts";

/** Makes sure the fixed demo account for this role exists with its role. */
export const ensureDemoAccount = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ role: z.enum(["student", "counsellor"]) }).parse(input))
  .handler(async ({ data }) => {
    const role: DemoRole = data.role;
    const account = DEMO_ACCOUNTS[role];
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list?.users.find((u) => u.email?.toLowerCase() === account.email);
    if (!user) {
      const created = await db.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.name },
      });
      if (created.error || !created.data.user) return { ok: false as const };
      user = created.data.user;
    } else {
      await db.auth.admin.updateUserById(user.id, { password: account.password });
    }
    await db
      .from("user_roles")
      .upsert({ user_id: user.id, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (role === "student") {
      const { data: existing } = await db
        .from("student_accounts")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        const { newInviteCode } = await import("@/lib/student-signup.server");
        await db.from("student_accounts").insert({
          user_id: user.id,
          visitor_hash: null,
          full_name: account.name,
          phone: "9000000000",
          class_status: "class12",
          city: null,
          consent_at: new Date().toISOString(),
          invite_code: newInviteCode(),
          invited_by: null,
        });
      }
    }
    return { ok: true as const };
  });
