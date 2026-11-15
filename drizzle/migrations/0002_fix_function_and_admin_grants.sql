-- Admins manage the catalog through the admin-only row policy; give them the table rights for it.
GRANT INSERT, UPDATE, DELETE ON public.projects TO authenticated;

-- The updated_at trigger only rewrites the row already being changed, so it needs no elevated rights.
create or replace function public.touch_projects_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The admin check is only ever asked from row-level security rules for signed-in accounts.
revoke execute on function public.has_role(uuid, public.app_role) from PUBLIC, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;