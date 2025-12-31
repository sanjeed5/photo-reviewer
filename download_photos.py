#!/usr/bin/env python3
"""
Download photos from Google Drive for local review.

Usage:
    # First, fetch photo list from a shared Drive folder:
    python fetch_photos.py "https://drive.google.com/drive/folders/FOLDER_ID"
    
    # Then download all photos locally:
    python download_photos.py
    
    # Or specify options:
    python download_photos.py --size 800 --output ./my_photos --folder "WEDDING"
"""

import asyncio
import json
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Installing httpx...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx"])
    import httpx

try:
    from loguru import logger
except ImportError:
    print("Installing loguru...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "loguru"])
    from loguru import logger


# Configure logging
logger.remove()
logger.add(sys.stderr, format="<level>{message}</level>", level="INFO")
logger.add("download.log", format="{time:HH:mm:ss} | {level} | {message}", level="DEBUG", rotation="10 MB")


async def download_photo(client: httpx.AsyncClient, photo: dict, output_dir: Path, size: int, semaphore: asyncio.Semaphore) -> bool:
    """Download a single photo."""
    async with semaphore:
        # Build output path preserving folder structure
        name = photo["name"]
        if "/" in name:
            folder = "/".join(name.split("/")[:-1])
            filename = name.split("/")[-1]
            dest_dir = output_dir / folder
        else:
            filename = name
            dest_dir = output_dir
        
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / filename
        
        if dest_path.exists():
            logger.debug(f"Skipping (exists): {name}")
            return True
        
        # Build download URL
        url = photo["thumbnail"].replace("=w200", f"=w{size}")
        
        for attempt in range(3):
            try:
                response = await client.get(url)
                response.raise_for_status()
                
                dest_path.write_bytes(response.content)
                logger.debug(f"Downloaded: {name}")
                return True
                
            except Exception as e:
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                else:
                    logger.error(f"Failed: {name} - {e}")
                    return False
        
        return False


async def download_all(photos: list, output_dir: Path, size: int, concurrent: int = 10):
    """Download all photos with progress tracking."""
    semaphore = asyncio.Semaphore(concurrent)
    
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        tasks = [download_photo(client, p, output_dir, size, semaphore) for p in photos]
        
        completed = 0
        failed = 0
        total = len(tasks)
        
        for coro in asyncio.as_completed(tasks):
            success = await coro
            if success:
                completed += 1
            else:
                failed += 1
            
            # Progress update every 10 photos
            done = completed + failed
            if done % 10 == 0 or done == total:
                pct = (done / total) * 100
                logger.info(f"Progress: {done}/{total} ({pct:.0f}%) - {completed} ok, {failed} failed")
    
    return completed, failed


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Download photos from Google Drive for local review",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python download_photos.py                     # Download all at w1200
    python download_photos.py --size 800          # Smaller size, faster
    python download_photos.py --folder "WEDDING"  # Only one folder
    python download_photos.py -o ~/Desktop/photos # Custom output location
        """
    )
    parser.add_argument("-o", "--output", default="./photos_to_review", help="Output directory (default: ./photos_to_review)")
    parser.add_argument("-s", "--size", type=int, default=1200, help="Image width in pixels (default: 1200)")
    parser.add_argument("-f", "--folder", help="Only download photos from this folder")
    parser.add_argument("-c", "--concurrent", type=int, default=10, help="Concurrent downloads (default: 10)")
    parser.add_argument("--input", default="photos.json", help="Input JSON file (default: photos.json)")
    
    args = parser.parse_args()
    
    # Load photos
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"File not found: {input_path}")
        logger.info("Run fetch_photos.py first to get the photo list from Google Drive")
        sys.exit(1)
    
    with open(input_path) as f:
        photos = json.load(f)
    
    # Handle grouped format
    if isinstance(photos, dict) and "groups" in photos:
        photos = [p for g in photos["groups"] for p in g["photos"]]
    
    logger.info(f"Found {len(photos)} photos in {input_path}")
    
    # Filter by folder if specified
    if args.folder:
        photos = [p for p in photos if args.folder.lower() in p["name"].lower()]
        logger.info(f"Filtered to {len(photos)} photos matching '{args.folder}'")
    
    if not photos:
        logger.warning("No photos to download")
        sys.exit(0)
    
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Downloading {len(photos)} photos at w{args.size} to {output_dir}")
    logger.info(f"Using {args.concurrent} concurrent connections")
    
    # Run downloads
    completed, failed = asyncio.run(download_all(photos, output_dir, args.size, args.concurrent))
    
    # Summary
    logger.info("=" * 50)
    logger.info(f"Done! {completed} downloaded, {failed} failed")
    logger.info(f"Photos saved to: {output_dir.absolute()}")
    
    if failed == 0:
        logger.info("✓ Open the folder and delete photos you don't want!")


if __name__ == "__main__":
    main()
