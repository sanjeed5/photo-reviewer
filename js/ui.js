/**
 * UI updates and rendering
 */

import { state, getCounts, GRID_SIZE } from './state.js';

// DOM Elements (cached on first access)
let elements = null;

export function getElements() {
    if (!elements) {
        elements = {
            loading: document.getElementById('loading'),
            photoContainer: document.getElementById('photo-container'),
            currentPhoto: document.getElementById('current-photo'),
            photoGrid: document.getElementById('photo-grid'),
            doneMessage: document.getElementById('done-message'),
            photoName: document.getElementById('photo-name'),
            photoFolder: document.getElementById('photo-folder'),
            thumbnailStrip: document.getElementById('thumbnail-strip'),
            keyboardHints: document.getElementById('keyboard-hints'),
            acceptedCount: document.getElementById('accepted-count'),
            targetCount: document.getElementById('target-count'),
            rejectedCount: document.getElementById('rejected-count'),
            reviewedCount: document.getElementById('reviewed-count'),
            totalCount: document.getElementById('total-count'),
            viewToggle: document.getElementById('view-toggle'),
            undoBtn: document.getElementById('undo-btn'),
            exportBtn: document.getElementById('export-btn'),
            importBtn: document.getElementById('import-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            resetBtn: document.getElementById('reset-btn'),
            exportFinalBtn: document.getElementById('export-final-btn'),
            modeAll: document.getElementById('mode-all'),
            modeAccepted: document.getElementById('mode-accepted'),
            modeRejected: document.getElementById('mode-rejected'),
            folderFilter: document.getElementById('folder-filter'),
            settingsModal: document.getElementById('settings-modal'),
            targetInput: document.getElementById('target-input'),
            settingsSave: document.getElementById('settings-save'),
            settingsCancel: document.getElementById('settings-cancel'),
            gridPreview: document.getElementById('grid-preview'),
            gridPreviewImg: document.querySelector('#grid-preview img'),
        };
    }
    return elements;
}

export function updateUI() {
    const el = getElements();
    const counts = getCounts();
    
    // Stats
    el.acceptedCount.textContent = counts.accepted;
    el.targetCount.textContent = state.target;
    el.rejectedCount.textContent = counts.rejected;
    el.reviewedCount.textContent = counts.accepted + counts.rejected;
    el.totalCount.textContent = state.allPhotos.length;
    
    el.undoBtn.disabled = state.history.length === 0;
    
    // Progress bar
    const progressBar = document.getElementById('progress-bar');
    const pct = state.target > 0 ? Math.min(100, (counts.accepted / state.target) * 100) : 0;
    progressBar.style.width = `${pct}%`;
    progressBar.style.background = counts.accepted >= state.target ? 'var(--color-accept)' : '';
    
    // Show appropriate view
    if (state.photos.length === 0 || state.currentIndex >= state.photos.length) {
        el.photoContainer.classList.add('hidden');
        el.photoGrid.classList.add('hidden');
        el.doneMessage.classList.remove('hidden');
        updateDoneMessage(counts);
    } else if (state.viewMode === 'grid') {
        el.photoContainer.classList.add('hidden');
        el.photoGrid.classList.remove('hidden');
        el.doneMessage.classList.add('hidden');
        updateGridUI();
    } else {
        el.photoContainer.classList.remove('hidden');
        el.photoGrid.classList.add('hidden');
        el.doneMessage.classList.add('hidden');
        updateSingleUI();
    }
    
    updateThumbnailStrip();
}

// Helper to get best thumbnail URL (local if available, else remote)
function getThumbnailUrl(photo, size = 400) {
    // Prefer local thumbnail if available
    if (photo.thumbnail_local) {
        return photo.thumbnail_local;
    }
    // Fall back to remote with specified size
    return photo.thumbnail.replace(/=w\d+/, `=w${size}`);
}

function updateSingleUI() {
    const el = getElements();
    const photo = state.photos[state.currentIndex];
    const src = getThumbnailUrl(photo, 400);
    if (el.currentPhoto.src !== src) {
        el.currentPhoto.src = src;
        el.currentPhoto.dataset.retry = '0';
        el.currentPhoto.onerror = function() { window.retryImage(this); };
    }
    
    const fileName = photo.name.split('/').pop();
    const folder = photo.folder || photo.name.split('/').slice(0, -1).join('/') || 'root';
    
    el.photoName.textContent = `${fileName} (${state.currentIndex + 1}/${state.photos.length})`;
    el.photoFolder.textContent = folder;
}

// Track current batch ID to prevent race conditions
let currentBatchId = 0;

function updateGridUI() {
    const el = getElements();
    const batch = getCurrentBatch();
    const gridPhotos = document.querySelectorAll('.grid-photo');
    const grid = document.getElementById('photo-grid');
    
    // Reset to default 2x2 layout while loading new batch
    grid.classList.remove('grid-all-portrait', 'grid-all-landscape', 'grid-mostly-portrait', 'grid-mixed');
    
    // Increment batch ID to invalidate any pending callbacks from previous batches
    const thisBatchId = ++currentBatchId;
    
    // Track orientations to adapt grid layout
    let processedCount = 0;
    const orientations = [];
    const batchSize = batch.length;
    
    // Helper to finalize layout once all images processed
    const finalizeLayout = () => {
        processedCount++;
        // Only apply layout if this is still the current batch
        if (processedCount === batchSize && thisBatchId === currentBatchId) {
            adaptGridLayout(orientations);
        }
    };
    
    gridPhotos.forEach((gridEl, i) => {
        const img = gridEl.querySelector('img');
        if (i < batchSize) {
            const photo = batch[i];
            gridEl.classList.remove('empty');
            gridEl.classList.toggle('selected', state.gridSelection.has(i));
            // Use local thumbnail or remote w300
            const src = getThumbnailUrl(photo, 300);
            
            const isNewSrc = img.src !== src;
            if (isNewSrc) {
                img.src = src;
                img.dataset.retry = '0';
            }
            
            // Detect orientation when image loads
            img.onload = function() {
                const isPortrait = this.naturalHeight > this.naturalWidth;
                gridEl.classList.toggle('portrait', isPortrait);
                gridEl.classList.toggle('landscape', !isPortrait);
                orientations[i] = isPortrait ? 'portrait' : 'landscape';
                finalizeLayout();
            };
            
            // Handle load failures - default to landscape
            img.onerror = function() {
                gridEl.classList.remove('portrait');
                gridEl.classList.add('landscape');
                orientations[i] = 'landscape';
                finalizeLayout();
                // Still retry for display
                window.retryImage(this);
            };
            
            // If already loaded (cached), check immediately
            if (!isNewSrc && img.complete) {
                if (img.naturalHeight > 0) {
                    const isPortrait = img.naturalHeight > img.naturalWidth;
                    gridEl.classList.toggle('portrait', isPortrait);
                    gridEl.classList.toggle('landscape', !isPortrait);
                    orientations[i] = isPortrait ? 'portrait' : 'landscape';
                } else {
                    // Failed load, default to landscape
                    orientations[i] = 'landscape';
                }
                finalizeLayout();
            }
        } else {
            gridEl.classList.add('empty');
            gridEl.classList.remove('selected', 'portrait', 'landscape');
        }
    });
    
    // Update info
    const batchStart = state.currentIndex + 1;
    const batchEnd = Math.min(state.currentIndex + GRID_SIZE, state.photos.length);
    el.photoName.textContent = `Batch ${Math.floor(state.currentIndex / GRID_SIZE) + 1} (${batchStart}-${batchEnd} of ${state.photos.length})`;
    el.photoFolder.textContent = state.currentFolder || 'All Folders';
}

// Adapt grid layout based on photo orientations
function adaptGridLayout(orientations) {
    const grid = document.getElementById('photo-grid');
    const portraitCount = orientations.filter(o => o === 'portrait').length;
    const landscapeCount = orientations.filter(o => o === 'landscape').length;
    const total = orientations.length;
    
    // Remove previous layout classes
    grid.classList.remove('grid-all-portrait', 'grid-all-landscape', 'grid-mostly-portrait', 'grid-mixed');
    
    if (portraitCount === total) {
        // All portraits: single row layout
        grid.classList.add('grid-all-portrait');
    } else if (landscapeCount === total) {
        // All landscapes: 2x2 grid
        grid.classList.add('grid-all-landscape');
    } else if (portraitCount >= 3) {
        // Mostly portraits (3 or 4): use portrait layout
        grid.classList.add('grid-mostly-portrait');
    } else {
        // Mixed or mostly landscapes: 2x2 works fine
        grid.classList.add('grid-mixed');
    }
    
    // Preload next batch now that current batch is loaded
    preloadAfterGrid();
}

export function getCurrentBatch() {
    return state.photos.slice(state.currentIndex, state.currentIndex + GRID_SIZE);
}

function updateDoneMessage(counts) {
    const el = getElements();
    const h2 = el.doneMessage.querySelector('h2');
    const p = el.doneMessage.querySelector('p');
    
    if (state.currentMode === 'all') {
        h2.textContent = '🎉 Done with this folder!';
        p.textContent = `Accepted: ${counts.accepted}/${state.target}. Try another folder or export.`;
    } else if (state.currentMode === 'accepted') {
        h2.textContent = '📷 No accepted photos';
        p.textContent = counts.accepted > 0 ? `${counts.accepted} accepted in other folders.` : 'Accept some photos first!';
    } else if (state.currentMode === 'rejected') {
        h2.textContent = '🗑️ No rejected photos';
        p.textContent = 'No rejected photos in this folder.';
    }
}

function updateThumbnailStrip() {
    const el = getElements();
    
    // Center current image in the strip - show 5 before and 5 after
    const thumbCount = 11;
    const halfCount = Math.floor(thumbCount / 2);
    
    // Calculate start index, clamped to valid range
    let startIdx = state.currentIndex - halfCount;
    if (startIdx < 0) startIdx = 0;
    if (startIdx + thumbCount > state.photos.length) {
        startIdx = Math.max(0, state.photos.length - thumbCount);
    }
    
    const visible = state.photos.slice(startIdx, startIdx + thumbCount);
    
    // Build thumbnail strip using DOM methods to prevent XSS
    el.thumbnailStrip.replaceChildren();
    visible.forEach((p, i) => {
        const actualIndex = startIdx + i;
        const src = p.thumbnail_local || p.thumbnail.replace(/=w\d+/, '=w200');
        const isCurrent = (state.viewMode === 'single' && actualIndex === state.currentIndex) || 
                          (state.viewMode === 'grid' && actualIndex >= state.currentIndex && actualIndex < state.currentIndex + GRID_SIZE);
        
        const img = document.createElement('img');
        img.src = src;
        img.className = isCurrent ? 'current' : '';
        img.alt = String(actualIndex + 1);
        img.title = p.name.split('/').pop();
        img.dataset.index = actualIndex;
        img.loading = 'lazy';
        img.dataset.retry = '0';
        img.onerror = function() { window.retryImage(this); };
        
        el.thumbnailStrip.appendChild(img);
    });
}

// Retry failed images with exponential backoff (longer delays to avoid rate limits)
window.retryImage = function(img) {
    const retries = parseInt(img.dataset.retry || '0', 10);
    const src = img.src;
    
    if (retries < 5) {
        img.dataset.retry = retries + 1;
        // Longer delays: 2s, 4s, 8s, 16s, 32s
        const delay = 2000 * Math.pow(2, retries);
        console.warn(`[Image Error] Retry ${retries + 1}/5 in ${delay/1000}s`);
        setTimeout(() => {
            img.src = '';
            img.src = src;
        }, delay);
    } else {
        console.error(`[Image Failed] Gave up after 5 retries:`, src);
        img.style.opacity = '0.3';
        img.onerror = null;
    }
};

export function updateKeyboardHints() {
    const el = getElements();
    const isBrowseMode = state.currentMode === 'accepted' || state.currentMode === 'rejected';
    const reverseAction = state.currentMode === 'accepted' ? 'Reject' : 'Accept';
    
    if (state.viewMode === 'grid') {
        if (isBrowseMode) {
            el.keyboardHints.innerHTML = `
                <kbd>1-4</kbd> Select &nbsp;|&nbsp; 
                <kbd>Space</kbd> ${reverseAction} selected &nbsp;|&nbsp;
                <kbd>←→</kbd> Browse batches &nbsp;|&nbsp;
                <kbd>Click</kbd> Preview &nbsp;|&nbsp;
                <kbd>G</kbd> Single mode
            `;
        } else {
            el.keyboardHints.innerHTML = `
                <kbd>1-4</kbd> Select &nbsp;|&nbsp; 
                <kbd>Space</kbd> Accept selected &nbsp;|&nbsp; 
                <kbd>←→</kbd> Browse batches &nbsp;|&nbsp;
                <kbd>Click</kbd> Preview &nbsp;|&nbsp;
                <kbd>G</kbd> Single mode
            `;
        }
    } else {
        if (isBrowseMode) {
            el.keyboardHints.innerHTML = `
                <kbd>Space</kbd> ${reverseAction} &nbsp;|&nbsp; 
                <kbd>←→</kbd> Navigate &nbsp;|&nbsp;
                <kbd>G</kbd> Grid mode
            `;
        } else {
            el.keyboardHints.innerHTML = `
                <kbd>A</kbd> Reject &nbsp;|&nbsp; 
                <kbd>D</kbd> Accept &nbsp;|&nbsp; 
                <kbd>←→</kbd> Navigate &nbsp;|&nbsp;
                <kbd>G</kbd> Grid mode
            `;
        }
    }
}

export function updateModeButtons() {
    const el = getElements();
    el.modeAll.classList.toggle('active', state.currentMode === 'all');
    el.modeAccepted.classList.toggle('active', state.currentMode === 'accepted');
    el.modeRejected.classList.toggle('active', state.currentMode === 'rejected');
}

export function updateViewToggle() {
    const el = getElements();
    el.viewToggle.textContent = state.viewMode === 'single' ? 'Grid' : 'Single';
}

export function populateFolderFilter() {
    const el = getElements();
    const folders = new Set();
    state.allPhotos.forEach(p => {
        const folder = p.folder || p.name.split('/').slice(0, -1).join('/') || 'root';
        folders.add(folder);
    });
    
    const sortedFolders = Array.from(folders).sort();
    
    // Build options using DOM methods to prevent XSS
    el.folderFilter.replaceChildren();
    
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = `All Folders (${state.allPhotos.length})`;
    el.folderFilter.appendChild(allOption);
    
    sortedFolders.forEach(f => {
        const count = state.allPhotos.filter(p => (p.folder || p.name.split('/').slice(0, -1).join('/') || 'root') === f).length;
        const option = document.createElement('option');
        option.value = f;
        option.textContent = `${f} (${count})`;
        el.folderFilter.appendChild(option);
    });
}

// Settings modal
export function openSettings() {
    const el = getElements();
    el.targetInput.value = state.target;
    el.settingsModal.classList.remove('hidden');
}

export function closeSettings() {
    const el = getElements();
    el.settingsModal.classList.add('hidden');
}

// Preload next batch of images in background
export function preloadNext() {
    const isGrid = state.viewMode === 'grid';
    // In grid mode, preload next 2 batches (8 images). In single, preload next 5.
    const start = isGrid ? state.currentIndex + GRID_SIZE : state.currentIndex + 1;
    const count = isGrid ? GRID_SIZE * 2 : 5;
    
    for (let i = 0; i < count; i++) {
        const idx = start + i;
        if (idx < state.photos.length) {
            const photo = state.photos[idx];
            const src = getThumbnailUrl(photo, 300);
            const img = new Image();
            img.src = src;
        }
    }
}

// Call preload after grid batch loads
export function preloadAfterGrid() {
    // Small delay to not compete with current batch loading
    setTimeout(preloadNext, 500);
}

// Grid preview modal
export function showGridPreview(gridIndex) {
    const el = getElements();
    const photoIndex = state.currentIndex + gridIndex;
    
    if (photoIndex >= state.photos.length) return;
    
    const photo = state.photos[photoIndex];
    // Use larger image for preview
    // Use local thumbnail or remote w600 for preview
    const src = photo.thumbnail_local || photo.thumbnail.replace(/=w\d+/, '=w600');
    
    el.gridPreviewImg.src = src;
    el.gridPreview.classList.remove('hidden');
    
    // Store which photo is being previewed for potential actions
    el.gridPreview.dataset.gridIndex = gridIndex;
}

export function hideGridPreview() {
    const el = getElements();
    el.gridPreview.classList.add('hidden');
    el.gridPreviewImg.src = '';
}

export function isGridPreviewOpen() {
    const el = getElements();
    return !el.gridPreview.classList.contains('hidden');
}
