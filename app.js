/**
 * Photo Reviewer - Simple accept/maybe/skip workflow
 * No grouping complexity - just review photos one by one with folder filtering
 */

const STORAGE_KEY = 'photoReviewerState';
const DEFAULT_TARGET = 300;

// State
let allPhotos = [];       // All photos from JSON
let photos = [];          // Filtered photos for current view
let currentIndex = 0;
let decisions = {};       // { photoId: 'accepted' | 'rejected' | 'maybe' }
let history = [];
let target = DEFAULT_TARGET;
let currentMode = 'all';  // 'all' | 'maybes' | 'accepted'
let currentFolder = '';   // '' = all folders

// DOM Elements
const elements = {
    loading: document.getElementById('loading'),
    photoContainer: document.getElementById('photo-container'),
    currentPhoto: document.getElementById('current-photo'),
    doneMessage: document.getElementById('done-message'),
    photoName: document.getElementById('photo-name'),
    photoFolder: document.getElementById('photo-folder'),
    thumbnailStrip: document.getElementById('thumbnail-strip'),
    acceptedCount: document.getElementById('accepted-count'),
    targetCount: document.getElementById('target-count'),
    maybeCount: document.getElementById('maybe-count'),
    rejectedCount: document.getElementById('rejected-count'),
    reviewedCount: document.getElementById('reviewed-count'),
    totalCount: document.getElementById('total-count'),
    maybesPending: document.getElementById('maybes-pending'),
    undoBtn: document.getElementById('undo-btn'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    resetBtn: document.getElementById('reset-btn'),
    exportFinalBtn: document.getElementById('export-final-btn'),
    modeAll: document.getElementById('mode-all'),
    modeMaybes: document.getElementById('mode-maybes'),
    modeAccepted: document.getElementById('mode-accepted'),
    modeRejected: document.getElementById('mode-rejected'),
    folderFilter: document.getElementById('folder-filter'),
    settingsModal: document.getElementById('settings-modal'),
    targetInput: document.getElementById('target-input'),
    settingsSave: document.getElementById('settings-save'),
    settingsCancel: document.getElementById('settings-cancel'),
};

async function init() {
    try {
        const response = await fetch('photos.json');
        if (!response.ok) throw new Error('photos.json not found');
        
        const data = await response.json();
        
        // Handle both grouped and flat formats
        if (data.groups) {
            // Flatten groups into single list
            allPhotos = data.groups.flatMap(g => g.photos);
        } else if (Array.isArray(data)) {
            allPhotos = data;
        } else {
            throw new Error('Invalid format');
        }
        
        if (allPhotos.length === 0) {
            elements.loading.textContent = 'No photos found';
            return;
        }
        
        // Populate folder dropdown
        populateFolderFilter();
        
        loadState();
        applyFilters();
        setupEventListeners();
        
        elements.loading.classList.add('hidden');
        
    } catch (error) {
        elements.loading.textContent = `Error: ${error.message}`;
        console.error(error);
    }
}

function populateFolderFilter() {
    const folders = new Set();
    allPhotos.forEach(p => {
        const folder = p.folder || p.name.split('/').slice(0, -1).join('/') || 'root';
        folders.add(folder);
    });
    
    const sortedFolders = Array.from(folders).sort();
    elements.folderFilter.innerHTML = '<option value="">All Folders (' + allPhotos.length + ')</option>' +
        sortedFolders.map(f => {
            const count = allPhotos.filter(p => (p.folder || p.name.split('/').slice(0, -1).join('/') || 'root') === f).length;
            return `<option value="${f}">${f} (${count})</option>`;
        }).join('');
}

function applyFilters() {
    // Filter by folder
    let filtered = allPhotos;
    if (currentFolder) {
        filtered = allPhotos.filter(p => {
            const folder = p.folder || p.name.split('/').slice(0, -1).join('/') || 'root';
            return folder === currentFolder;
        });
    }
    
    // Filter by mode
    switch (currentMode) {
        case 'all':
            photos = filtered.filter(p => !decisions[p.id]);
            break;
        case 'maybes':
            photos = filtered.filter(p => decisions[p.id] === 'maybe');
            break;
        case 'accepted':
            photos = filtered.filter(p => decisions[p.id] === 'accepted');
            break;
        case 'rejected':
            photos = filtered.filter(p => decisions[p.id] === 'rejected');
            break;
    }
    
    currentIndex = 0;
    updateUI();
}

function setupEventListeners() {
    document.addEventListener('keydown', handleKeydown);
    
    // Warn before closing tab if there are decisions
    window.addEventListener('beforeunload', (e) => {
        const decisionCount = Object.keys(decisions).length;
        if (decisionCount > 0) {
            e.preventDefault();
            e.returnValue = ''; // Required for Chrome
        }
    });
    
    elements.undoBtn.addEventListener('click', undo);
    elements.exportBtn.addEventListener('click', exportSelected);
    elements.importBtn.addEventListener('click', importState);
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.resetBtn.addEventListener('click', resetAll);
    elements.exportFinalBtn?.addEventListener('click', exportSelected);
    
    elements.modeAll.addEventListener('click', () => setMode('all'));
    elements.modeMaybes.addEventListener('click', () => setMode('maybes'));
    elements.modeAccepted.addEventListener('click', () => setMode('accepted'));
    elements.modeRejected.addEventListener('click', () => setMode('rejected'));
    
    elements.folderFilter.addEventListener('change', (e) => {
        currentFolder = e.target.value;
        applyFilters();
    });
    
    elements.settingsSave.addEventListener('click', saveSettings);
    elements.settingsCancel.addEventListener('click', closeSettings);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettings();
    });
    
    // Click to zoom
    elements.currentPhoto.addEventListener('click', () => {
        elements.currentPhoto.classList.toggle('zoomed');
    });
    
    // Preload next
    elements.currentPhoto.addEventListener('load', preloadNext);
}

