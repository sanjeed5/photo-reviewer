#!/usr/bin/env python3
"""
Download selected photos from Google Drive.

Usage:
    python download_selected.py photo_review_state.json ./downloaded_photos
    
Requires: gdown
    uv pip install gdown --system
"""

import json
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import gdown
except ImportError:
    print("Install gdown first: uv pip install gdown --system")
    sys.exit(1)

from loguru import logger


def download_file(file_id: str, name: str, output_dir: Path) -> tuple[str, bool]:
    """Download a single file from Google Drive."""
    # Preserve folder structure
    output_path = output_dir / name
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if output_path.exists():
        return name, True  # Already downloaded
    
    try:
        url = f"https://drive.google.com/uc?id={file_id}"
        gdown.download(url, str(output_path), quiet=True)
        return name, True
    except Exception as e:
        logger.warning(f"Failed to download {name}: {e}")
        return name, False


def main():
    if len(sys.argv) < 2:
        print("Usage: python download_selected.py <state.json> [output_dir]")
        print("\nExample:")
        print("  python download_selected.py photo_review_state.json ./selected_photos")
        sys.exit(1)
    
    state_file = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("./selected_photos")
    
    if not state_file.exists():
        print(f"File not found: {state_file}")
        sys.exit(1)
    
    # Load state
    with open(state_file) as f:
        data = json.load(f)
    
    # Get accepted photos (need to match IDs from decisions to photos.json)
    decisions = data.get("decisions", {})
    accepted_ids = {k for k, v in decisions.items() if v == "accepted"}
    
    # Load photos.json to get names
    photos_file = Path("photos.json")
    if not photos_file.exists():
        print("photos.json not found - run from the photo-reviewer directory")
        sys.exit(1)
    
    with open(photos_file) as f:
        photos = json.load(f)
    
    # Match IDs to get full info
    to_download = [p for p in photos if p["id"] in accepted_ids]
    
    logger.info(f"Found {len(to_download)} accepted photos to download")
    logger.info(f"Output directory: {output_dir}")
    
    if not to_download:
        print("No accepted photos found!")
        sys.exit(0)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Download with progress
    success = 0
    failed = []
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(download_file, p["id"], p["name"], output_dir): p
            for p in to_download
        }
        
        for i, future in enumerate(as_completed(futures), 1):
            name, ok = future.result()
            if ok:
                success += 1
            else:
                failed.append(name)
            
            # Progress
            print(f"\r[{i}/{len(to_download)}] Downloaded: {success}, Failed: {len(failed)}", end="", flush=True)
    
    print()  # Newline after progress
    
    logger.success(f"Downloaded {success}/{len(to_download)} photos to {output_dir}")
    
    if failed:
        logger.warning(f"Failed downloads ({len(failed)}):")
        for name in failed[:10]:
            print(f"  - {name}")
        if len(failed) > 10:
            print(f"  ... and {len(failed) - 10} more")


if __name__ == "__main__":
    main()
