#!/usr/bin/env python3
"""
Fetch photos from Google Drive with EXIF time data and group by:
1. Time proximity (photos within X seconds = same burst)
2. Filename sequence (consecutive numbers)

Optionally: Download thumbnails and group by visual similarity.
"""

import json
import os
import sys
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

from loguru import logger

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

from googleapiclient.discovery import build

# Configuration
DEFAULT_FOLDER_URL = ""  # Set your Google Drive folder URL here or pass as argument
TIME_GAP_THRESHOLD_SECONDS = 3  # Break group if gap > 3 seconds
MAX_GROUP_SIZE = 10  # Force break if group gets too large


def extract_folder_id(url_or_id: str) -> str:
    if url_or_id.startswith("http"):
        if "/folders/" in url_or_id:
            return url_or_id.split("/folders/")[-1].split("?")[0]
    return url_or_id


def parse_exif_time(time_str: str) -> datetime | None:
    """Parse EXIF time string like '2025:07:12 01:37:43'"""
    if not time_str:
        return None
    try:
        return datetime.strptime(time_str, "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def extract_sequence_number(filename: str) -> int | None:
    """Extract numeric sequence from filename like 'IMG_1234.JPG' or '9H2A6105.JPG'"""
    # Find all numbers in filename, take the last/largest one
    numbers = re.findall(r'\d+', filename)
    if numbers:
        return int(numbers[-1])
    return None


def fetch_all_photos(folder_id: str, api_key: str) -> list[dict]:
    """Fetch all photos with metadata from Google Drive."""
    logger.info("Fetching photos with metadata...")
    
    service = build('drive', 'v3', developerKey=api_key)
    
    all_photos = []
    folders_to_process = [(folder_id, "")]
    
    while folders_to_process:
        current_folder_id, path_prefix = folders_to_process.pop(0)
        page_token = None
        
        while True:
            query = f"'{current_folder_id}' in parents and trashed = false"
            
            results = service.files().list(
                q=query,
                fields="nextPageToken, files(id, name, mimeType, createdTime, imageMediaMetadata)",
                pageSize=1000,
                pageToken=page_token
            ).execute()
            
            files = results.get('files', [])
            
            for f in files:
                full_path = f"{path_prefix}{f['name']}" if path_prefix else f['name']
                
                if f['mimeType'] == 'application/vnd.google-apps.folder':
                    folders_to_process.append((f['id'], f"{full_path}/"))
                elif f['mimeType'].startswith('image/'):
                    meta = f.get('imageMediaMetadata', {})
                    exif_time = parse_exif_time(meta.get('time'))
                    seq_num = extract_sequence_number(f['name'])
                    
                    all_photos.append({
                        'id': f['id'],
                        'name': full_path,
                        'thumbnail': f"https://lh3.googleusercontent.com/d/{f['id']}=w800",
                        'thumbnail_small': f"https://lh3.googleusercontent.com/d/{f['id']}=w200",
                        'time': exif_time.isoformat() if exif_time else None,
                        'time_dt': exif_time,  # For sorting, removed before JSON
                        'seq_num': seq_num,
                        'folder': path_prefix.rstrip('/') or 'root',
                        'camera': meta.get('cameraModel'),
                    })
            
            page_token = results.get('nextPageToken')
            if not page_token:
                break
        
        logger.info(f"Processed folder, total photos so far: {len(all_photos)}")
    
    return all_photos


def group_by_time_and_sequence(photos: list[dict]) -> list[list[dict]]:
    """Group photos by time proximity - break when there's a gap."""
    if not photos:
        return []
    
    # Sort by folder, then by time (if available), then by sequence number
    def sort_key(p):
        folder = p['folder']
        time = p['time_dt'] or datetime.min
        seq = p['seq_num'] or 0
        return (folder, time, seq)
    
    photos_sorted = sorted(photos, key=sort_key)
    
    groups = []
    current_group = [photos_sorted[0]]
    
    for i in range(1, len(photos_sorted)):
        prev = photos_sorted[i - 1]
        curr = photos_sorted[i]
        
        # Must be same folder
        same_folder = prev['folder'] == curr['folder']
        
        # Check time gap - if gap is small, keep in same group
        should_continue_group = False
        if same_folder and prev['time_dt'] and curr['time_dt']:
            time_diff = (curr['time_dt'] - prev['time_dt']).total_seconds()
            # Only continue if gap is small (burst shots are <1-2 seconds apart)
            should_continue_group = 0 <= time_diff <= TIME_GAP_THRESHOLD_SECONDS
        
        # Also check sequence numbers as backup
        if same_folder and not should_continue_group:
            if prev['seq_num'] is not None and curr['seq_num'] is not None:
                seq_diff = curr['seq_num'] - prev['seq_num']
                # Consecutive or near-consecutive file numbers
                should_continue_group = 0 < seq_diff <= 2
        
        # Force break if group too large (for usability)
        if len(current_group) >= MAX_GROUP_SIZE:
            should_continue_group = False
        
        if should_continue_group:
            current_group.append(curr)
        else:
            groups.append(current_group)
            current_group = [curr]
    
    if current_group:
        groups.append(current_group)
    
    return groups


def main():
    api_key = os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        logger.error("GOOGLE_API_KEY not set. Add it to .env file.")
        sys.exit(1)
    
    # Get folder URL
    if len(sys.argv) > 1:
        folder_url = sys.argv[1]
    else:
        folder_url = DEFAULT_FOLDER_URL
    
    folder_id = extract_folder_id(folder_url)
    
    # Fetch all photos with metadata
    photos = fetch_all_photos(folder_id, api_key)
    
    if not photos:
        logger.error("No photos found")
        sys.exit(1)
    
    logger.info(f"Total photos: {len(photos)}")
    
    # Group photos
    groups = group_by_time_and_sequence(photos)
    
    # Stats
    single_groups = sum(1 for g in groups if len(g) == 1)
    multi_groups = sum(1 for g in groups if len(g) > 1)
    avg_group_size = len(photos) / len(groups) if groups else 0
    
    logger.info(f"Grouped into {len(groups)} groups")
    logger.info(f"  Single photo groups: {single_groups}")
    logger.info(f"  Multi-photo groups: {multi_groups}")
    logger.info(f"  Average group size: {avg_group_size:.1f}")
    
    # Clean up non-serializable fields and prepare output
    for photo in photos:
        photo.pop('time_dt', None)
    
    output = {
        'source': folder_url,
        'total_photos': len(photos),
        'total_groups': len(groups),
        'time_threshold_seconds': TIME_GAP_THRESHOLD_SECONDS,
        'groups': [
            {
                'id': f"group_{i}",
                'photos': group
            }
            for i, group in enumerate(groups)
        ]
    }
    
    # Save
    output_file = Path(__file__).parent / "photos.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    logger.success(f"Saved to {output_file}")
    
    # Show group size distribution
    sizes = defaultdict(int)
    for g in groups:
        size = len(g)
        if size >= 10:
            sizes['10+'] += 1
        elif size >= 5:
            sizes['5-9'] += 1
        else:
            sizes[size] += 1
    
    logger.info("Group size distribution:")
    for size in sorted(sizes.keys(), key=lambda x: int(x) if isinstance(x, int) else 999):
        logger.info(f"  {size} photos: {sizes[size]} groups")
    
    # Time estimate
    review_time_minutes = len(groups) * 4 / 60  # 4 seconds per group
    logger.info(f"\nEstimated review time: {review_time_minutes:.0f} minutes")


if __name__ == "__main__":
    main()
