/**
 * Controls - keyboard handling, navigation, actions
 */

import { state, saveState, GRID_SIZE } from './state.js';
import { updateUI, updateKeyboardHints, updateModeButtons, updateViewToggle, getCurrentBatch, hideGridPreview, isGridPreviewOpen } from './ui.js';
import { applyFilters } from './app.js';

// Toggle between single and grid view
export function toggleViewMode() {
    state.viewMode = state.viewMode === 'single' ? 'grid' : 'single';
    state.gridSelection.clear();
    
    // Align index to batch boundary for grid mode
    if (state.viewMode === 'grid') {
        state.currentIndex = Math.floor(state.currentIndex / GRID_SIZE) * GRID_SIZE;
    }
    
    updateViewToggle();
    updateKeyboardHints();
    updateUI();
}

// Toggle selection for a photo in grid mode
export function toggleGridSelection(index) {
    const actualIndex = state.currentIndex + index;
    if (actualIndex >= state.photos.length) return;
    
    if (state.gridSelection.has(index)) {
        state.gridSelection.delete(index);
    } else {
        state.gridSelection.add(index);
    }
    updateUI();
}

// Confirm grid selection - accept selected, reject rest (for pending mode)
export function confirmGridSelection(statusForSelected) {
    const batch = getCurrentBatch();
    if (batch.length === 0) return;
    
    // Build history entry for the batch
    const batchHistory = {
        type: 'batch',
        decisions: [],
        mode: state.currentMode,
        folder: state.currentFolder,
        viewMode: 'grid'
    };
    
    batch.forEach((photo, i) => {
        const prevStatus = state.decisions[photo.id] || null;
        let newStatus;
        
        if (state.gridSelection.has(i)) {
            newStatus = statusForSelected;
        } else {
            newStatus = 'rejected';
        }
        
        batchHistory.decisions.push({
            photoId: photo.id,
            prevStatus,
            newStatus
        });
        
        state.decisions[photo.id] = newStatus;
    });
    
    state.history.push(batchHistory);
    if (state.history.length > 100) state.history.shift();
    
    // Move to next batch
    state.gridSelection.clear();
    state.currentIndex += GRID_SIZE;
    
    // If past the end, refresh list
    if (state.currentIndex >= state.photos.length) {
        applyFilters();
    } else {
        saveState();
        updateUI();
    }
}

// Reverse selected items in browse mode (accepted→rejected or rejected→accepted)
function reverseSelectedInBrowseMode() {
    const batch = getCurrentBatch();
    if (batch.length === 0 || state.gridSelection.size === 0) return;
    
    const reverseStatus = state.currentMode === 'accepted' ? 'rejected' : 'accepted';
    
    const batchHistory = {
        type: 'batch',
        decisions: [],
        mode: state.currentMode,
        folder: state.currentFolder,
        viewMode: 'grid'
    };
    
    // Only change selected items
    batch.forEach((photo, i) => {
        if (state.gridSelection.has(i)) {
            batchHistory.decisions.push({
                photoId: photo.id,
                prevStatus: state.decisions[photo.id],
                newStatus: reverseStatus
            });
            state.decisions[photo.id] = reverseStatus;
        }
    });
    
    state.history.push(batchHistory);
    if (state.history.length > 100) state.history.shift();
    
    state.gridSelection.clear();
    saveState();
    
    // Refresh the list since items were removed
    applyFilters();
}

// Make a decision on single photo
export function decide(status) {
    if (state.photos.length === 0 || state.currentIndex >= state.photos.length) return;
    
    const photo = state.photos[state.currentIndex];
    
    // In browse modes, only allow reversing (accepted→rejected or rejected→accepted)
    if (state.currentMode === 'accepted' && status === 'accepted') return;
    if (state.currentMode === 'rejected' && status === 'rejected') return;
    
    state.history.push({
        type: 'single',
        photoId: photo.id,
        prevStatus: state.decisions[photo.id] || null,
        mode: state.currentMode,
        folder: state.currentFolder,
        viewMode: 'single'
    });
    if (state.history.length > 100) state.history.shift();
    
    state.decisions[photo.id] = status;
    
    // In browse modes, remove from current list (since status changed)
    if (state.currentMode !== 'all') {
        state.photos.splice(state.currentIndex, 1);
        if (state.currentIndex >= state.photos.length) {
            state.currentIndex = Math.max(0, state.photos.length - 1);
        }
    } else {
        state.currentIndex++;
    }
    
    saveState();
    updateUI();
}

