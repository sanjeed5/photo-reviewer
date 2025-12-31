#!/usr/bin/env python3
"""
Download all thumbnails locally for fast, offline photo review.

This downloads small preview images (not full resolution) to avoid rate limits
and enable instant review without network latency.

Usage:
    python download_thumbnails.py [--size 400] [--folder "WEDDING/CAM 2"]
    
Output:
    thumbnails/          - Downloaded thumbnail images
    photos.json          - Updated with local thumbnail paths
    thumbnail_download.log - Progress log
"""

import asyncio
import json
import sys
from pathlib import Path

import httpx
from loguru import logger

# Default thumbnail size (width in pixels)
DEFAULT_SIZE = 400

# Configure logging to file
LOG_FILE = Path(__file__).parent / "thumbnail_download.log"
logger.add(LOG_FILE, rotation="10 MB", level="INFO")


async def download_thumbnail(
    client: httpx.AsyncClient,
    photo: dict,
    output_dir: Path,
    size: int,
    semaphore: asyncio.Semaphore,
    force: bool = False,
) -> dict:
    """Download a single thumbnail with rate limiting."""
    async with semaphore:
        file_id = photo["id"]
        # Create filename from photo name or ID
        name = photo.get("name", file_id).replace("/", "_")
        ext = Path(name).suffix or ".jpg"
        filename = f"{file_id}{ext}"
        output_path = output_dir / filename
        
        # Skip if already downloaded (unless force)
        if output_path.exists() and not force:
            photo["thumbnail_local"] = f"thumbnails/{filename}"
            return photo
        
        # Build thumbnail URL
        url = f"https://lh3.googleusercontent.com/d/{file_id}=w{size}"
        
        try:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            
            output_path.write_bytes(response.content)
            photo["thumbnail_local"] = f"thumbnails/{filename}"
            logger.debug(f"Downloaded: {name}")
            
        except Exception as e:
            logger.warning(f"Failed to download {name}: {e}")
            # Keep original URL as fallback
            photo["thumbnail_local"] = None
        
        return photo


async def download_all(photos: list[dict], output_dir: Path, size: int, concurrency: int = 5, force: bool = False):
    """Download all thumbnails with controlled concurrency."""
    output_dir.mkdir(exist_ok=True)
    
    # Limit concurrent requests to avoid rate limits
    semaphore = asyncio.Semaphore(concurrency)
    
    # Use longer timeouts and retry logic
    transport = httpx.AsyncHTTPTransport(retries=3)
    
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(30.0),
        transport=transport,
    ) as client:
        tasks = [
            download_thumbnail(client, photo, output_dir, size, semaphore, force)
            for photo in photos
        ]
        
        # Process with progress logging
        total = len(tasks)
        completed = 0
        
        for coro in asyncio.as_completed(tasks):
            await coro
            completed += 1
            if completed % 50 == 0 or completed == total:
                logger.info(f"Progress: {completed}/{total} ({100*completed//total}%)")
    
    return photos


def main():
    # Parse arguments
    size = DEFAULT_SIZE
    folder_filter = None
    force = "--force" in sys.argv
    
    if "--size" in sys.argv:
        idx = sys.argv.index("--size")
        if idx + 1 < len(sys.argv):
            size = int(sys.argv[idx + 1])
    
    if "--folder" in sys.argv:
        idx = sys.argv.index("--folder")
        if idx + 1 < len(sys.argv):
            folder_filter = sys.argv[idx + 1]
    
    if force:
        logger.info("Force mode: re-downloading existing files")
    
    # Load photos.json
    photos_file = Path(__file__).parent / "photos.json"
    if not photos_file.exists():
        logger.error("photos.json not found. Run fetch_photos.py first.")
        sys.exit(1)
    
    with open(photos_file) as f:
        all_photos = json.load(f)
    
    # Filter by folder if specified
    if folder_filter:
        photos_to_download = [
            p for p in all_photos 
            if folder_filter.lower() in p.get("name", "").lower()
        ]
        logger.info(f"Filtering to folder '{folder_filter}': {len(photos_to_download)} photos")
    else:
        photos_to_download = all_photos
    
    logger.info(f"Downloading {len(photos_to_download)} thumbnails at w{size}...")
    logger.info(f"Progress logged to: {LOG_FILE}")
    
    # Download thumbnails
    output_dir = Path(__file__).parent / "thumbnails"
    photos_to_download = asyncio.run(download_all(photos_to_download, output_dir, size, force=force))
    
    # Update all_photos with downloaded paths
    downloaded_ids = {p["id"]: p.get("thumbnail_local") for p in photos_to_download}
    for p in all_photos:
        if p["id"] in downloaded_ids and downloaded_ids[p["id"]]:
            p["thumbnail_local"] = downloaded_ids[p["id"]]
    
    # Count successes
    downloaded = sum(1 for p in photos_to_download if p.get("thumbnail_local"))
    logger.info(f"Downloaded: {downloaded}/{len(photos_to_download)}")
    
    # Update photos.json with local paths
    with open(photos_file, "w") as f:
        json.dump(all_photos, f, indent=2)
    
    logger.success(f"Updated photos.json with local thumbnail paths")
    logger.info(f"Thumbnails saved to: {output_dir}")
    
    if output_dir.exists():
        total_size = sum(f.stat().st_size for f in output_dir.iterdir() if f.is_file())
        logger.info(f"Total size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