function handleKeydown(e) {
    if (e.key === 'Escape') {
        if (elements.currentPhoto.classList.contains('zoomed')) {
            elements.currentPhoto.classList.remove('zoomed');
            return;
        }
        if (!elements.settingsModal.classList.contains('hidden')) {
            closeSettings();
            return;
        }
    }
    
    if (!elements.settingsModal.classList.contains('hidden')) return;
    if (elements.currentPhoto.classList.contains('zoomed')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    switch (e.key) {
        case 'ArrowRight':
        case ' ':
            e.preventDefault();
            if (currentMode === 'accepted' || currentMode === 'rejected') {
                // Browse mode - just navigate
                navigateNext();
            } else {
                decide('accepted');
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (currentMode === 'accepted' || currentMode === 'rejected') {
                // Browse mode - just navigate back
                navigatePrev();
            } else {
                decide('rejected');
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            decide('maybe');
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (currentMode === 'accepted' || currentMode === 'rejected') {
                navigateNext();
            }
            break;
        case 'z':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                undo();
            }
            break;
    }
}

function setMode(mode) {
    currentMode = mode;
    elements.modeAll.classList.toggle('active', mode === 'all');
    elements.modeMaybes.classList.toggle('active', mode === 'maybes');
    elements.modeAccepted.classList.toggle('active', mode === 'accepted');
    elements.modeRejected.classList.toggle('active', mode === 'rejected');
    applyFilters();
}

function decide(status) {
    if (photos.length === 0 || currentIndex >= photos.length) return;
    
    const photo = photos[currentIndex];
    
    // In browse modes, only allow changing status (not re-applying same)
    if (currentMode === 'accepted' && status === 'accepted') return;
    if (currentMode === 'rejected' && status === 'rejected') return;
    
    history.push({
        photoId: photo.id,
        prevStatus: decisions[photo.id] || null,
        mode: currentMode,
        folder: currentFolder
    });
    if (history.length > 100) history.shift();
    
    decisions[photo.id] = status;
    
    animateSwipe(status);
    
    setTimeout(() => {
        // In maybes/accepted mode, remove from list
        if (currentMode !== 'all') {
            photos.splice(currentIndex, 1);
            if (currentIndex >= photos.length) {
                currentIndex = Math.max(0, photos.length - 1);
            }
        } else {
            currentIndex++;
        }
        
        saveState();
        updateUI();
    }, 150);
}

function animateSwipe(status) {
    const dir = status === 'accepted' ? 'right' : status === 'rejected' ? 'left' : 'up';
    elements.photoContainer.classList.add(`swiping-${dir}`);
    setTimeout(() => elements.photoContainer.classList.remove(`swiping-${dir}`), 150);
}

function undo() {
    if (history.length === 0) return;
    
    const last = history.pop();
    
    if (last.prevStatus) {
        decisions[last.photoId] = last.prevStatus;
    } else {
        delete decisions[last.photoId];
    }
    
    // Restore filter state
    currentFolder = last.folder;
    elements.folderFilter.value = currentFolder;
    setMode(last.mode);
    
    saveState();
}

function updateUI() {
    // Stats across ALL photos
    const counts = { accepted: 0, rejected: 0, maybe: 0 };
    for (const status of Object.values(decisions)) {
        counts[status]++;
    }
    
    elements.acceptedCount.textContent = counts.accepted;
    elements.targetCount.textContent = target;
    elements.maybeCount.textContent = counts.maybe;
    elements.rejectedCount.textContent = counts.rejected;
    elements.reviewedCount.textContent = counts.accepted + counts.rejected + counts.maybe;
    elements.totalCount.textContent = allPhotos.length;
    elements.maybesPending.textContent = counts.maybe;
    
    elements.undoBtn.disabled = history.length === 0;
    
    // Progress bar
    const progressBar = document.getElementById('progress-bar');
    const pct = Math.min(100, (counts.accepted / target) * 100);
    progressBar.style.width = `${pct}%`;
    progressBar.style.background = counts.accepted >= target ? 'var(--color-accept)' : 
                                   pct > 80 ? 'var(--color-maybe)' : '';
    
    // Current photo
    if (photos.length > 0 && currentIndex < photos.length) {
        const photo = photos[currentIndex];
        elements.currentPhoto.src = photo.thumbnail;
        
        const fileName = photo.name.split('/').pop();
        const folder = photo.folder || photo.name.split('/').slice(0, -1).join('/') || 'root';
        
        elements.photoName.textContent = `${fileName} (${currentIndex + 1}/${photos.length})`;
        elements.photoFolder.textContent = folder;
        
        elements.photoContainer.classList.remove('hidden');
        elements.doneMessage.classList.add('hidden');
    } else {
        elements.photoContainer.classList.add('hidden');
        elements.doneMessage.classList.remove('hidden');
        
        const h2 = elements.doneMessage.querySelector('h2');
        const p = elements.doneMessage.querySelector('p');
        
        if (currentMode === 'all') {
            h2.textContent = '🎉 Done with this folder!';
            p.textContent = `Accepted: ${counts.accepted}/${target}. Try another folder or export.`;
        } else if (currentMode === 'maybes') {
            h2.textContent = '✓ No maybes';
            p.textContent = 'No maybes in this folder.';
        } else if (currentMode === 'accepted') {
            h2.textContent = '📷 No accepted photos';
            p.textContent = 'Accept some photos first!';
        } else if (currentMode === 'rejected') {
            h2.textContent = '🗑️ No rejected photos';
            p.textContent = 'No rejected photos in this folder.';
        }
    }
    
    updateThumbnailStrip();
}

function updateThumbnailStrip() {
    // Show upcoming photos (current + next 9)
    const upcoming = photos.slice(currentIndex, currentIndex + 10);
    
    elements.thumbnailStrip.innerHTML = upcoming.map((p, i) => {
        const src = p.thumbnail_small || p.thumbnail;
        const isCurrent = i === 0;
        return `<img src="${src}" 
                     class="${isCurrent ? 'current' : ''}" 
                     alt="${i + 1}"
                     title="${p.name.split('/').pop()}"
                     onclick="jumpTo(${currentIndex + i})"
                     onerror="this.style.opacity='0.3'">`;
    }).join('');
}

// Jump to a specific photo in the queue
function jumpTo(index) {
    if (index >= 0 && index < photos.length) {
        currentIndex = index;
        updateUI();
    }
}

// Navigate without making decisions (for browse modes)
function navigateNext() {
    if (currentIndex < photos.length - 1) {
        currentIndex++;
        updateUI();
    }
}

function navigatePrev() {
    if (currentIndex > 0) {
        currentIndex--;
        updateUI();
    }
}

function preloadNext() {
    for (let i = 1; i <= 3; i++) {
        if (currentIndex + i < photos.length) {
            const img = new Image();
            img.src = photos[currentIndex + i].thumbnail;
        }
    }
}

// Settings
function openSettings() {
    elements.targetInput.value = target;
    elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    elements.settingsModal.classList.add('hidden');
}

function saveSettings() {
    const val = parseInt(elements.targetInput.value, 10);
    if (val > 0 && val <= 10000) {
        target = val;
        saveState();
        updateUI();
    }
    closeSettings();
}

// Persistence
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            decisions,
            target,
            lastUpdated: new Date().toISOString()
        }));
    } catch (e) {
        console.error('Failed to save state:', e);
        alert('⚠️ Failed to save! Export your progress now to avoid losing work.');
    }
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const state = JSON.parse(saved);
            decisions = state.decisions || {};
            target = state.target || DEFAULT_TARGET;
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }
    elements.targetInput.value = target;
}

