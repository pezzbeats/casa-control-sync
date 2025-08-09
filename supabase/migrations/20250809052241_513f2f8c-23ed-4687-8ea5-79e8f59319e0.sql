-- Create home automation schema
-- 1) Tables
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('light','fan','sensor','switch','plug','thermostat')),
  location_id uuid references public.locations(id) on delete set null,
  state text not null default 'off' check (state in ('on','off')),
  ip_address text
);

create table if not exists public.sensor_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete cascade,
  timestamp timestamptz not null default now(),
  event_type text not null,
  value text
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  scene_name text not null,
  device_id uuid references public.devices(id) on delete cascade,
  desired_state text not null
);

-- 2) Row Level Security
alter table public.locations enable row level security;
alter table public.devices enable row level security;
alter table public.sensor_events enable row level security;
alter table public.scenes enable row level security;

-- Public read policies
create policy if not exists "Public can read locations" on public.locations for select using (true);
create policy if not exists "Public can read devices" on public.devices for select using (true);
create policy if not exists "Public can read sensors" on public.sensor_events for select using (true);
create policy if not exists "Public can read scenes" on public.scenes for select using (true);

-- Demo-friendly update on devices (toggle). WARNING: open update for demo only.
create policy if not exists "Anyone can update devices state (demo)" on public.devices for update using (true) with check (true);

-- Optional: allow inserting sensor events (e.g., webhooks) for demo
create policy if not exists "Anyone can insert sensor events (demo)" on public.sensor_events for insert with check (true);

-- 3) Realtime setup for devices
alter table public.devices replica identity full;
-- Ensure devices are part of realtime publication
alter publication supabase_realtime add table public.devices;
