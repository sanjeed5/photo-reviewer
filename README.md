# Photo Reviewer

A Tinder-style photo reviewer for quickly selecting the best photos from large collections. Built for reviewing wedding photos from Google Drive.

## The Story 😄

> "I have 3800+ wedding photos on Google Drive. I need to pick 300. Help?"

What started as a simple request turned into a journey:

1. **"Just use Google Drive"** → Too slow, no tracking, manual downloads
2. **"Let's use gdown"** → Hit 50-file limit per folder 🤦
3. **"Google Drive API it is"** → Works! But 3800 photos to review one-by-one?
4. **"Let's group similar photos"** → Over-engineered, groups of 200+ photos
5. **"Forget grouping, keep it simple"** → ✨ Current solution ✨

The lesson: Sometimes the simplest solution wins. A clean UI with keyboard shortcuts beats a complex ML-powered grouping system.

## Features

- 📁 **Folder filtering** - Focus on one folder at a time
- ⌨️ **Keyboard shortcuts** - Fast reviewing with arrow keys
- 👀 **Preview strip** - See upcoming photos, click to jump
- 💾 **Auto-save** - Progress saved after every decision
- 📤 **Export/Import** - Backup and restore your progress
- 📥 **Download script** - Batch download your selections

## Quick Start

### For Google Drive (Public Folders)

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/photo-reviewer.git
cd photo-reviewer

# 2. Setup
cp .env.example .env
# Add your Google API key to .env

# 3. Fetch photos
python fetch_photos.py "https://drive.google.com/drive/folders/YOUR_FOLDER_ID"

# 4. Start reviewing
python -m http.server 8765
# Open http://localhost:8765
```

### For Local Photos

```bash
# Scan local folder
python scan_local.py /path/to/photos

# Start reviewing
python -m http.server 8765
```

## Keyboard Shortcuts

### Pending Mode (reviewing)
| Key | Action |
|-----|--------|
| `D` or `→` or `Space` | Accept |
| `A` or `←` | Reject |
| `G` | Toggle grid mode |
| `Ctrl+Z` | Undo |
| `Click photo` | Zoom in/out |
| `Click thumbnail` | Jump to that photo |

### Accepted/Rejected Mode (browsing)
| Key | Action |
|-----|--------|
| `←` / `→` | Navigate |
| `Space` | Reverse decision (accept↔reject) |
| `G` | Toggle grid mode |

### Grid Mode
| Key | Action |
|-----|--------|
| `1-4` | Select photos |
| `Space` | Accept selected (pending) / Reverse selected (browse) |
| `←` / `→` | Navigate batches |

## Workflow

1. **Pick a folder** from the dropdown (or review all)
2. **Review photos** - Accept the good ones, reject the rest
3. **Check "Accepted"** tab to review your selections
4. **Check "Rejected"** tab to rescue any you want back
5. **Export** when done - creates backup + results file

## Modes

| Mode | Purpose |
|------|---------|
| **Pending** | Unreviewed photos |
| **Accepted** | Your selections - can reverse to rejected |
| **Rejected** | Skipped photos - can reverse to accepted |

## After Reviewing

```bash
# Download your accepted photos
python download_selected.py photo_review_state.json ./selected_photos
```

## Data Safety

- **Auto-save**: Every decision saves to browser localStorage
- **Export**: Creates `photo_review_state.json` - full backup of all decisions
- **Import**: Restore progress from any backup file
- **Tab close warning**: Browser warns before closing if you have unsaved work

## Files

```
photo-reviewer/
├── js/
│   ├── app.js            # Main entry point
│   ├── state.js          # State management, export/import
│   ├── ui.js             # UI updates and rendering
│   └── controls.js       # Keyboard handling, navigation
├── fetch_photos.py       # Fetch from Google Drive
├── scan_local.py         # Scan local folder
├── download_selected.py  # Download accepted photos
├── index.html            # Web UI
├── styles.css            # Styling
├── photos.json           # Generated photo list (gitignored)
└── .env                  # Your Google API key (not committed)
```

## Requirements

- Python 3.10+
- Google API key (for Drive access)
- Modern web browser

## Getting a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use existing)
3. Enable "Google Drive API"
4. Create credentials → API Key
5. Add to `.env`: `GOOGLE_API_KEY=your_key_here`

## License

MIT
