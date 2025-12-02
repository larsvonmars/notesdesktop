# AI Chats Database Schema

This document describes the Supabase database schema for storing AI chat conversations.

## AI Chats Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create ai_chats table
create table if not exists public.ai_chats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  note_id uuid references public.notes(id) on delete set null,
  title text not null default 'New Chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes
create index if not exists ai_chats_user_id_idx on public.ai_chats(user_id);
create index if not exists ai_chats_note_id_idx on public.ai_chats(note_id);
create index if not exists ai_chats_updated_at_idx on public.ai_chats(updated_at desc);

-- Enable Row Level Security (RLS)
alter table public.ai_chats enable row level security;

-- Create policy: Users can only see their own chats
create policy "Users can view their own ai_chats"
  on public.ai_chats for select
  using (auth.uid() = user_id);

-- Create policy: Users can insert their own chats
create policy "Users can create their own ai_chats"
  on public.ai_chats for insert
  with check (auth.uid() = user_id);

-- Create policy: Users can update their own chats
create policy "Users can update their own ai_chats"
  on public.ai_chats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create policy: Users can delete their own chats
create policy "Users can delete their own ai_chats"
  on public.ai_chats for delete
  using (auth.uid() = user_id);

-- Create trigger to automatically update updated_at
create trigger set_ai_chats_updated_at
  before update on public.ai_chats
  for each row
  execute function public.handle_updated_at();

-- Enable realtime
alter publication supabase_realtime add table ai_chats;
```

## Table Structure

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, auto-generated |
| `user_id` | uuid | Foreign key to auth.users |
| `note_id` | uuid | Optional foreign key to notes table |
| `title` | text | Chat title (auto-generated from first message) |
| `messages` | jsonb | Array of message objects |
| `created_at` | timestamp | When the chat was created |
| `updated_at` | timestamp | When the chat was last updated |

## Message Structure (JSONB)

Each message in the `messages` array has this structure:

```json
{
  "role": "user" | "assistant",
  "content": "The message text",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Example Queries

```sql
-- Get all chats for a user
select * from ai_chats 
where user_id = auth.uid() 
order by updated_at desc;

-- Get chats for a specific note
select * from ai_chats 
where note_id = 'your-note-id' 
order by updated_at desc;

-- Search messages content
select * from ai_chats 
where user_id = auth.uid() 
and messages::text ilike '%search term%';
```
