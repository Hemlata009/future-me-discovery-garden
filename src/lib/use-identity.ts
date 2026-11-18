import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { primaryRole, type AppRole } from "@/lib/roles";

/** The signed-in person's email and highest role (own user_roles rows only, via RLS). */
export function useIdentity() {
  return useQuery({
    queryKey: ["identity"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return { email: null, role: null as AppRole | null };
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      return {
        email: data.user.email ?? null,
        role: primaryRole((rows ?? []).map((row) => String(row.role))),
      };
    },
    staleTime: 60_000,
  });
}
