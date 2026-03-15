#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function exists(p) {
  return fs.existsSync(p)
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function copyDirectoryContents(srcDir, destDir) {
  if (!exists(srcDir)) {
    throw new Error(`Missing source directory: ${path.relative(root, srcDir)}`)
  }

  ensureDir(destDir)

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true, force: true })
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function copyIfPresent(srcFile, destFile) {
  if (!exists(srcFile)) {
    return false
  }

  ensureDir(path.dirname(destFile))
  fs.copyFileSync(srcFile, destFile)
  return true
}

function main() {
  const webSource = path.join(root, 'icons', 'web')
  const iosSource = path.join(root, 'icons', 'ios')
  const androidResSource = path.join(root, 'icons', 'android', 'res')

  const webDest = path.join(root, 'public')
  const iosDest = path.join(root, 'src-tauri', 'icons', 'ios')
  const androidResDest = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res')

  copyDirectoryContents(webSource, webDest)
  copyDirectoryContents(iosSource, iosDest)

  if (exists(androidResDest)) {
    copyDirectoryContents(androidResSource, androidResDest)
  } else {
    console.log('Skipping Android icon sync (Android project not initialized).')
  }

  const desktopSource = path.join(webSource, 'icon-512.png')
  const desktopIconDest = path.join(root, 'src-tauri', 'icons', 'icon.png')
  if (copyIfPresent(desktopSource, desktopIconDest)) {
    console.log('Synced desktop icon source to src-tauri/icons/icon.png')
  }

  console.log('Icon sync complete.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Icon sync failed: ${message}`)
  process.exit(1)
}
