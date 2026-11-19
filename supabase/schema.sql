-- Puckout leaderboard: run this once in your Supabase project's SQL editor.
-- Each finished road is one row. Anyone can read the leaderboard and add
-- their own road; nobody can change or delete rows from the game.

create table if not exists public.roads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  player_id   uuid not null,
  name        text not null check (char_length(name) between 1 and 24),
  club        text not null default '' check (char_length(club) <= 60),
  county      text not null default '' check (char_length(county) <= 20),
  round       integer not null check (round between 1 and 100000),
  points      integer not null check (points between 0 and 700),
  km          integer not null check (km between 0 and 2000),
  total_km    integer not null check (total_km between 1 and 2000),
  marks       text not null default '' check (char_length(marks) <= 40),
  unique (player_id, round)
);

create index if not exists roads_created_at on public.roads (created_at desc);
create index if not exists roads_points on public.roads (points desc);

alter table public.roads enable row level security;

drop policy if exists "anyone can read roads" on public.roads;
create policy "anyone can read roads" on public.roads
  for select to anon, authenticated using (true);

drop policy if exists "anyone can add a road" on public.roads;
create policy "anyone can add a road" on public.roads
  for insert to anon, authenticated with check (true);

-- All-time table: one row per player, newest name/club wins.
create or replace view public.leaderboard as
select
  player_id,
  (array_agg(name   order by created_at desc))[1] as name,
  (array_agg(club   order by created_at desc))[1] as club,
  (array_agg(county order by created_at desc))[1] as county,
  count(*)::int          as roads,
  sum(points)::int       as total_points,
  max(points)::int       as best_points,
  count(*) filter (where points >= 700)::int as crokers
from public.roads
group by player_id;

-- County table: points summed across every player from each county.
create or replace view public.county_leaderboard as
select county, count(distinct player_id)::int as players, count(*)::int as roads, sum(points)::int as total_points
from public.roads
where county <> ''
group by county;

grant select on public.leaderboard, public.county_leaderboard to anon, authenticated;
