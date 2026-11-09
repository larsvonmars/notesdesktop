-- ============================================================
-- Learn workspace schema (shared with the MindViz Learn app)
-- ------------------------------------------------------------
-- Idempotent reference schema for the `learn_*` tables used by
-- components/learn and lib/learn. The tables already exist in the shared
-- Supabase project; this file lets a fresh project support the view and keeps
-- the expected shape documented next to the other feature schemas.
--
-- Every table is owned by `auth.uid()` through RLS, matching the migrations in
-- the MindViz Learn project (0001–0010).
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.learn_profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text,
  created_at timestamptz not null default now()
);

alter table public.learn_profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_profiles' and policyname = 'Users can read own profile') then
    create policy "Users can read own profile" on public.learn_profiles for select using (id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_profiles' and policyname = 'Users can insert own profile') then
    create policy "Users can insert own profile" on public.learn_profiles for insert with check (id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_profiles' and policyname = 'Users can update own profile') then
    create policy "Users can update own profile" on public.learn_profiles for update using (id = auth.uid());
  end if;
end $$;

-- ── user stats ──────────────────────────────────────────────
create table if not exists public.learn_user_stats (
  id                      uuid primary key references auth.users (id) on delete cascade,
  xp                      integer not null default 0,
  level                   integer not null default 1,
  streak                  integer not null default 0,
  last_studied_at         date,
  total_cards_reviewed    integer not null default 0,
  updated_at              timestamptz not null default now(),
  daily_goal              integer not null default 20,
  streak_reminder_enabled boolean not null default true,
  total_sessions          integer not null default 0,
  total_correct           integer not null default 0
);

alter table public.learn_user_stats enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_user_stats' and policyname = 'Users can read own stats') then
    create policy "Users can read own stats" on public.learn_user_stats for select using (id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_user_stats' and policyname = 'Users can insert own stats') then
    create policy "Users can insert own stats" on public.learn_user_stats for insert with check (id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_user_stats' and policyname = 'Users can update own stats') then
    create policy "Users can update own stats" on public.learn_user_stats for update using (id = auth.uid());
  end if;
end $$;

-- ── decks ───────────────────────────────────────────────────
create table if not exists public.learn_decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text,
  color       text not null default 'bg-accent',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.learn_decks enable row level security;
create index if not exists learn_decks_user_id_idx on public.learn_decks (user_id);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_decks' and policyname = 'Users can read own decks') then
    create policy "Users can read own decks" on public.learn_decks for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_decks' and policyname = 'Users can insert own decks') then
    create policy "Users can insert own decks" on public.learn_decks for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_decks' and policyname = 'Users can update own decks') then
    create policy "Users can update own decks" on public.learn_decks for update using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_decks' and policyname = 'Users can delete own decks') then
    create policy "Users can delete own decks" on public.learn_decks for delete using (user_id = auth.uid());
  end if;
end $$;

-- ── cards ───────────────────────────────────────────────────
create table if not exists public.learn_cards (
  id              uuid primary key default gen_random_uuid(),
  deck_id         uuid not null references public.learn_decks (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  front           text not null,
  back            text not null,
  mastered        boolean not null default false,
  created_at      timestamptz not null default now(),
  due_date        date,
  ease_factor     numeric(4,2) default 2.5,
  interval_days   integer default 1,
  correct_count   integer default 0,
  incorrect_count integer default 0
);

alter table public.learn_cards enable row level security;
create index if not exists learn_cards_deck_id_idx on public.learn_cards (deck_id);
create index if not exists learn_cards_user_id_idx on public.learn_cards (user_id);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_cards' and policyname = 'Users can read own cards') then
    create policy "Users can read own cards" on public.learn_cards for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_cards' and policyname = 'Users can insert own cards') then
    create policy "Users can insert own cards" on public.learn_cards for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_cards' and policyname = 'Users can update own cards') then
    create policy "Users can update own cards" on public.learn_cards for update using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_cards' and policyname = 'Users can delete own cards') then
    create policy "Users can delete own cards" on public.learn_cards for delete using (user_id = auth.uid());
  end if;
end $$;

-- ── study sessions ──────────────────────────────────────────
create table if not exists public.learn_study_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  deck_id        uuid references public.learn_decks (id) on delete set null,
  cards_reviewed integer not null default 0,
  xp_earned      integer not null default 0,
  completed_at   timestamptz not null default now(),
  mode           text,
  correct_count  integer not null default 0
);

alter table public.learn_study_sessions enable row level security;
create index if not exists learn_study_sessions_user_id_idx on public.learn_study_sessions (user_id);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_study_sessions' and policyname = 'Users can read own sessions') then
    create policy "Users can read own sessions" on public.learn_study_sessions for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_study_sessions' and policyname = 'Users can insert own sessions') then
    create policy "Users can insert own sessions" on public.learn_study_sessions for insert with check (user_id = auth.uid());
  end if;
end $$;

-- ── badges ──────────────────────────────────────────────────
create table if not exists public.learn_user_badges (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  badge_id  text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table public.learn_user_badges enable row level security;
create index if not exists learn_user_badges_user_id_idx on public.learn_user_badges (user_id);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_user_badges' and policyname = 'Users can read own badges') then
    create policy "Users can read own badges" on public.learn_user_badges for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_user_badges' and policyname = 'Users can insert own badges') then
    create policy "Users can insert own badges" on public.learn_user_badges for insert with check (user_id = auth.uid());
  end if;
end $$;

-- ── PDF documents ───────────────────────────────────────────
create table if not exists public.learn_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  filename   text not null,
  file_path  text not null,
  file_size  integer not null,
  status     text not null default 'uploaded' check (status in ('uploaded', 'processing', 'processed', 'error')),
  deck_id    uuid references public.learn_decks (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.learn_documents enable row level security;
create index if not exists learn_documents_user_id_idx on public.learn_documents (user_id);
create index if not exists learn_documents_deck_id_idx on public.learn_documents (deck_id);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_documents' and policyname = 'Users can select their own documents') then
    create policy "Users can select their own documents" on public.learn_documents for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_documents' and policyname = 'Users can insert their own documents') then
    create policy "Users can insert their own documents" on public.learn_documents for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_documents' and policyname = 'Users can update their own documents') then
    create policy "Users can update their own documents" on public.learn_documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'learn_documents' and policyname = 'Users can delete their own documents') then
    create policy "Users can delete their own documents" on public.learn_documents for delete using (user_id = auth.uid());
  end if;
end $$;

-- ── deck aggregates RPC ─────────────────────────────────────
create or replace function public.get_decks_with_counts(user_id_param uuid)
returns table (
  id              uuid,
  user_id         uuid,
  title           text,
  description     text,
  color           text,
  created_at      timestamptz,
  updated_at      timestamptz,
  card_count      bigint,
  mastered_count  bigint,
  last_studied    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.user_id,
    d.title,
    d.description,
    d.color,
    d.created_at,
    d.updated_at,
    count(c.id)                                      as card_count,
    count(c.id) filter (where c.mastered = true)     as mastered_count,
    max(ss.completed_at)                             as last_studied
  from learn_decks d
  left join learn_cards c on c.deck_id = d.id
  left join learn_study_sessions ss on ss.deck_id = d.id
  where d.user_id = user_id_param
  group by d.id
  order by d.updated_at desc;
$$;

-- ── new-user bootstrap ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.learn_profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.learn_user_stats (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end $$;

-- ── storage bucket for PDF imports ──────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learn-docs', 'learn-docs', false, 52428800, '{application/pdf}')
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can upload their own documents') then
    create policy "Users can upload their own documents" on storage.objects for insert to authenticated
      with check (bucket_id = 'learn-docs' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can read their own documents') then
    create policy "Users can read their own documents" on storage.objects for select to authenticated
      using (bucket_id = 'learn-docs' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can delete their own documents') then
    create policy "Users can delete their own documents" on storage.objects for delete to authenticated
      using (bucket_id = 'learn-docs' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
