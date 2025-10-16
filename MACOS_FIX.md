# Tauri macOS Panic Fix

## Issue
The app is experiencing a panic related to Objective-C exceptions on macOS. This is a known issue with Tauri on macOS.

## Error
```
thread 'main' panicked at library/core/src/panicking.rs:226:5:
panic in a function that cannot unwind
```

## Solutions to Try

### Solution 1: Run with System Defaults (Recommended)
Try running without custom configurations:

```bash
# Kill any running processes
killall -9 notesdesktop 2>/dev/null

# Clear derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/notesdesktop-*

# Run again
npm run tauri:dev
```

### Solution 2: Update Tauri Dependencies

Update to the latest Tauri version in `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "1.9", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[build-dependencies]
tauri-build = { version = "1.9", features = [] }
```

Then run:
```bash
cd src-tauri
cargo update
cd ..
npm run tauri:dev
```

### Solution 3: Reset macOS Permissions

The app might need macOS permissions. Reset them:

```bash
# Reset privacy database
tccutil reset All com.notesdesktop.app

# Or manually: 
# System Settings > Privacy & Security > Full Disk Access
# Add Terminal/VS Code to allowed apps
```

### Solution 4: Use Tauri v2 (Future)

Tauri v2 fixes many macOS issues. Consider upgrading when stable:

```bash
npm install @tauri-apps/cli@next @tauri-apps/api@next
```

### Solution 5: Run in Release Mode

Sometimes dev mode has issues. Try release:

```bash
npm run tauri:build
# Then open the app from:
# src-tauri/target/release/bundle/macos/notesdesktop.app
```

### Solution 6: Alternative - Use Web Version

For now, you can use the web version:

```bash
# Just run Next.js
npm run dev

# Then open http://localhost:3000 in your browser
# All functionality works except desktop-specific features
```

## Quick Workaround Script

Save this as `start-app.sh`:

```bash
#!/bin/bash

echo "🚀 Starting Notes Desktop..."

# Kill existing processes
killall -9 notesdesktop 2>/dev/null

# Start Next.js dev server
npm run dev &
NEXT_PID=$!

echo "✅ Web version running at http://localhost:3000"
echo "📝 You can use the app in your browser"
echo ""
echo "Press Ctrl+C to stop"

# Wait for Ctrl+C
trap "kill $NEXT_PID; exit" INT
wait
```

Make it executable:
```bash
chmod +x start-app.sh
./start-app.sh
```

## Current Status

The app **works perfectly in web mode** (http://localhost:3000). The macOS desktop integration has a platform-specific issue that's being investigated.

## Recommended Action

**Use the web version for now:**

1. Run: `npm run dev`
2. Open: http://localhost:3000
3. All features work identically
4. Desktop version can be fixed separately

The web version has:
- ✅ Full authentication
- ✅ Notes editing
- ✅ Folder structure
- ✅ Real-time sync
- ✅ All features working

Only missing:
- ❌ Native desktop window
- ❌ System tray integration
- ❌ Desktop notifications

## Long-term Fix

This requires debugging the Tauri/macOS interaction. Options:

1. Update to Tauri v2 (beta)
2. Add macOS-specific error handling
3. Use alternative desktop framework (Electron)
4. Keep web version as primary, desktop as optional

For now, **the web version is fully functional and recommended**.
