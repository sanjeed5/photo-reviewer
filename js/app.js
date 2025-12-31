/**
 * Photo Reviewer - Main entry point
 * Dual mode: Single photo or 4-image grid
 */

import { state, loadState, saveState, resetState, exportState, importStateFromFile, GRID_SIZE } from './state.js';
import { getElements, updateUI, updateKeyboardHints, populateFolderFilter, openSettings, closeSettings, preloadNext, showGridPreview, hideGridPreview } from './ui.js';
import { handleKeydown, toggleViewMode, toggleGridSelection, setMode, undo, jumpTo } from './controls.js';

// Apply filters based on current mode and folder
export function applyFilters() {
    let filtered = state.allPhotos;
    
    if (state.currentFolder) {
        filtered = state.allPhotos.filter(p => {
            const folder = p.folder || p.name.split('/').slice(0, -1).join('/') || 'root';
            return folder === state.currentFolder;
        });
    }
    
    switch (state.currentMode) {
        case 'all':
            state.photos = filtered.filter(p => !state.decisions[p.id]);
            break;
        case 'accepted':
            state.photos = filtered.filter(p => state.decisions[p.id] === 'accepted');
            break;
        case 'rejected':
            state.photos = filtered.filter(p => state.decisions[p.id] === 'rejected');
            break;
    }
    
    state.currentIndex = 0;
    state.gridSelection.clear();
    updateUI();
}

async function init() {
    const el = getElements();
    
    try {
        const response = await fetch('photos.json');
        if (!response.ok) throw new Error('photos.json not found');
        
        const data = await response.json();
        
        if (data.groups) {
            state.allPhotos = data.groups.flatMap(g => g.photos);
        } else if (Array.isArray(data)) {
            state.allPhotos = data;
        } else {
            throw new Error('Invalid format');
        }
        
        if (state.allPhotos.length === 0) {
            el.loading.textContent = 'No photos found';
            return;
        }
        
        populateFolderFilter();
        loadState();
        
        // Restore UI from saved state
        el.targetInput.value = state.target;
        el.folderFilter.value = state.currentFolder;
        if (state.viewMode === 'grid') {
            el.viewToggle.textContent = 'Single';
        }
        
        applyFilters();
        setupEventListeners();
        updateKeyboardHints();
        
        el.loading.classList.add('hidden');
        
    } catch (error) {
        el.loading.textContent = `Error: ${error.message}`;
        console.error(error);
    }
}

function setupEventListeners() {
    const el = getElements();
    
    document.addEventListener('keydown', handleKeydown);
    
    // Warn before closing
    window.addEventListener('beforeunload', (e) => {
        if (Object.keys(state.decisions).length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    // View toggle
    el.viewToggle.addEventListener('click', toggleViewMode);
    
    // Actions
    el.undoBtn.addEventListener('click', undo);
    el.exportBtn.addEventListener('click', handleExport);
    el.importBtn.addEventListener('click', handleImport);
    el.settingsBtn.addEventListener('click', openSettings);
    el.resetBtn.addEventListener('click', handleReset);
    el.exportFinalBtn?.addEventListener('click', handleExport);
    
    // Mode buttons
    el.modeAll.addEventListener('click', () => setMode('all'));
    el.modeAccepted.addEventListener('click', () => setMode('accepted'));
    el.modeRejected.addEventListener('click', () => setMode('rejected'));
    
    // Folder filter
    el.folderFilter.addEventListener('change', (e) => {
        state.currentFolder = e.target.value;
        applyFilters();
    });
    
    // Settings modal
    el.settingsSave.addEventListener('click', () => {
        const val = parseInt(el.targetInput.value, 10);
        if (val > 0 && val <= 10000) {
            state.target = val;
            saveState();
            updateUI();
        }
        closeSettings();
    });
    el.settingsCancel.addEventListener('click', closeSettings);
    el.settingsModal.addEventListener('click', (e) => {
        if (e.target === el.settingsModal) closeSettings();
    });
    
    // Single photo click to zoom
    el.currentPhoto.addEventListener('click', () => {
        el.currentPhoto.classList.toggle('zoomed');
    });
    
    // Grid photo click to show preview
    document.querySelectorAll('.grid-photo').forEach((gridEl, i) => {
        gridEl.addEventListener('click', (e) => {
            // Shift+click to toggle selection, regular click to preview
            if (e.shiftKey) {
                toggleGridSelection(i);
            } else {
                showGridPreview(i);
            }
        });
    });
    
    // Grid preview overlay click to close
    const gridPreview = document.getElementById('grid-preview');
    gridPreview.addEventListener('click', hideGridPreview);
    
    // Thumbnail strip click
    el.thumbnailStrip.addEventListener('click', (e) => {
        const img = e.target.closest('img');
        if (img && img.dataset.index) {
            jumpTo(parseInt(img.dataset.index, 10));
        }
    });
    
    // Preload on image load
    el.currentPhoto.addEventListener('load', preloadNext);
}

function handleExport() {
    const counts = exportState();
    alert(`✅ Exported!\n\n• photo_review_results.txt - Your selections\n• photo_review_state.json - Backup (use Import to restore)\n\nAccepted: ${counts.accepted}, Rejected: ${counts.rejected}`);
}

async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const result = await importStateFromFile(file);
            
            const msg = `Import backup from ${result.data.exported_at}?\n\n` +
                `This will restore:\n` +
                `• ${result.data.summary.accepted} accepted\n` +
                `• ${result.data.summary.rejected} rejected\n\n` +
                `Current progress will be replaced.`;
            
            if (!confirm(msg)) return;
            
            result.apply();
            applyFilters();
            
            alert('✅ Progress restored!');
        } catch (err) {
            alert('❌ Failed to import: ' + err.message);
        }
    };
    
    input.click();
}

function handleReset() {
    if (!confirm('Reset all decisions? This cannot be undone.')) return;
    resetState();
    closeSettings();
    applyFilters();
}

// Start the app
init();
