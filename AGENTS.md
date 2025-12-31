# Agent Instructions

## Project Overview
A Tinder-style photo reviewer for quickly selecting photos from large collections (e.g., wedding photos on Google Drive).

## Architecture
- **Frontend**: Static HTML/CSS/JS (no framework)
- **Backend**: Python scripts for fetching/downloading
- **Data**: `photos.json` contains photo metadata from Google Drive
- **State**: Browser localStorage for persistence, JSON export for backup

## Key Files
| File | Purpose |
|------|---------|
| `app.js` | All frontend logic - state, UI, keyboard handling |
| `fetch_photos.py` | Fetch photo list from Google Drive API |
| `download_selected.py` | Download accepted photos after review |
| `photos.json` | Generated photo metadata (gitignored) |

## Deployment
```bash
# Deploy to Cloudflare Pages
cp index.html styles.css app.js photos.json dist/
npx wrangler pages deploy dist --project-name photo-reviewer
```

Live: https://photo-reviewer.pages.dev

## Development
```bash
# Fetch photos from Google Drive
python fetch_photos.py "https://drive.google.com/drive/folders/FOLDER_ID"

# Start local server
python -m http.server 8765
```

## Data Flow
1. `fetch_photos.py` → creates `photos.json` with IDs, names, thumbnail URLs
2. `app.js` loads `photos.json`, user reviews with keyboard
3. Decisions saved to localStorage + can export to `photo_review_state.json`
4. `download_selected.py` reads state, downloads accepted photos

## State Structure
```javascript
// localStorage: 'photoReviewerState'
{
  decisions: { [photoId]: 'accepted' | 'rejected' | 'maybe' },
  target: 300,
  lastUpdated: "2024-12-31T..."
}
```

## Keyboard Shortcuts
- `→` / `Space`: Accept
- `←`: Skip/Reject  
- `↑`: Maybe
- `Ctrl+Z`: Undo
- Click thumbnail: Jump to photo

## Sensitive Files (gitignored)
- `.env` - Google API key
- `mcp.json` - OAuth credentials
- `photos.json` - Contains Drive file IDs
- `dist/` - Deploy folder

## Common Tasks

### Add new feature to UI
Edit `app.js` (logic) and `styles.css` (styling). No build step needed.

### Change photo source
Modify `fetch_photos.py` to fetch from different source. Output must be JSON array with `id`, `name`, `thumbnail` fields.

### Deploy update
```bash
cp index.html styles.css app.js photos.json dist/
npx wrangler pages deploy dist --project-name photo-reviewer
```
