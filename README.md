# Photo Reviewer

**Download photos from Google Drive at lower quality for fast local review.**

Perfect for reviewing large photo collections (wedding photos, events, etc.) - download them all, flip through in your file browser, and delete what you don't want.

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/sanjeed5/photo-reviewer.git
cd photo-reviewer
pip install httpx loguru  # or: uv pip install httpx loguru

# 2. Set your Google API key (get one from Google Cloud Console)
export GOOGLE_API_KEY="your-api-key"

# 3. Fetch photo list from a Google Drive folder
python fetch_photos.py "https://drive.google.com/drive/folders/YOUR_FOLDER_ID"

# 4. Download all photos
python download_photos.py

# 5. Open the folder and review!
open ./photos_to_review  # macOS
# or: explorer photos_to_review  # Windows
```

## Options

```bash
# Download at different quality (default: 1200px width)
python download_photos.py --size 800    # Faster, smaller files
python download_photos.py --size 1600   # Higher quality

# Only download specific folder
python download_photos.py --folder "WEDDING"

# Custom output location
python download_photos.py --output ~/Desktop/review

# Faster downloads (more concurrent)
python download_photos.py --concurrent 20
```

## How It Works

1. **fetch_photos.py** - Uses Google Drive API to list all photos in a shared folder, saves to `photos.json`
2. **download_photos.py** - Downloads photos from Google's thumbnail service at specified quality

The downloaded photos are optimized versions (not full resolution) - perfect for reviewing and selecting, while keeping file sizes manageable.

## Getting a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the key and set it as `GOOGLE_API_KEY` environment variable

## Tips

- **Start with a subfolder** - Test with `--folder "CAM 1"` before downloading everything
- **Use your OS tools** - Finder/Explorer are great for quick review
- **Keyboard shortcuts** - In macOS Preview: arrow keys to navigate, ⌘+Delete to trash
- **Check disk space** - 1000 photos at w1200 ≈ 200-400MB

---

## Alternative: Web-Based Review

There's also a web app for Tinder-style swiping through photos:

```bash
# Start local server
python -m http.server 8765

# Open http://localhost:8765
```

The web app supports:
- Keyboard shortcuts (→ accept, ← reject)
- Grid view for faster review
- Export selected photo list
- Progress tracking

See `js/` folder for the web app code.
