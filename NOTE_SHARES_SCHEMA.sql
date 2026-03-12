-- NOTE SHARES SCHEMA
-- Creates a public read-only publishing layer for notes.

create table if not exists public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  title text not null,
  content text not null default '',
  note_type text not null,
  metadata jsonb,
  published_at timestamp with time zone not null default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint note_shares_note_id_key unique (note_id),
  constraint note_shares_note_type_check check (
    note_type in ('rich-text', 'drawing', 'mindmap', 'bullet-journal', 'data-sheet', 'pdf-annotation')
  )
);

create index if not exists note_shares_user_id_idx on public.note_shares(user_id);
create index if not exists note_shares_share_token_idx on public.note_shares(share_token);
create index if not exists note_shares_published_at_idx on public.note_shares(published_at desc);

alter table public.note_shares enable row level security;

create policy "Users can view their own note shares"
  on public.note_shares for select
  using (auth.uid() = user_id);

create policy "Users can create their own note shares"
  on public.note_shares for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own note shares"
  on public.note_shares for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own note shares"
  on public.note_shares for delete
  using (auth.uid() = user_id);

create policy "Published note shares are publicly readable"
  on public.note_shares for select
  using (published_at is not null);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_note_shares_updated_at on public.note_shares;

create trigger set_note_shares_updated_at
  before update on public.note_shares
  for each row
  execute function public.handle_updated_at();