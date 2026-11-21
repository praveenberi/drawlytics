-- Lotto Insights – Supabase (PostgreSQL) schema with Row Level Security.
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Every table is owned by a user; RLS guarantees users only ever see their own rows.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- users
-- Public profile row mirroring auth.users (created automatically on sign-up).
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- lottery_games
create table if not exists public.lottery_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  country text not null default '',
  provider text not null default '',
  min_number int not null,
  max_number int not null,
  main_count int not null,
  bonus_count int not null default 0,
  bonus_from_main_pool boolean not null default false,
  bonus_min int not null default 1,
  bonus_max int not null default 1,
  draw_frequency text not null default '',
  draw_days int[] not null default '{}',
  draw_time text not null default '',
  rules text not null default '',
  personal_notes text not null default '',
  created_at timestamptz not null default now(),
  check (min_number < max_number),
  check (main_count >= 1),
  check (bonus_count >= 0)
);
create index if not exists lottery_games_user_idx on public.lottery_games(user_id);

-- ---------------------------------------------------------- lottery_draws
create table if not exists public.lottery_draws (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id uuid not null references public.lottery_games(id) on delete cascade,
  draw_number text,
  draw_date date not null,
  jackpot numeric(18,2),
  winners int,
  prize_details text not null default '',
  notes text not null default '',
  -- provenance: where the record came from
  source text not null default 'manual' check (source in ('manual','imported','external')),
  created_at timestamptz not null default now()
);
create index if not exists lottery_draws_game_date_idx on public.lottery_draws(game_id, draw_date desc);
-- Duplicate protection: one draw number per game.
create unique index if not exists lottery_draws_unique_number
  on public.lottery_draws(game_id, lower(draw_number)) where draw_number is not null;

-- ---------------------------------------------------------- draw_numbers
create table if not exists public.draw_numbers (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  draw_id uuid not null references public.lottery_draws(id) on delete cascade,
  kind text not null check (kind in ('main','bonus')),
  position int not null,
  number int not null,
  unique (draw_id, kind, position)
);
create index if not exists draw_numbers_draw_idx on public.draw_numbers(draw_id);
create index if not exists draw_numbers_number_idx on public.draw_numbers(number);

-- --------------------------------------------------- generated_combinations
create table if not exists public.generated_combinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id uuid not null references public.lottery_games(id) on delete cascade,
  numbers int[] not null,
  bonus int[] not null default '{}',
  strategy text not null,
  score numeric(8,2) not null default 0,
  period text not null default '',
  seed text,
  created_at timestamptz not null default now()
);
create index if not exists generated_user_idx on public.generated_combinations(user_id, created_at desc);

-- ---------------------------------------------------- favourite_combinations
create table if not exists public.favourite_combinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id uuid not null references public.lottery_games(id) on delete cascade,
  numbers int[] not null,
  bonus int[] not null default '{}',
  strategy text not null default '',
  label text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------- user_settings
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  selected_game_id uuid references public.lottery_games(id) on delete set null,
  page_size int not null default 25
);

-- ---------------------------------------------------------------- RLS
alter table public.users                   enable row level security;
alter table public.lottery_games           enable row level security;
alter table public.lottery_draws           enable row level security;
alter table public.draw_numbers            enable row level security;
alter table public.generated_combinations  enable row level security;
alter table public.favourite_combinations  enable row level security;
alter table public.user_settings           enable row level security;

drop policy if exists "own profile" on public.users;
create policy "own profile" on public.users for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['lottery_games','lottery_draws','draw_numbers','generated_combinations','favourite_combinations','user_settings']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
