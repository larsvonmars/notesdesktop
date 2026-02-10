# Folders & Nested Structure Schema

This document describes the database schema for folders and nested note organization.

## Folders Table

Add this to your Supabase SQL Editor:

```sql
-- Create folders table
create table if not exists public.folders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  position integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for faster queries
create index if not exists folders_user_id_idx on public.folders(user_id);
create index if not exists folders_parent_id_idx on public.folders(parent_id);
create index if not exists folders_position_idx on public.folders(position);

-- Enable Row Level Security (RLS)
alter table public.folders enable row level security;

-- Create policies for folders
create policy "Users can view their own folders"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "Users can create their own folders"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own folders"
  on public.folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own folders"
  on public.folders for delete
  using (auth.uid() = user_id);

-- Update folders trigger for updated_at
create trigger set_folders_updated_at
  before update on public.folders
  for each row
  execute function public.handle_updated_at();
```

## Update Notes Table for Folders

Add folder support to the existing notes table:

```sql
-- Add folder_id column to notes table
alter table public.notes 
add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- Create index for folder filtering
create index if not exists notes_folder_id_idx on public.notes(folder_id);

-- Add position column for ordering within folders
alter table public.notes
add column if not exists position integer default 0 not null;

create index if not exists notes_position_idx on public.notes(position);
```

## Database Structure

### Folders Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, auto-generated |
| `user_id` | uuid | Owner of the folder |
| `name` | text | Folder name |
| `parent_id` | uuid | Parent folder ID (null for root folders) |
| `position` | integer | Order within parent |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

### Updated Notes Table

Additional columns:

| Column | Type | Description |
|--------|------|-------------|
| `folder_id` | uuid | Parent folder (null for root notes) |
| `position` | integer | Order within folder |

## Folder Hierarchy

The structure supports unlimited nesting:

```
Root Level
├── 📁 Work
│   ├── 📁 Projects
│   │   ├── 📁 Project A
│   │   │   ├── 📄 Note 1
│   │   │   └── 📄 Note 2
│   │   └── 📁 Project B
│   └── 📄 Meeting Notes
├── 📁 Personal
│   ├── 📄 Todo List
│   └── 📄 Ideas
└── 📄 Uncategorized Note
```

## Querying Nested Folders

### Get all root folders (top level):
```sql
select * from folders 
where user_id = auth.uid() 
  and parent_id is null
order by position;
```

### Get subfolders of a specific folder:
```sql
select * from folders 
where user_id = auth.uid() 
  and parent_id = 'folder-uuid-here'
order by position;
```

### Get all notes in a folder:
```sql
select * from notes 
where user_id = auth.uid() 
  and folder_id = 'folder-uuid-here'
order by position;
```

### Get all root notes (not in any folder):
```sql
select * from notes 
where user_id = auth.uid() 
  and folder_id is null
order by position;
```

### Get folder breadcrumb path (recursive):
```sql
with recursive folder_path as (
  -- Base case: start with the target folder
  select id, name, parent_id, 1 as level
  from folders
  where id = 'target-folder-id'
  
  union all
  
  -- Recursive case: get parent folders
  select f.id, f.name, f.parent_id, fp.level + 1
  from folders f
  join folder_path fp on f.id = fp.parent_id
)
select * from folder_path
order by level desc;
```

## Cascade Behavior

- **Delete folder**: Sets `folder_id` to NULL for all child notes
- **Delete parent folder**: Deletes all child folders (cascade)
- **Delete user**: Deletes all folders and notes (cascade)

## Position Management

The `position` field allows custom ordering:
- Lower numbers appear first
- Gaps in numbers are allowed
- Can be reordered by updating position values

## Security

Row Level Security (RLS) ensures:
- ✅ Users can only see their own folders
- ✅ Users can only modify their own folders
- ✅ Folder hierarchy is enforced per user
- ✅ No cross-user folder access

## Real-time Support

Folders support real-time subscriptions:
```typescript
supabase
  .channel('folder-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'folders',
    filter: `user_id=eq.${userId}`
  }, callback)
  .subscribe()
```

## Migration Notes

For existing notes without folders:
- `folder_id` will be NULL (root level)
- No data loss
- Notes can be moved to folders later

## Complete Setup

Run both SQL blocks above to:
1. Create the folders table
2. Add folder support to notes table
3. Set up RLS policies
4. Create necessary indexes
5. Enable real-time subscriptions

## Next Steps

After running this schema:
1. Use the folder API to create/manage folders
2. Move notes into folders
3. Build nested folder UI
4. Add drag-and-drop support
