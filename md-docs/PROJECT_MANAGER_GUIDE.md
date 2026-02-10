# Project Manager Feature Guide

## Overview

The Project Manager is a new organizational feature that provides a top-level structure for managing your notes and folders. Projects act as containers that can hold both folders and notes, making it easier to organize your work into distinct areas.

## Features

- **Create Projects**: Organize your work into separate projects
- **Color Coding**: Assign colors to projects for easy visual identification
- **Descriptions**: Add descriptions to provide context for each project
- **Statistics**: See folder and note counts for each project at a glance
- **Search**: Quickly find projects by name or description
- **Real-time Updates**: Changes sync automatically across all instances

## How to Use

### Accessing the Project Manager

1. Open any note in the editor
2. Look at the bottom status bar
3. Click the **"Projects"** button (with the target icon)
4. The Project Manager modal will open

### Creating a Project

1. Open the Project Manager
2. Click **"New Project"** button
3. Enter a project name (required)
4. Optionally add a description
5. Choose a color for the project
6. Click **"Create"**

### Managing Projects

#### Edit a Project
- Click the edit icon (pencil) on any project
- Update the name, description, or color
- Click **"Save"**

#### Delete a Project
- Click the delete icon (trash) on any project
- Confirm the deletion
- Note: Folders and notes will be moved to "No Project" (they won't be deleted)

#### View Project Contents
- Click on a project to expand/collapse it
- View all folders and notes within the project
- Click on any item to open it

### Organizing with Projects

The hierarchy works like this:

```
Projects (Top Level)
├── 🎯 Work Project
│   ├── 📁 Meeting Notes Folder
│   │   ├── 📄 Q1 Review Note
│   │   └── 📄 Team Sync Note
│   ├── 📁 Documentation Folder
│   └── 📄 Project Overview Note (directly in project)
│
├── 🎯 Personal Project
│   ├── 📁 Ideas Folder
│   └── 📄 Todo List Note
│
└── 📄 Uncategorized Items (no project)
```

## Database Setup

Before using the Project Manager, you need to set up the database schema in Supabase:

1. Go to your Supabase Dashboard
2. Open the SQL Editor
3. Copy the SQL from `PROJECTS_SCHEMA.md`
4. Run the SQL to create the projects table and update existing tables
5. The schema includes:
   - `projects` table
   - `project_id` column added to `folders` table
   - `project_id` column added to `notes` table

See [PROJECTS_SCHEMA.md](./PROJECTS_SCHEMA.md) for the complete SQL schema.

## Keyboard Shortcuts

- `Esc` - Close any open modal or dialog

## Tips

1. **Use Colors Wisely**: Assign different colors to different types of projects (e.g., blue for work, green for personal)
2. **Add Descriptions**: Descriptions help you remember the purpose of each project
3. **Organize Gradually**: You don't need to move all items to projects immediately - work at your own pace
4. **Search is Your Friend**: Use the search bar to quickly find projects as your list grows

## Future Enhancements

Planned features for upcoming releases:
- Drag and drop to move items between projects
- Project templates
- Project archiving
- Uploaded files support
- Project-based filtering in the main note browser
- Project export/import

## Troubleshooting

### "Projects" button not showing
- Make sure you're viewing a note (not the welcome screen)
- Check the bottom status bar on the left side

### Projects not loading
- Ensure you've run the SQL schema in Supabase
- Check your internet connection
- Verify your Supabase credentials in `.env.local`

### Changes not syncing
- Real-time updates require an active internet connection
- Check the browser console for any errors
- Refresh the page if needed

## Technical Details

The Project Manager uses:
- **Supabase** for database storage and real-time updates
- **React** for the UI components
- **Tailwind CSS** for styling
- **Row Level Security (RLS)** to ensure data privacy

All project data is private to your account and cannot be accessed by other users.

## Related Documentation

- [PROJECTS_SCHEMA.md](./PROJECTS_SCHEMA.md) - Database schema
- [FOLDERS_SCHEMA.md](./FOLDERS_SCHEMA.md) - Folders schema
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Base notes schema
