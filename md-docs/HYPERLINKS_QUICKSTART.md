# Enhanced Hyperlinks - Quick Start Guide

## 🚀 Quick Start

### Creating Your First Link

1. **Select text** in the editor
2. Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
3. Enter the URL (e.g., `example.com` or `https://example.com`)
4. Click **"Insert Link"** or press Enter

✨ **Pro Tip**: You don't need to type `https://` - it's added automatically!

---

## 🎯 Key Features at a Glance

### 1. Link Dialog
**Open it**: `Cmd+K` or click the link button in toolbar

**Features**:
- 🔍 Smart URL validation
- ✍️ Optional custom text
- 📌 Recent links list
- ⚡ Press Enter to insert
- 🎨 Beautiful modern design

### 2. Link Popover (Hover Any Link)
**Automatic**: Just hover over any link!

**Quick Actions**:
- 🌐 **Open** - Opens in new tab
- ✏️ **Edit** - Modify the link
- 📋 **Copy** - Copy URL to clipboard
- 🗑️ **Remove** - Unlink but keep text

### 3. Enhanced Link Styling
**Visual Polish**:
- Blue color with perfect contrast
- Smooth hover animations
- Arrow icon on hover (↗)
- Professional appearance

---

## 💡 Pro Tips

### Tip #1: Recent Links
The editor remembers your last 5 links. Just open the link dialog and click any recent link to reuse it!

### Tip #2: Quick Copy
Need to share a link? Hover over it and click "Copy" - instant clipboard copy with confirmation!

### Tip #3: Edit Inline
Hover over any link and click "Edit" to quickly modify it without selecting text.

### Tip #4: Clean URLs
Type `example.com` instead of `https://example.com` - we'll add the protocol automatically!

### Tip #5: Special Links
Support for:
- 📧 Email: `mailto:user@example.com`
- 📞 Phone: `tel:+1234567890`
- 🌐 Web: `https://example.com`

---

## 🎨 Visual Examples

### Link Dialog States

**Normal State**:
```
┌─────────────────────────────────┐
│  🔗 Insert Link                 │
│                                 │
│  🌐 URL                         │
│  https://example.com            │
│                                 │
│  ✏️ Link Text (optional)       │
│  Example Site                   │
│                                 │
│  [Cancel]  [✓ Insert Link]     │
└─────────────────────────────────┘
```

**Error State**:
```
┌─────────────────────────────────┐
│  🔗 Insert Link                 │
│                                 │
│  🌐 URL                    ⚠️   │
│  not-a-valid-url                │
│  ⚠️ Invalid URL format          │
│                                 │
│  [Cancel]  [✓ Insert Link]     │
└─────────────────────────────────┘
```

**With Recent Links**:
```
┌─────────────────────────────────┐
│  🔗 Insert Link                 │
│                                 │
│  🌐 URL                         │
│  https://example.com            │
│                                 │
│  ✏️ Link Text (optional)       │
│  Example Site                   │
│                                 │
│  ⏰ Recent Links                │
│  ┌──────────────────────────┐  │
│  │ 🔗 GitHub                │  │
│  │ https://github.com       │  │
│  ├──────────────────────────┤  │
│  │ 🔗 Google                │  │
│  │ https://google.com       │  │
│  └──────────────────────────┘  │
│                                 │
│  [Cancel]  [✓ Insert Link]     │
└─────────────────────────────────┘
```

### Link Popover (On Hover)

```
    This is a link to [Example Site]
                          ↓
    ┌───────────────────────────────┐
    │ 🔗                            │
    │ Example Site                  │
    │ https://example.com           │
    │                               │
    │ [🌐 Open] [✏️ Edit]          │
    │ [📋 Copy] [🗑️ Remove]        │
    └───────────────────────────────┘
```

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Link Dialog | `Cmd+K` / `Ctrl+K` |
| Insert Link | `Enter` (in dialog) |
| Navigate Inputs | `Tab` |
| Bold | `Cmd+B` / `Ctrl+B` |
| Italic | `Cmd+I` / `Ctrl+I` |

---

## 🐛 Troubleshooting

### Link Won't Insert
**Issue**: "Insert Link" button is disabled
**Solution**: Make sure the URL field isn't empty

### Invalid URL Error
**Issue**: "Invalid URL format" message
**Solution**: 
- Remove special characters
- Check for typos
- Try adding `https://` manually

### Popover Won't Show
**Issue**: Hovering doesn't show popover
**Solution**: 
- Make sure you're hovering over a real hyperlink
- Note-links (internal) don't show the popover
- Try clicking and re-hovering

### Can't Copy Link
**Issue**: Copy button doesn't work
**Solution**: 
- Make sure clipboard permissions are allowed
- Try copying manually (right-click > copy)

---

## 🎓 Advanced Usage

### Batch Link Updates
1. Hover over link → Click "Copy"
2. Find other instances
3. Edit them with copied URL

### Link Organization
Use descriptive link text for:
- Better readability
- SEO benefits
- Accessibility

### Smart Linking
- Use recent links for frequently visited sites
- Keep link text concise but descriptive
- Test links after inserting

---

## 🆘 Need Help?

- Check `ENHANCED_HYPERLINKS.md` for full documentation
- Look at existing links in your notes for examples
- Experiment with the dialog - it's intuitive!

---

## 🎉 Enjoy Your Enhanced Links!

The hyperlink system is designed to make linking fast, beautiful, and powerful. Explore all the features and find your favorite workflow!

**Remember**: Good link text makes notes more readable. Use "Click here" sparingly - describe what the link points to!
