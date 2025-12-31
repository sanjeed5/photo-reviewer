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
    const pct = Math.min(100, (counts.accepted / state.target) * 100);
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

function updateSingleUI() {
    const el = getElements();
    const photo = state.photos[state.currentIndex];
    // Use w800 for single view (balance between quality and speed)
    const src = photo.thumbnail.replace('=w1200', '=w800');
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

function updateGridUI() {
    const el = getElements();
    const batch = getCurrentBatch();
    const gridPhotos = document.querySelectorAll('.grid-photo');
    
    // Track orientations to adapt grid layout
    let loadedCount = 0;
    const orientations = [];
    
    gridPhotos.forEach((gridEl, i) => {
        const img = gridEl.querySelector('img');
        if (i < batch.length) {
            const photo = batch[i];
            gridEl.classList.remove('empty');
            gridEl.classList.toggle('selected', state.gridSelection.has(i));
            // Use medium size for grid (w600)
            const src = photo.thumbnail.replace('=w1200', '=w600');
            if (img.src !== src) {
                img.src = src;
                img.dataset.retry = '0';
                img.onerror = function() { window.retryImage(this); };
            }
            
            // Detect orientation when image loads
            img.onload = function() {
                const isPortrait = this.naturalHeight > this.naturalWidth;
                gridEl.classList.toggle('portrait', isPortrait);
                gridEl.classList.toggle('landscape', !isPortrait);
                orientations[i] = isPortrait ? 'portrait' : 'landscape';
                loadedCount++;
                
                // Once all images loaded, adapt grid layout
                if (loadedCount === batch.length) {
                    adaptGridLayout(orientations);
                }
            };
            
            // If already loaded (cached), check immediately
            if (img.complete && img.naturalHeight > 0) {
                const isPortrait = img.naturalHeight > img.naturalWidth;
                gridEl.classList.toggle('portrait', isPortrait);
                gridEl.classList.toggle('landscape', !isPortrait);
                orientations[i] = isPortrait ? 'portrait' : 'landscape';
                loadedCount++;
                
                if (loadedCount === batch.length) {
                    adaptGridLayout(orientations);
                }
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
    
    el.thumbnailStrip.innerHTML = visible.map((p, i) => {
        const actualIndex = startIdx + i;
        // Use smaller thumbnail for strip (w200 instead of w1200)
        const src = p.thumbnail_small || p.thumbnail.replace('=w1200', '=w200');
        const isCurrent = (state.viewMode === 'single' && actualIndex === state.currentIndex) || 
                          (state.viewMode === 'grid' && actualIndex >= state.currentIndex && actualIndex < state.currentIndex + GRID_SIZE);
        return `<img src="${src}" 
                     class="${isCurrent ? 'current' : ''}" 
                     alt="${actualIndex + 1}"
                     title="${p.name.split('/').pop()}"
                     data-index="${actualIndex}"
                     loading="lazy"
                     data-retry="0"
                     onerror="retryImage(this)">`;
    }).join('');
}

// Retry failed images with exponential backoff
window.retryImage = function(img) {
    const retries = parseInt(img.dataset.retry || '0', 10);
    const src = img.src;
    
    console.warn(`[Image Error] Retry ${retries + 1}/3 for:`, src.substring(0, 80) + '...');
    
    if (retries < 3) {
        img.dataset.retry = retries + 1;
        const delay = 1000 * Math.pow(2, retries);
        console.log(`  → Retrying in ${delay}ms`);
        setTimeout(() => {
            img.src = '';
            img.src = src;
        }, delay);
    } else {
        console.error(`[Image Failed] Gave up after 3 retries:`, src);
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
    el.folderFilter.innerHTML = '<option value="">All Folders (' + state.allPhotos.length + ')</option>' +
        sortedFolders.map(f => {
            const count = state.allPhotos.filter(p => (p.folder || p.name.split('/').slice(0, -1).join('/') || 'root') === f).length;
            return `<option value="${f}">${f} (${count})</option>`;
        }).join('');
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

// Preload next images
export function preloadNext() {
    const count = state.viewMode === 'grid' ? GRID_SIZE * 2 : 3;
    for (let i = 1; i <= count; i++) {
        if (state.currentIndex + i < state.photos.length) {
            const img = new Image();
            img.src = state.photos[state.currentIndex + i].thumbnail;
        }
    }
}

// Grid preview modal
export function showGridPreview(gridIndex) {
    const el = getElements();
    const photoIndex = state.currentIndex + gridIndex;
    
    if (photoIndex >= state.photos.length) return;
    
    const photo = state.photos[photoIndex];
    // Use larger image for preview
    const src = photo.thumbnail.replace('=w600', '=w1200').replace('=w800', '=w1200');
    
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
