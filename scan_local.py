#!/usr/bin/env python3
"""
Scan a local folder of photos, detect similar images, and group them.

Usage:
    python scan_local.py /path/to/photos

This creates photos.json with grouped similar photos.
Then run: python -m http.server 8765
And open: http://localhost:8765

Requirements:
    uv pip install imagehash pillow loguru --system
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

from loguru import logger

try:
    import imagehash
    from PIL import Image
    # Enable HEIC support if available
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass  # HEIC support optional
except ImportError:
    logger.error("Required packages not installed. Run:")
    logger.error("  uv pip install imagehash pillow pillow-heif --system")
    sys.exit(1)


# Configuration
HASH_SIZE = 16  # Larger = more precise, slower
SIMILARITY_THRESHOLD = 10  # Lower = stricter grouping (0 = exact match, 10 = quite similar)
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tiff', '.bmp'}


def get_image_hash(image_path: Path) -> imagehash.ImageHash | None:
    """Compute perceptual hash for an image."""
    try:
        with Image.open(image_path) as img:
            # Use perceptual hash (good for photos)
            return imagehash.phash(img, hash_size=HASH_SIZE)
    except Exception as e:
        logger.warning(f"Failed to hash {image_path.name}: {e}")
        return None


def find_similar_groups(photos: list[dict]) -> list[list[dict]]:
    """Group similar photos together based on perceptual hash."""
    if not photos:
        return []
    
    logger.info(f"Grouping {len(photos)} photos by similarity...")
    
    # Build groups using Union-Find approach
    parent = list(range(len(photos)))
    
    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]
    
    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py
    
    # Compare hashes and group similar ones
    hashes = [p.get('hash_obj') for p in photos]
    
    for i in range(len(photos)):
        if hashes[i] is None:
            continue
        for j in range(i + 1, len(photos)):
            if hashes[j] is None:
                continue
            # Hamming distance between hashes
            distance = hashes[i] - hashes[j]
            if distance <= SIMILARITY_THRESHOLD:
                union(i, j)
    
    # Collect groups
    groups_dict = defaultdict(list)
    for i, photo in enumerate(photos):
        groups_dict[find(i)].append(photo)
    
    groups = list(groups_dict.values())
    
    # Sort photos within each group by name (for consistent ordering)
    for group in groups:
        group.sort(key=lambda p: p['name'])
    
    # Sort groups by first photo name
    groups.sort(key=lambda g: g[0]['name'])
    
    # Stats
    single_photos = sum(1 for g in groups if len(g) == 1)
    multi_photos = sum(1 for g in groups if len(g) > 1)
    logger.info(f"Found {len(groups)} groups: {single_photos} unique, {multi_photos} with duplicates")
    
    return groups


def scan_folder(folder_path: Path) -> list[dict]:
    """Scan folder for images and compute hashes."""
    logger.info(f"Scanning: {folder_path}")
    
    if not folder_path.exists():
        logger.error(f"Folder not found: {folder_path}")
        return []
    
    # Find all images recursively
    images = []
    for ext in SUPPORTED_EXTENSIONS:
        images.extend(folder_path.rglob(f"*{ext}"))
        images.extend(folder_path.rglob(f"*{ext.upper()}"))
    
    # Remove duplicates (case-insensitive matching might cause this)
    images = list(set(images))
    images.sort()
    
    logger.info(f"Found {len(images)} images")
    
    if not images:
        return []
    
    # Process each image
    photos = []
    import time
    start_time = time.time()
    
    for i, img_path in enumerate(images):
        if (i + 1) % 50 == 0 or i == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (len(images) - i - 1) / rate if rate > 0 else 0
            logger.info(f"Hashing {i + 1}/{len(images)} ({rate:.1f}/sec, ~{remaining/60:.1f} min remaining)")
        
        # Relative path from the scanned folder
        rel_path = img_path.relative_to(folder_path)
        
        # Compute hash
        img_hash = get_image_hash(img_path)
        
        photos.append({
            'id': str(img_path),  # Full path as ID
            'name': str(rel_path),
            'path': str(img_path),  # For local file:// URLs
            'hash': str(img_hash) if img_hash else None,
            'hash_obj': img_hash,  # Keep for comparison (removed before JSON export)
        })
    
    return photos


def generate_local_thumbnails(photos: list[dict], output_dir: Path, size: int = 400) -> None:
    """Generate thumbnail images for faster loading."""
    thumb_dir = output_dir / "thumbnails"
    thumb_dir.mkdir(exist_ok=True)
    
    logger.info(f"Generating thumbnails in {thumb_dir}...")
    
    for i, photo in enumerate(photos):
        if (i + 1) % 100 == 0:
            logger.info(f"Thumbnails: {i + 1}/{len(photos)}...")
        
        src_path = Path(photo['path'])
        # Use hash of path as thumbnail name to avoid conflicts
        thumb_name = f"{hash(photo['path']) & 0xFFFFFFFF}.jpg"
        thumb_path = thumb_dir / thumb_name
        
        if thumb_path.exists():
            photo['thumbnail'] = f"thumbnails/{thumb_name}"
            continue
        
        try:
            with Image.open(src_path) as img:
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                # Resize maintaining aspect ratio
                img.thumbnail((size, size), Image.Resampling.LANCZOS)
                img.save(thumb_path, 'JPEG', quality=85)
                photo['thumbnail'] = f"thumbnails/{thumb_name}"
        except Exception as e:
            logger.warning(f"Failed to create thumbnail for {src_path.name}: {e}")
            # Fall back to original file
            photo['thumbnail'] = f"file://{photo['path']}"


def main():
    if len(sys.argv) < 2:
        logger.error("Usage: python scan_local.py /path/to/photos [--no-thumbnails]")
        logger.info("Example: python scan_local.py /Volumes/USB/Wedding_Photos")
        logger.info("Add --no-thumbnails to skip thumbnail generation (faster scan, slower viewing)")
        sys.exit(1)
    
    folder_path = Path(sys.argv[1]).resolve()
    output_dir = Path(__file__).parent
    skip_thumbnails = '--no-thumbnails' in sys.argv
    
    # Scan folder
    photos = scan_folder(folder_path)
    
    if not photos:
        logger.error("No photos found")
        sys.exit(1)
    
    # Generate thumbnails (for faster web loading)
    if skip_thumbnails:
        logger.info("Skipping thumbnail generation (--no-thumbnails)")
        logger.warning("You must run the server from the photos folder:")
        logger.warning(f"  cd '{folder_path}' && python -m http.server 8765")
        logger.warning("Then copy photos.json to that folder")
        for photo in photos:
            # Use relative path from source folder
            photo['thumbnail'] = photo['name']
    else:
        generate_local_thumbnails(photos, output_dir)
    
    # Group similar photos
    groups = find_similar_groups(photos)
    
    # Prepare output - remove hash_obj (not JSON serializable)
    for photo in photos:
        photo.pop('hash_obj', None)
    
    # Create grouped structure
    output = {
        'source': str(folder_path),
        'total_photos': len(photos),
        'total_groups': len(groups),
        'groups': [
            {
                'id': f"group_{i}",
                'photos': group
            }
            for i, group in enumerate(groups)
        ]
    }
    
    # Save to JSON
    output_file = output_dir / "photos.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    logger.success(f"Saved to {output_file}")
    logger.info(f"Total photos: {len(photos)}")
    logger.info(f"Total groups: {len(groups)}")
    logger.info(f"Groups with multiple photos: {sum(1 for g in groups if len(g['photos']) > 1)}")
    
    # Show group size distribution
    sizes = defaultdict(int)
    for g in groups:
        size = len(g['photos'])
        if size >= 5:
            sizes['5+'] += 1
        else:
            sizes[size] += 1
    
    logger.info("Group size distribution:")
    for size in sorted(sizes.keys(), key=lambda x: int(x) if isinstance(x, int) else 999):
        logger.info(f"  {size} photos: {sizes[size]} groups")
    
    logger.info("\nNext steps:")
    logger.info("  1. python -m http.server 8765")
    logger.info("  2. Open http://localhost:8765")
    logger.warning("\n⚠️  If you previously reviewed photos, clear browser localStorage")
    logger.warning("   (Open DevTools → Application → Local Storage → Clear)")


if __name__ == "__main__":
    main()
