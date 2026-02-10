#!/bin/bash

echo "🏔️  Starting Saentis Notes (Web Version)..."
echo ""
echo "Note: Using web version due to macOS Tauri compatibility issue"
echo "All features work identically in the browser!"
echo ""

# Kill any existing Next.js processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Start Next.js
npm run dev

echo ""
echo "✅ App stopped"
