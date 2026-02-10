# Database Schema for Notes

This document describes the Supabase database schema required for the notes functionality.

## Notes Table

Create this table in your Supabase SQL Editor:

```sql
-- Create notes table
create table if not exists public.notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on user_id for faster queries
create index if not exists notes_user_id_idx on public.notes(user_id);

-- Create index on updated_at for sorting
create index if not exists notes_updated_at_idx on public.notes(updated_at desc);

-- Enable Row Level Security (RLS)
alter table public.notes enable row level security;

-- Create policy: Users can only see their own notes
create policy "Users can view their own notes"
  on public.notes for select
  using (auth.uid() = user_id);

-- Create policy: Users can insert their own notes
create policy "Users can create their own notes"
  on public.notes for insert
  with check (auth.uid() = user_id);

-- Create policy: Users can update their own notes
create policy "Users can update their own notes"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create policy: Users can delete their own notes
create policy "Users can delete their own notes"
  on public.notes for delete
  using (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger set_updated_at
  before update on public.notes
  for each row
  execute function public.handle_updated_at();
```

## Setup Instructions

1. **Go to your Supabase Dashboard**
   - Navigate to your project at [app.supabase.com](https://app.supabase.com)

2. **Open the SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Schema**
   - Copy the entire SQL code above
   - Paste it into the SQL editor
   - Click "Run" or press `Cmd/Ctrl + Enter`

4. **Verify the Table**
   - Go to "Table Editor" in the left sidebar
   - You should see the `notes` table listed
   - Click on it to verify the structure

## Table Structure

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, auto-generated |
| `user_id` | uuid | Foreign key to auth.users, identifies note owner |
| `title` | text | Note title (required) |
| `content` | text | Note content (optional, defaults to empty string) |
| `created_at` | timestamp | When the note was created (auto-set) |
| `updated_at` | timestamp | When the note was last updated (auto-updated) |

## Security (Row Level Security)

The table has RLS enabled with the following policies:

- ✅ Users can only **view** their own notes
- ✅ Users can only **create** notes for themselves
- ✅ Users can only **update** their own notes
- ✅ Users can only **delete** their own notes

This ensures data isolation between users - no one can access another user's notes.

## Real-time Subscriptions

The table is automatically enabled for real-time subscriptions. The app uses this to:
- Get instant updates when notes are created/updated/deleted
- Sync across multiple app instances
- Provide a seamless multi-device experience

## Indexes

Two indexes are created for performance:
1. `notes_user_id_idx` - Speeds up fetching notes by user
2. `notes_updated_at_idx` - Speeds up sorting notes by update time

## Automatic Timestamps

The `updated_at` field is automatically updated whenever a note is modified, thanks to the trigger function `handle_updated_at()`.

## Testing the Schema

After running the schema, you can test it with these SQL queries:

```sql
-- Insert a test note (replace with your user_id from auth.users)
insert into notes (user_id, title, content)
values (auth.uid(), 'Test Note', 'This is a test');

-- Fetch all your notes
select * from notes where user_id = auth.uid();

-- Update a note
update notes 
set title = 'Updated Title', content = 'Updated content'
where id = 'your-note-id';

-- Delete a note
delete from notes where id = 'your-note-id';
```

## Next Steps

Once the schema is created:
1. The app's notes functionality will work automatically
2. Create, edit, and delete notes in the dashboard
3. All data is securely stored and isolated per user
