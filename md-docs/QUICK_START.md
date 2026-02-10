# Quick Start Guide

## 🚀 Running the App

### Web Version (Recommended - macOS Compatible)

```bash
./start-web.sh
# OR
npm run dev
```

Then open: **http://localhost:3000**

### Desktop Version (Currently Has macOS Issues)

```bash
npm run tauri:dev
```

⚠️ **Known Issue**: The desktop app crashes on macOS due to an Objective-C exception in the Tauri windowing library. See `MACOS_FIX.md` for troubleshooting steps.

## ✅ What Works

All features are fully functional in the web version:

- ✅ User authentication (sign up, login, logout)
- ✅ Create, edit, and delete notes
- ✅ Auto-save with Cmd/Ctrl+S shortcut
- ✅ Folder organization with unlimited nesting
- ✅ Real-time synchronization
- ✅ Responsive UI with Tailwind CSS

## 📋 First-Time Setup Checklist

1. **Install dependencies** (if not done):
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   - Copy `.env.local.example` to `.env.local`
   - Add your Supabase URL and anon key

3. **Set up database**:
   - Run SQL from `DATABASE_SCHEMA.md` in Supabase SQL editor
   - Run SQL from `FOLDERS_SCHEMA.md` in Supabase SQL editor

4. **Start the app**:
   ```bash
   ./start-web.sh
   ```

5. **Create an account**:
   - Navigate to http://localhost:3000
   - Click "Sign Up"
   - Enter email and password
   - Start taking notes!

## 🔧 Troubleshooting

### Port 3000 already in use
```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

### Desktop app crashes on macOS
- Use the web version instead (identical functionality)
- See `MACOS_FIX.md` for advanced troubleshooting
- Consider waiting for Tauri v2 update

### Authentication not working
- Check `.env.local` has correct Supabase credentials
- Verify Supabase project is not paused
- Check browser console for errors

## 📚 Documentation

- `README.md` - Project overview
- `SETUP.md` - Detailed setup instructions
- `DATABASE_SCHEMA.md` - Database structure for notes
- `FOLDERS_SCHEMA.md` - Database structure for folders
- `MACOS_FIX.md` - Troubleshooting desktop app on macOS

## 🎯 Next Steps

1. **Use the web version** - It has all features working
2. **Set up your database** - Run the SQL schemas in Supabase
3. **Create folders** - Right-click in folder tree to organize notes
4. **Try keyboard shortcuts** - Cmd/Ctrl+S to save

---

**Need help?** Check the full documentation in the project root.
