#!/usr/bin/env python3
"""
Fetch photo list from a public Google Drive folder.

Two methods available:
1. Google Drive API (recommended) - No file limit, requires free API key
2. gdown fallback - Limited to 50 files per folder

To get an API key (free, 2 minutes):
1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable "Google Drive API" 
4. Go to Credentials → Create Credentials → API Key
5. Copy the key to .env file: GOOGLE_API_KEY=your-key-here
"""

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from loguru import logger

# Load .env file if present
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        logger.info(f"Loaded .env from {env_path}")
except ImportError:
    pass  # python-dotenv not installed, will use environment variables directly

# Default folder - can be overridden via command line
DEFAULT_FOLDER_URL = "https://drive.google.com/drive/folders/19kih51w0-Wuaq80tXkDnPlQpSe2fcqJR"


def extract_folder_id(url_or_id: str) -> str:
    """Extract folder ID from URL or return as-is if already an ID."""
    if url_or_id.startswith("http"):
        # Parse URL like https://drive.google.com/drive/folders/FOLDER_ID
        path = urlparse(url_or_id).path
        if "/folders/" in path:
            return path.split("/folders/")[-1].split("?")[0]
    return url_or_id


def fetch_with_api(folder_id: str, api_key: str) -> list[dict]:
    """Fetch all photos using Google Drive API (no file limit)."""
    try:
        from googleapiclient.discovery import build
    except ImportError:
        logger.error("google-api-python-client not installed. Run: uv pip install google-api-python-client --system")
        return []
    
    logger.info("Using Google Drive API (no file limit)")
    service = build('drive', 'v3', developerKey=api_key)
    
    all_photos = []
    folders_to_process = [(folder_id, "")]  # (folder_id, path_prefix)
    
    while folders_to_process:
        current_folder_id, path_prefix = folders_to_process.pop(0)
        page_token = None
        
        while True:
            # Query for all files and folders in current folder
            query = f"'{current_folder_id}' in parents and trashed = false"
            
            results = service.files().list(
                q=query,
                fields="nextPageToken, files(id, name, mimeType)",
                pageSize=1000,
                pageToken=page_token
            ).execute()
            
            files = results.get('files', [])
            
            for f in files:
                full_path = f"{path_prefix}{f['name']}" if path_prefix else f['name']
                
                if f['mimeType'] == 'application/vnd.google-apps.folder':
                    # It's a subfolder - add to queue
                    folders_to_process.append((f['id'], f"{full_path}/"))
                    logger.debug(f"Found subfolder: {full_path}")
                elif f['mimeType'].startswith('image/'):
                    # It's an image
                    all_photos.append({
                        'id': f['id'],
                        'name': full_path,
                        'thumbnail': f"https://lh3.googleusercontent.com/d/{f['id']}=w1200",
                    })
            
            page_token = results.get('nextPageToken')
            if not page_token:
                break
    
    return all_photos


def fetch_with_gdown(folder_url: str) -> list[dict]:
    """Fallback: Fetch using gdown (limited to 50 files per folder)."""
    try:
        import gdown
    except ImportError:
        logger.error("gdown not installed. Run: uv pip install gdown --system")
        return []
    
    logger.warning("Using gdown (limited to 50 files per folder)")
    logger.warning("For all files, set GOOGLE_API_KEY environment variable")
    
    files = gdown.download_folder(folder_url, quiet=True, remaining_ok=True, skip_download=True)
    
    if not files:
        return []
    
    photos = []
    for f in files:
        if f.path.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic')):
            photos.append({
                'id': f.id,
                'name': f.path,
                'thumbnail': f"https://lh3.googleusercontent.com/d/{f.id}=w1200",
            })
    
    return photos


def fetch_photos(folder_url: str) -> list[dict]:
    """Fetch list of photos from a public Google Drive folder."""
    folder_id = extract_folder_id(folder_url)
    logger.info(f"Fetching photos from folder: {folder_id}")
    
    # Try API first if key is available
    api_key = os.environ.get('GOOGLE_API_KEY')
    
    if api_key:
        photos = fetch_with_api(folder_id, api_key)
    else:
        logger.info("No GOOGLE_API_KEY found, using gdown (50 file/folder limit)")
        logger.info("To get all files, set up an API key - see instructions in this file")
        photos = fetch_with_gdown(folder_url)
    
    if not photos:
        logger.error("No photos found. Make sure the folder is public.")
        return []
    
    # Sort by name for consistent ordering
    photos.sort(key=lambda p: p['name'])
    
    logger.info(f"Found {len(photos)} photos")
    return photos


def main():
    # Get folder URL from command line or use default
    if len(sys.argv) > 1:
        folder_url = sys.argv[1]
    else:
        folder_url = DEFAULT_FOLDER_URL
        logger.info(f"Using default folder. To use a different folder:")
        logger.info(f"  python fetch_photos.py <folder_url>")
    
    # Fetch photos
    photos = fetch_photos(folder_url)
    
    if not photos:
        sys.exit(1)
    
    # Save to JSON
    output_file = Path(__file__).parent / "photos.json"
    with open(output_file, 'w') as f:
        json.dump(photos, f, indent=2)
    
    logger.success(f"Saved {len(photos)} photos to {output_file}")
    
    # Show summary by folder
    folders: dict[str, int] = {}
    for p in photos:
        folder = '/'.join(p['name'].split('/')[:-1]) or 'root'
        folders[folder] = folders.get(folder, 0) + 1
    
    logger.info("Photos by folder:")
    for folder, count in sorted(folders.items()):
        logger.info(f"  {folder}: {count}")


if __name__ == "__main__":
    main()
