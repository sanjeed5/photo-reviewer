# Photo Reviewer

**Download photos from Google Drive for fast local review.**

Perfect for reviewing large photo collections (wedding photos, events, etc.) — download them all at reduced quality, flip through in Finder/Explorer, and delete what you don't want.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/sanjeed5/photo-reviewer.git
cd photo-reviewer
pip install httpx loguru google-api-python-client

# 2. Get a Google API key (free, 2 min setup)
#    See instructions below, then:
export GOOGLE_API_KEY="your-api-key"

# 3. Fetch photo list from a Google Drive folder
python fetch_photos.py "https://drive.google.com/drive/folders/YOUR_FOLDER_ID"

# 4. Download all photos
python download_photos.py

# 5. Open and review!
open ./photos_to_review  # macOS
```

## Download Options

```bash
# Different quality (default: 1200px width, ~200KB per photo)
python download_photos.py --size 800     # Faster, smaller
python download_photos.py --size 1600    # Higher quality

# Filter by folder name
python download_photos.py --folder "WEDDING"

# Custom output location
python download_photos.py --output ~/Desktop/review

# More concurrent downloads (default: 10)
python download_photos.py --concurrent 20
```

## Getting a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Search for and enable **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the key

You can set it via environment variable or create a `.env` file:

```bash
# Option 1: Environment variable
export GOOGLE_API_KEY="your-key-here"

# Option 2: Create .env file
echo 'GOOGLE_API_KEY=your-key-here' > .env
```

## How It Works

1. **`fetch_photos.py`** — Uses Google Drive API to recursively list all photos in a folder. Saves metadata to `photos.json`.

2. **`download_photos.py`** — Downloads photos via Google's thumbnail service at your specified size. Preserves folder structure.

The downloads are optimized versions (not full resolution) — perfect for quick review while keeping files small.

## Review Tips

- **Keyboard shortcuts in macOS Preview**: Arrow keys to navigate, `⌘+Delete` to trash
- **Quick Look on macOS**: Select files, press `Space` to preview
- **Windows**: Use Photo Viewer, arrow keys to navigate
- **Disk space**: ~200-400MB per 1000 photos at w1200

## Requirements

- Python 3.8+
- `httpx` — async HTTP client for fast downloads
- `loguru` — nice logging
- `google-api-python-client` — for fetching photo list (optional: `gdown` as fallback)

```bash
pip install httpx loguru google-api-python-client
# or with uv:
uv pip install httpx loguru google-api-python-client
```

## License

MIT