function resetAll() {
    if (!confirm('Reset all decisions?')) return;
    decisions = {};
    history = [];
    localStorage.removeItem(STORAGE_KEY);
    closeSettings();
    applyFilters();
}

// Export - saves both results AND restorable state
function exportSelected() {
    const accepted = allPhotos.filter(p => decisions[p.id] === 'accepted');
    const maybe = allPhotos.filter(p => decisions[p.id] === 'maybe');
    const rejected = allPhotos.filter(p => decisions[p.id] === 'rejected');
    
    // Human-readable results
    const lines = [
        `# Photo Review Results`,
        `# Exported: ${new Date().toISOString()}`,
        `# Target: ${target}`,
        `# Progress: ${accepted.length} accepted, ${maybe.length} maybe, ${rejected.length} rejected`,
        '',
        `## ACCEPTED (${accepted.length})`,
        ...accepted.map(p => p.name),
        '',
        `## MAYBE (${maybe.length})`,
        ...maybe.map(p => p.name),
    ];
    
    downloadFile('photo_review_results.txt', lines.join('\n'));
    
    // Full state backup (can be imported to restore progress)
    const stateBackup = {
        _format: 'photo-reviewer-state-v1',
        exported_at: new Date().toISOString(),
        target,
        decisions, // Full decisions object for restore
        summary: {
            accepted: accepted.length,
            maybe: maybe.length,
            rejected: rejected.length,
            total: allPhotos.length
        }
    };
    
    downloadFile('photo_review_state.json', JSON.stringify(stateBackup, null, 2));
    
    alert(`✅ Exported!\n\n• photo_review_results.txt - Your selections\n• photo_review_state.json - Backup (use Import to restore)`);
}

// Import state from backup file
function importState() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data._format !== 'photo-reviewer-state-v1') {
                alert('❌ Invalid backup file format');
                return;
            }
            
            const msg = `Import backup from ${data.exported_at}?\n\n` +
                `This will restore:\n` +
                `• ${data.summary.accepted} accepted\n` +
                `• ${data.summary.maybe} maybe\n` +
                `• ${data.summary.rejected} rejected\n\n` +
                `Current progress will be replaced.`;
            
            if (!confirm(msg)) return;
            
            decisions = data.decisions || {};
            target = data.target || DEFAULT_TARGET;
            saveState();
            applyFilters();
            
            alert('✅ Progress restored!');
        } catch (err) {
            alert('❌ Failed to import: ' + err.message);
        }
    };
    input.click();
}

function downloadFile(name, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
}

init();
