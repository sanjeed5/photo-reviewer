/**
 * State management, persistence, export/import
 */

export const STORAGE_KEY = 'photoReviewerState';
export const DEFAULT_TARGET = 300;
export const GRID_SIZE = 4;

// Global state
export const state = {
    allPhotos: [],
    photos: [],           // Filtered photos for current view
    currentIndex: 0,
    decisions: {},        // { photoId: 'accepted' | 'rejected' }
    history: [],
    target: DEFAULT_TARGET,
    currentMode: 'all',   // 'all' | 'accepted' | 'rejected'
    currentFolder: '',
    viewMode: 'single',   // 'single' | 'grid'
    gridSelection: new Set(),
};

// Save to localStorage
export function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            decisions: state.decisions,
            target: state.target,
            currentFolder: state.currentFolder,
            viewMode: state.viewMode,
            lastUpdated: new Date().toISOString()
        }));
    } catch (e) {
        console.error('Failed to save state:', e);
        alert('⚠️ Failed to save! Export your progress now to avoid losing work.');
    }
}

// Load from localStorage
export function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            state.decisions = data.decisions || {};
            state.target = data.target || DEFAULT_TARGET;
            state.currentFolder = data.currentFolder || '';
            state.viewMode = data.viewMode || 'single';
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }
}

// Reset all state
export function resetState() {
    state.decisions = {};
    state.history = [];
    localStorage.removeItem(STORAGE_KEY);
}

// Export results and backup
export function exportState() {
    const accepted = state.allPhotos.filter(p => state.decisions[p.id] === 'accepted');
    const rejected = state.allPhotos.filter(p => state.decisions[p.id] === 'rejected');
    
    // Human-readable results
    const lines = [
        `# Photo Review Results`,
        `# Exported: ${new Date().toISOString()}`,
        `# Target: ${state.target}`,
        `# Progress: ${accepted.length} accepted, ${rejected.length} rejected`,
        '',
        `## ACCEPTED (${accepted.length})`,
        ...accepted.map(p => p.name),
    ];
    
    downloadFile('photo_review_results.txt', lines.join('\n'));
    
    // Full state backup (can be imported to restore progress)
    const stateBackup = {
        _format: 'photo-reviewer-state-v1',
        exported_at: new Date().toISOString(),
        target: state.target,
        decisions: state.decisions,
        summary: {
            accepted: accepted.length,
            rejected: rejected.length,
            total: state.allPhotos.length
        }
    };
    
    downloadFile('photo_review_state.json', JSON.stringify(stateBackup, null, 2));
    
    return { accepted: accepted.length, rejected: rejected.length };
}

// Import from backup file
export async function importStateFromFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (data._format !== 'photo-reviewer-state-v1') {
        throw new Error('Invalid backup file format');
    }
    
    return {
        data,
        apply: () => {
            state.decisions = data.decisions || {};
            state.target = data.target || DEFAULT_TARGET;
            saveState();
        }
    };
}

// Get counts for UI
export function getCounts() {
    const counts = { accepted: 0, rejected: 0 };
    for (const status of Object.values(state.decisions)) {
        if (status === 'accepted' || status === 'rejected') {
            counts[status]++;
        }
    }
    return counts;
}

// Helper to download a file
function downloadFile(name, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.click();
    // Delay revoking to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
