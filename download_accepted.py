#!/usr/bin/env python3
"""
Download accepted photos at good quality for viewing.

Usage:
    python download_accepted.py [--size 1200] [output_folder]
    
Examples:
    python download_accepted.py                    # Downloads to ./accepted_photos at w1200
    python download_accepted.py --size 1600        # Higher quality
    python download_accepted.py ./my_selections    # Custom output folder
"""

import asyncio
import json
import sys
from pathlib import Path

import httpx
from loguru import logger

DEFAULT_SIZE = 1200  # Good quality for viewing


async def download_photo(
    client: httpx.AsyncClient,
    photo: dict,
    output_dir: Path,
    size: int,
    semaphore: asyncio.Semaphore,
) -> tuple[str, bool]:
    """Download a single photo."""
    async with semaphore:
        file_id = photo["id"]
        name = photo.get("name", file_id)
        
        # Preserve folder structure
        output_path = output_dir / name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Skip if already downloaded
        if output_path.exists():
            return name, True
        
        # Build URL
        url = f"https://lh3.googleusercontent.com/d/{file_id}=w{size}"
        
        try:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            
            output_path.write_bytes(response.content)
            logger.debug(f"Downloaded: {name}")
            return name, True
            
        except Exception as e:
            logger.warning(f"Failed: {name} - {e}")
            return name, False


async def download_all(photos: list[dict], output_dir: Path, size: int, concurrency: int = 5):
    """Download all photos with controlled concurrency."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    semaphore = asyncio.Semaphore(concurrency)
    transport = httpx.AsyncHTTPTransport(retries=3)
    
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        transport=transport,
    ) as client:
        tasks = [
            download_photo(client, photo, output_dir, size, semaphore)
            for photo in photos
        ]
        
        total = len(tasks)
        completed = 0
        success = 0
        
        for coro in asyncio.as_completed(tasks):
            name, ok = await coro
            completed += 1
            if ok:
                success += 1
            
            if completed % 10 == 0 or completed == total:
                logger.info(f"Progress: {completed}/{total} ({success} successful)")
    
    return success


def main():
    # Parse arguments
    size = DEFAULT_SIZE
    output_dir = Path("./accepted_photos")
    
    args = sys.argv[1:]
    
    if "--size" in args:
        idx = args.index("--size")
        if idx + 1 < len(args):
            size = int(args[idx + 1])
            args = args[:idx] + args[idx+2:]
    
    if args:
        output_dir = Path(args[0])
    
    # Load state file
    state_file = Path("photo_review_state.json")
    if not state_file.exists():
        # Try browser export location
        state_file = Path("photo_review_state.json")
        if not state_file.exists():
            logger.error("photo_review_state.json not found")
            logger.info("Export your state from the photo reviewer first")
            sys.exit(1)
    
    with open(state_file) as f:
        data = json.load(f)
    
    # Get accepted photo IDs
    decisions = data.get("decisions", {})
    accepted_ids = {k for k, v in decisions.items() if v == "accepted"}
    
    logger.info(f"Found {len(accepted_ids)} accepted photos")
    
    # Load photos.json to get names
    photos_file = Path("photos.json")
    if not photos_file.exists():
        logger.error("photos.json not found")
        sys.exit(1)
    
    with open(photos_file) as f:
        photos = json.load(f)
    
    # Match IDs
    to_download = [p for p in photos if p["id"] in accepted_ids]
    
    if not to_download:
        logger.warning("No accepted photos found!")
        sys.exit(0)
    
    logger.info(f"Downloading {len(to_download)} photos at w{size} to {output_dir}")
    
    # Download
    success = asyncio.run(download_all(to_download, output_dir, size))
    
    logger.success(f"Downloaded {success}/{len(to_download)} photos")
    logger.info(f"Photos saved to: {output_dir}")
    
    # Show total size
    total_size = sum(f.stat().st_size for f in output_dir.rglob("*") if f.is_file())
    logger.info(f"Total size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
