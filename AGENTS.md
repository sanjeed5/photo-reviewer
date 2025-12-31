# Agent Instructions

## Project Overview

Download photos from Google Drive at reduced quality for fast local review. Simple 2-script workflow:

1. `fetch_photos.py` — Get photo list from Google Drive
2. `download_photos.py` — Download all photos locally

## Files

| File | Purpose |
|------|---------|
| `fetch_photos.py` | Fetch photo metadata from Google Drive API |
| `download_photos.py` | Download photos locally at specified quality |
| `photos.json` | Generated photo metadata (gitignored) |
| `.env` | Google API key (gitignored) |
| `.env.example` | Example environment file |

## Usage

```bash
# Set API key
export GOOGLE_API_KEY="..."

# Fetch photos from Drive folder
python fetch_photos.py "https://drive.google.com/drive/folders/FOLDER_ID"

# Download all photos
python download_photos.py

# Download options
python download_photos.py --size 800          # Smaller files
python download_photos.py --folder "WEDDING"  # Filter by folder
python download_photos.py --concurrent 20     # Faster downloads
```

## Data Flow

```
Google Drive folder
        ↓
fetch_photos.py (uses Drive API)
        ↓
photos.json (id, name, thumbnail URL)
        ↓
download_photos.py (async httpx)
        ↓
./photos_to_review/ (local folder with photos)
```

## photos.json Format

```json
[
  {
    "id": "1abc...",
    "name": "WEDDING/CAM 1/IMG_1234.JPG",
    "thumbnail": "https://lh3.googleusercontent.com/d/1abc...=w1200"
  }
]
```

## Key Implementation Details

### fetch_photos.py
- Uses `googleapiclient` with API key (no OAuth needed for public folders)
- Recursively traverses subfolders
- Falls back to `gdown` if no API key (limited to 50 files/folder)

### download_photos.py
- Uses `httpx` async client for concurrent downloads
- Semaphore limits concurrent connections (default: 10)
- Preserves folder structure from photo names
- Retries failed downloads with exponential backoff
- Skips already-downloaded files

## Sensitive Files (gitignored)

- `.env` — Contains `GOOGLE_API_KEY`
- `photos.json` — Contains Drive file IDs
- `photos_to_review/` — Downloaded photos
- `*.log` — Download logs

## Common Tasks

### Change default download size
Edit `download_photos.py` line ~128: `default=1200`

### Add new photo source
Create a script that outputs `photos.json` in the format above. The `thumbnail` URL just needs to return an image.

### Support private folders
Would need OAuth2 instead of API key. See Google Drive API docs.
