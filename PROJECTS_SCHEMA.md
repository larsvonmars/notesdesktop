# Projects Schema

This document describes the database schema for the projects feature, which provides a top-level organizational structure above folders.

## Projects Table

Add this to your Supabase SQL Editor:

```sql
-- Create projects table
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  color text default '#3B82F6',
  position integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for faster queries
create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_position_idx on public.projects(position);

-- Enable Row Level Security (RLS)
alter table public.projects enable row level security;

-- Create policies for projects
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Update projects trigger for updated_at
create trigger set_projects_updated_at
  before update on public.projects
  for each row
  execute function public.handle_updated_at();
```

## Update Folders Table for Projects

Add project support to the existing folders table:

```sql
-- Add project_id column to folders table
alter table public.folders 
add column if not exists project_id uuid references public.projects(id) on delete set null;

-- Create index for project filtering
create index if not exists folders_project_id_idx on public.folders(project_id);
```

## Update Notes Table for Projects

Add project support to the existing notes table:

```sql
-- Add project_id column to notes table
alter table public.notes 
add column if not exists project_id uuid references public.projects(id) on delete set null;

-- Create index for project filtering
create index if not exists notes_project_id_idx on public.notes(project_id);
```

## Database Structure

### Projects Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, auto-generated |
| `user_id` | uuid | Owner of the project |
| `name` | text | Project name |
| `description` | text | Optional project description |
| `color` | text | Hex color code for visual identification |
| `position` | integer | Order in project list |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

### Updated Folders Table

Additional column:

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | uuid | Parent project (null for no project) |

### Updated Notes Table

Additional column:

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | uuid | Parent project (null for no project) |

## Project Hierarchy

The structure supports projects as top-level containers:

```
Projects
├── 🎯 Work Project
│   ├── 📁 Meeting Notes
│   │   ├── 📄 Q1 Review
│   │   └── 📄 Team Sync
│   ├── 📁 Documentation
│   └── 📄 Project Overview
├── 🎯 Personal
│   ├── 📁 Ideas
│   └── 📄 Todo List
└── 📄 Uncategorized (no project)
```

## Querying Projects

### Get all projects:
```sql
select * from projects 
where user_id = auth.uid()
order by position;
```

### Get all folders in a project:
```sql
select * from folders 
where user_id = auth.uid() 
  and project_id = 'project-uuid-here'
order by position;
```

### Get all notes in a project:
```sql
select * from notes 
where user_id = auth.uid() 
  and project_id = 'project-uuid-here'
order by position;
```

### Get items without a project:
```sql
-- Folders without project
select * from folders 
where user_id = auth.uid() 
  and project_id is null
order by position;

-- Notes without project
select * from notes 
where user_id = auth.uid() 
  and project_id is null
order by position;
```

## Cascade Behavior

- **Delete project**: Sets `project_id` to NULL for all child folders and notes
- **Delete user**: Deletes all projects, folders, and notes (cascade)

## Security

Row Level Security (RLS) ensures:
- ✅ Users can only see their own projects
- ✅ Users can only modify their own projects
- ✅ Project hierarchy is enforced per user
- ✅ No cross-user project access

## Real-time Support

Projects support real-time subscriptions:
```typescript
supabase
  .channel('project-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'projects',
    filter: `user_id=eq.${userId}`
  }, callback)
  .subscribe()
```

## Migration Notes

For existing folders and notes without projects:
- `project_id` will be NULL (no project)
- No data loss
- Items can be moved to projects later

## Complete Setup

Run all SQL blocks above to:
1. Create the projects table
2. Add project support to folders table
3. Add project support to notes table
4. Set up RLS policies
5. Create necessary indexes
6. Enable real-time subscriptions

## Next Steps

After running this schema:
1. Use the project API to create/manage projects
2. Move folders and notes into projects
3. Build project management UI
4. Add project filtering views
