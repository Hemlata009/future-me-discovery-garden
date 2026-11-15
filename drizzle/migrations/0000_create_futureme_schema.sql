-- ============================================================
-- FutureMe AI: roles helper
-- Privileges live in their own protected table, never on a profile.
-- ============================================================
create type public.app_role as enum ('admin', 'student');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

create policy "Users can see their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

-- ============================================================
-- Projects catalog (public list, admin-managed)
-- ============================================================
create table public.projects (
  id text primary key,
  title text not null,
  category text not null,
  description text not null,
  goal text not null default '',
  technologies text[] not null default '{}',
  roadmap text[] not null default '{}',
  tone text not null default 'mint',
  icon text not null default 'sparkles',
  image_asset text not null default '',
  author text not null default '',
  initials text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

create policy "Anyone can read published projects"
  on public.projects for select to anon, authenticated
  using (is_published = true);

create policy "Admins can read every project"
  on public.projects for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage projects"
  on public.projects for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Discovery wizard answers
-- ============================================================
create table public.discovery_responses (
  id uuid primary key default gen_random_uuid(),
  interest text not null,
  technology text not null default '',
  build_idea text not null default '',
  custom_idea text not null default '',
  current_status text not null default '',
  preferred_language text not null default 'english',
  matched_project text references public.projects(id) on delete set null,
  source text not null default 'discovery',
  created_at timestamptz not null default now(),
  check (char_length(interest) between 1 and 60),
  check (char_length(custom_idea) <= 300),
  check (char_length(source) <= 40)
);

GRANT INSERT ON public.discovery_responses TO anon;
GRANT INSERT ON public.discovery_responses TO authenticated;
GRANT ALL ON public.discovery_responses TO service_role;

ALTER TABLE public.discovery_responses ENABLE ROW LEVEL SECURITY;

create policy "Anyone can record a discovery journey"
  on public.discovery_responses for insert to anon, authenticated
  with check (true);

create policy "Admins can read discovery journeys"
  on public.discovery_responses for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index "discovery_responses_created_idx"
  on public.discovery_responses (created_at desc);

create index "discovery_responses_interest_idx"
  on public.discovery_responses (interest);

-- ============================================================
-- Saved projects (owner-only)
-- ============================================================
create table public.saved_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id text not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_projects TO authenticated;
GRANT ALL ON public.saved_projects TO service_role;

ALTER TABLE public.saved_projects ENABLE ROW LEVEL SECURITY;

create policy "Students can read their own saved projects"
  on public.saved_projects for select to authenticated
  using (user_id = auth.uid());

create policy "Students can save a project"
  on public.saved_projects for insert to authenticated
  with check (user_id = auth.uid());

create policy "Students can update their own saved projects"
  on public.saved_projects for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Students can unsave a project"
  on public.saved_projects for delete to authenticated
  using (user_id = auth.uid());

create policy "Admins can read saved projects"
  on public.saved_projects for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Share activity
-- ============================================================
create table public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id) on delete set null,
  channel text not null default 'copy',
  referrer_code text not null default '',
  created_at timestamptz not null default now(),
  check (channel in ('copy', 'whatsapp', 'link', 'other')),
  check (char_length(referrer_code) <= 60)
);

GRANT INSERT ON public.project_shares TO anon;
GRANT INSERT ON public.project_shares TO authenticated;
GRANT ALL ON public.project_shares TO service_role;

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

create policy "Anyone can record a share"
  on public.project_shares for insert to anon, authenticated
  with check (true);

create policy "Admins can read shares"
  on public.project_shares for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index "project_shares_created_idx"
  on public.project_shares (created_at desc);

-- ============================================================
-- Friend invitations + visits that arrive through them
-- ============================================================
create table public.referral_invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  project_id text references public.projects(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (char_length(code) between 1 and 60)
);

create table public.referral_visits (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  project_id text references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  check (char_length(code) <= 60)
);

GRANT INSERT ON public.referral_invitations TO anon;
GRANT INSERT ON public.referral_invitations TO authenticated;
GRANT ALL ON public.referral_invitations TO service_role;

GRANT INSERT ON public.referral_visits TO anon;
GRANT INSERT ON public.referral_visits TO authenticated;
GRANT ALL ON public.referral_visits TO service_role;

ALTER TABLE public.referral_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_visits ENABLE ROW LEVEL SECURITY;

create policy "Anyone can create an invitation"
  on public.referral_invitations for insert to anon, authenticated
  with check (true);

create policy "Admins can read invitations"
  on public.referral_invitations for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Anyone can record an invitation visit"
  on public.referral_visits for insert to anon, authenticated
  with check (true);

create policy "Admins can read invitation visits"
  on public.referral_visits for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index "referral_visits_code_idx" on public.referral_visits (code);

-- ============================================================
-- NIAT interest notes
-- ============================================================
create table public.niat_interests (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id) on delete set null,
  message text not null default '',
  contact text not null default '',
  created_at timestamptz not null default now(),
  check (char_length(message) <= 500),
  check (char_length(contact) <= 160)
);

GRANT INSERT ON public.niat_interests TO anon;
GRANT INSERT ON public.niat_interests TO authenticated;
GRANT ALL ON public.niat_interests TO service_role;

ALTER TABLE public.niat_interests ENABLE ROW LEVEL SECURITY;

create policy "Anyone can leave a NIAT interest note"
  on public.niat_interests for insert to anon, authenticated
  with check (true);

create policy "Admins can read NIAT interest notes"
  on public.niat_interests for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Site visits (real dashboard counts)
-- ============================================================
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  path text not null default '/',
  referrer_code text not null default '',
  created_at timestamptz not null default now(),
  check (char_length(path) <= 200),
  check (char_length(referrer_code) <= 60)
);

GRANT INSERT ON public.visits TO anon;
GRANT INSERT ON public.visits TO authenticated;
GRANT ALL ON public.visits TO service_role;

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

create policy "Anyone can record a visit"
  on public.visits for insert to anon, authenticated
  with check (true);

create policy "Admins can read visits"
  on public.visits for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index "visits_created_idx" on public.visits (created_at desc);

-- Keep updated_at honest on the catalog.
create or replace function public.touch_projects_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger "projects_touch_updated_at"
  before update on public.projects
  for each row
  execute function public.touch_projects_updated_at();