// Navigate single view
export function navigateNext() {
    if (state.currentIndex < state.photos.length - 1) {
        state.currentIndex++;
        updateUI();
    }
}

export function navigatePrev() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        updateUI();
    }
}

// Navigate grid batches
export function navigateNextBatch() {
    if (state.currentIndex + GRID_SIZE < state.photos.length) {
        state.currentIndex += GRID_SIZE;
        state.gridSelection.clear();
        updateUI();
    }
}

export function navigatePrevBatch() {
    if (state.currentIndex >= GRID_SIZE) {
        state.currentIndex -= GRID_SIZE;
        state.gridSelection.clear();
        updateUI();
    }
}

// Jump to specific index
export function jumpTo(index) {
    if (index >= 0 && index < state.photos.length) {
        state.currentIndex = index;
        if (state.viewMode === 'grid') {
            state.currentIndex = Math.floor(index / GRID_SIZE) * GRID_SIZE;
            state.gridSelection.clear();
        }
        updateUI();
    }
}

// Undo last action
export function undo() {
    if (state.history.length === 0) return;
    
    const last = state.history.pop();
    
    if (last.type === 'batch') {
        last.decisions.forEach(d => {
            if (d.prevStatus) {
                state.decisions[d.photoId] = d.prevStatus;
            } else {
                delete state.decisions[d.photoId];
            }
        });
    } else {
        if (last.prevStatus) {
            state.decisions[last.photoId] = last.prevStatus;
        } else {
            delete state.decisions[last.photoId];
        }
    }
    
    state.currentFolder = last.folder;
    
    if (last.viewMode && last.viewMode !== state.viewMode) {
        state.viewMode = last.viewMode;
        updateViewToggle();
        updateKeyboardHints();
    }
    
    // Need to call setMode from app.js but avoid circular deps
    // Just update state and UI directly
    state.currentMode = last.mode;
    updateModeButtons();
    
    saveState();
    applyFilters();
}

// Set filter mode
export function setMode(mode) {
    state.currentMode = mode;
    updateModeButtons();
    updateKeyboardHints();
    applyFilters();
}

// Keyboard handlers
export function handleKeydown(e) {
    const el = document.getElementById('current-photo');
    const modal = document.getElementById('settings-modal');
    
    // Escape handling
    if (e.key === 'Escape') {
        if (isGridPreviewOpen()) {
            hideGridPreview();
            return;
        }
        if (el && el.classList.contains('zoomed')) {
            el.classList.remove('zoomed');
            return;
        }
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            return;
        }
    }
    
    // Block other keys when modals/previews are open
    if (isGridPreviewOpen()) return;
    if (modal && !modal.classList.contains('hidden')) return;
    if (el && el.classList.contains('zoomed')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    // Toggle view mode
    if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        toggleViewMode();
        return;
    }
    
    // Undo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
        return;
    }
    
    if (state.viewMode === 'grid') {
        handleGridKeydown(e);
    } else {
        handleSingleKeydown(e);
    }
}

function handleSingleKeydown(e) {
    const isBrowseMode = state.currentMode === 'accepted' || state.currentMode === 'rejected';
    const reverseStatus = state.currentMode === 'accepted' ? 'rejected' : 'accepted';
    
    switch (e.key) {
        case 'ArrowRight':
            e.preventDefault();
            if (isBrowseMode) {
                navigateNext();
            } else {
                decide('accepted');
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (isBrowseMode) {
                navigatePrev();
            } else {
                decide('rejected');
            }
            break;
        case ' ':
            e.preventDefault();
            if (isBrowseMode) {
                // Reverse current photo's status
                decide(reverseStatus);
            } else {
                decide('accepted');
            }
            break;
        case 'd':
        case 'D':
            e.preventDefault();
            decide('accepted');
            break;
        case 'a':
        case 'A':
            e.preventDefault();
            decide('rejected');
            break;
    }
}

function handleGridKeydown(e) {
    const isBrowseMode = state.currentMode === 'accepted' || state.currentMode === 'rejected';
    
    switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
            e.preventDefault();
            toggleGridSelection(parseInt(e.key) - 1);
            break;
        case ' ':
            e.preventDefault();
            if (isBrowseMode) {
                // Reverse selected items only, don't touch unselected
                if (state.gridSelection.size > 0) {
                    reverseSelectedInBrowseMode();
                } else {
                    navigateNextBatch();
                }
            } else {
                confirmGridSelection('accepted');
            }
            break;
        case 'ArrowRight':
            e.preventDefault();
            navigateNextBatch();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            navigatePrevBatch();
            break;
    }
}
