/**
 * ClashStream v6 - Stable Music Player
 */

// ============================================
// DOM ELEMENTS
// ============================================
const $ = id => document.getElementById(id);

const dom = {
    searchInput: $('searchInput'),
    welcomeSection: $('welcomeSection'),
    nowPlayingSection: $('nowPlayingSection'),
    loadingState: $('loadingState'),
    loadingText: $('loadingText'),
    albumArt: $('albumArt'),
    trackTitle: $('trackTitle'),
    trackArtist: $('trackArtist'),
    visualizer: $('visualizer'),
    audioPlayer: $('audioPlayer'),
    playBtn: $('playBtn'),
    playIcon: $('playIcon'),
    prevBtn: $('prevBtn'),
    nextBtn: $('nextBtn'),
    shuffleBtn: $('shuffleBtn'),
    infiniteVibeBtn: $('infiniteVibeBtn'),
    progressBar: $('progressBar'),
    progressFill: $('progressFill'),
    currentTime: $('currentTime'),
    totalTime: $('totalTime'),
    volumeSlider: $('volumeSlider'),
    playerThumb: $('playerThumb'),
    playerTitle: $('playerTitle'),
    playerArtist: $('playerArtist'),
    songList: $('songList'),
    sidebarQueue: $('sidebarQueue'),
    sidebarQueueCount: $('sidebarQueueCount'),
    historyPanel: $('historyPanel'),
    historyList: $('historyList'),
    historyBtn: $('historyBtn'),
    closeHistory: $('closeHistory'),
    addToQueueBtn: $('addToQueueBtn'),
    shareBtn: $('shareBtn'),
    toast: $('toast'),
};

// ============================================
// STATE
// ============================================
const state = {
    playing: false,
    queue: [],
    current: null,
    results: [],
    infiniteVibe: true,
    shuffle: false,
    history: JSON.parse(localStorage.getItem('cs_history') || '[]'),
    loading: false,
    retryCount: 0,
    maxRetries: 3,
};

// ============================================
// UTILITIES
// ============================================
const fmt = s => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
};

const esc = t => {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
};

const toast = (msg, type = 'info') => {
    dom.toast.textContent = msg;
    dom.toast.className = `toast show ${type}`;
    setTimeout(() => dom.toast.classList.remove('show'), 3000);
};

const loading = (show, text = 'Loading...') => {
    state.loading = show;
    dom.loadingState.classList.toggle('active', show);
    dom.loadingText.textContent = text;
};

// ============================================
// API CALLS WITH RETRY
// ============================================
async function api(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
}

// ============================================
// UI UPDATES
// ============================================
function showPlayer() {
    dom.welcomeSection.style.display = 'none';
    dom.nowPlayingSection.classList.add('active');
}

function updateUI(track) {
    if (!track) return;
    dom.trackTitle.textContent = track.title || 'Unknown';
    dom.trackArtist.textContent = track.channel || 'Unknown';
    dom.playerTitle.textContent = track.title || 'Unknown';
    dom.playerArtist.textContent = track.channel || 'Unknown';
    if (track.thumbnail) {
        dom.albumArt.src = track.thumbnail;
        dom.playerThumb.src = track.thumbnail;
    }
    if (track.duration) dom.totalTime.textContent = fmt(track.duration);
    document.title = `${track.title} - ClashStream`;
}

function updateQueue() {
    dom.sidebarQueueCount.textContent = state.queue.length;
    if (!state.queue.length) {
        dom.sidebarQueue.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted);padding:12px;text-align:center">Queue empty</p>';
        return;
    }
    dom.sidebarQueue.innerHTML = state.queue.map((t, i) => `
        <div class="mini-queue-item" data-i="${i}">
            <img class="mini-queue-thumb" src="${t.thumbnail || ''}" alt="">
            <div class="mini-queue-info">
                <div class="mini-queue-title">${esc(t.title)}</div>
                <div class="mini-queue-artist">${esc(t.channel)}</div>
            </div>
        </div>
    `).join('');
    dom.sidebarQueue.querySelectorAll('.mini-queue-item').forEach(el => {
        el.onclick = () => playFromQueue(+el.dataset.i);
    });
}

function updateResults() {
    if (!state.results.length) {
        dom.songList.innerHTML = '';
        return;
    }
    dom.songList.innerHTML = state.results.map((t, i) => `
        <div class="song-item ${state.current?.id === t.id ? 'playing' : ''}" data-id="${t.id}">
            <img class="song-thumb" src="${t.thumbnail || ''}" alt="" loading="lazy">
            <div class="song-info">
                <div class="song-title">${esc(t.title)}</div>
                <div class="song-artist">${esc(t.channel)}</div>
            </div>
            <span class="song-duration">${fmt(t.duration)}</span>
            <button class="add-btn" data-i="${i}" title="Add to Queue">
                <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
        </div>
    `).join('');

    dom.songList.querySelectorAll('.song-item').forEach(el => {
        el.onclick = e => {
            if (!e.target.closest('.add-btn')) playById(el.dataset.id);
        };
    });
    dom.songList.querySelectorAll('.add-btn').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const t = state.results[+btn.dataset.i];
            if (t && !state.queue.find(q => q.id === t.id)) {
                state.queue.push(t);
                updateQueue();
                toast('Added to queue', 'success');
            }
        };
    });
}

function updateHistory() {
    if (!state.history.length) {
        dom.historyList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No history</p>';
        return;
    }
    dom.historyList.innerHTML = state.history.slice(0, 20).map(t => `
        <div class="history-item" data-id="${t.id}">
            <img class="history-thumb" src="${t.thumbnail || ''}" alt="">
            <div class="history-info">
                <div class="history-title">${esc(t.title)}</div>
                <div class="history-artist">${esc(t.channel)}</div>
            </div>
        </div>
    `).join('');
    dom.historyList.querySelectorAll('.history-item').forEach(el => {
        el.onclick = () => playById(el.dataset.id);
    });
}

function updatePlayBtn() {
    dom.playIcon.innerHTML = state.playing
        ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
}

// ============================================
// VISUALIZER
// ============================================
let visId = null;

function initVis() {
    dom.visualizer.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        bar.style.height = '4px';
        dom.visualizer.appendChild(bar);
    }
}

function animVis() {
    if (!state.playing) {
        stopVis();
        return;
    }
    dom.visualizer.querySelectorAll('.visualizer-bar').forEach(bar => {
        bar.style.height = `${Math.random() * 40 + 4}px`;
    });
    visId = requestAnimationFrame(() => setTimeout(animVis, 100));
}

function stopVis() {
    if (visId) cancelAnimationFrame(visId);
    visId = null;
    dom.visualizer.querySelectorAll('.visualizer-bar').forEach(b => b.style.height = '4px');
}

// ============================================
// PLAYBACK - ROBUST VERSION
// ============================================
async function playById(id, forceRefresh = false) {
    if (state.loading) return;
    loading(true, 'Loading track...');

    const maxAttempts = 3;
    let attempt = 0;

    async function tryPlay() {
        attempt++;
        try {
            const data = await api(`/play/${id}${forceRefresh ? '?refresh=' + Date.now() : ''}`);
            state.current = data;
            updateUI(data);

            // Add cache-busting to prevent stale URLs
            const audioUrl = data.audioUrl + (data.audioUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

            // Set source
            dom.audioPlayer.src = audioUrl;
            showPlayer();

            // Try to play with retry on fail
            try {
                await dom.audioPlayer.play();
                loading(false);
                state.playing = true;
                state.retryCount = 0;
                updatePlayBtn();
                updateResults();
                updateQueue();
                addHistory(data);
                animVis();
            } catch (playError) {
                console.error(`Play attempt ${attempt} failed:`, playError);
                if (attempt < maxAttempts) {
                    loading(true, `Retrying... (${attempt}/${maxAttempts})`);
                    // Clear cache and try again
                    await new Promise(r => setTimeout(r, 500));
                    return tryPlay();
                }
                throw playError;
            }

        } catch (e) {
            console.error('Play error:', e);
            loading(false);

            if (attempt < maxAttempts) {
                loading(true, `Retrying... (${attempt}/${maxAttempts})`);
                await new Promise(r => setTimeout(r, 500));
                return tryPlay();
            }

            toast(`Failed to play: ${e.message}`, 'error');

            // Auto-skip to next on error
            if (state.retryCount < state.maxRetries) {
                state.retryCount++;
                setTimeout(playNext, 1000);
            }
        }
    }

    await tryPlay();
}

async function playFromQueue(idx) {
    if (idx >= 0 && idx < state.queue.length) {
        const track = state.queue.splice(idx, 1)[0];
        updateQueue();
        await playById(track.id);
    }
}

async function playNext() {
    if (state.queue.length) {
        const idx = state.shuffle ? Math.floor(Math.random() * state.queue.length) : 0;
        await playFromQueue(idx);
    } else if (state.infiniteVibe && state.results.length) {
        // Play random from results (excluding current)
        const available = state.results.filter(t => t.id !== state.current?.id);
        if (available.length) {
            const random = available[Math.floor(Math.random() * available.length)];
            await playById(random.id);
        }
    } else if (state.infiniteVibe && state.current) {
        // Fetch related
        await fetchRelated(state.current.id);
    }
}

async function search(query) {
    if (!query.trim() || state.loading) return;
    loading(true, 'Searching...');

    try {
        const data = await api(`/search?query=${encodeURIComponent(query)}`);
        state.current = data;
        updateUI(data);

        dom.audioPlayer.src = data.audioUrl;
        showPlayer();
        loading(false);

        await dom.audioPlayer.play();
        state.playing = true;
        updatePlayBtn();
        addHistory(data);
        animVis();

        // Load more results in background
        fetchMore(query);

    } catch (e) {
        console.error('Search error:', e);
        loading(false);
        toast(`Search failed: ${e.message}`, 'error');
    }
}

async function fetchMore(query) {
    try {
        const data = await api(`/search-list?query=${encodeURIComponent(query)}&count=15`);
        if (data.tracks) {
            state.results = data.tracks;
            updateResults();
        }
    } catch (e) {
        console.error('Fetch more error:', e);
    }
}

async function fetchRelated(id) {
    try {
        loading(true, 'Finding similar...');

        // Step 1: Quick fetch (just 1 track to play immediately)
        const quickData = await api(`/related/${id}?count=1`);

        if (quickData.tracks?.length) {
            const nextTrack = quickData.tracks[0];

            // Play immediately without waiting for more
            await playById(nextTrack.id);

            // Step 2: Background fetch to fill the list
            fetchMoreRelated(id, nextTrack.id);
        } else {
            loading(false);
            toast('No similar tracks found', 'warning');
        }
    } catch (e) {
        loading(false);
        console.error('Related error:', e);
    }
}

async function fetchMoreRelated(id, skipId) {
    try {
        const data = await api(`/related/${id}?count=15`);
        if (data.tracks?.length) {
            // Filter out the one we are already playing
            const filtered = data.tracks.filter(t => t.id !== skipId);
            state.results = [state.results.find(r => r.id === skipId), ...filtered].filter(Boolean);
            updateResults();
        }
    } catch (e) {
        console.error('Background fetch error:', e);
    }
}

async function fetchTrending() {
    if (state.loading) return;
    loading(true, 'Loading trending...');

    try {
        const data = await api('/trending?count=15');
        if (data.tracks?.length) {
            state.results = data.tracks;
            loading(false);
            showPlayer();
            updateResults();
            await playById(data.tracks[0].id);
        } else {
            loading(false);
            toast('No trending found', 'error');
        }
    } catch (e) {
        loading(false);
        toast('Failed to load trending', 'error');
    }
}

function toggle() {
    if (!state.current) return;
    if (state.playing) {
        dom.audioPlayer.pause();
    } else {
        dom.audioPlayer.play();
        animVis();
    }
    state.playing = !state.playing;
    updatePlayBtn();
}

function addHistory(track) {
    if (!track?.id) return;
    state.history = state.history.filter(t => t.id !== track.id);
    state.history.unshift({
        id: track.id,
        title: track.title,
        thumbnail: track.thumbnail,
        channel: track.channel,
        duration: track.duration
    });
    if (state.history.length > 30) state.history.pop();
    localStorage.setItem('cs_history', JSON.stringify(state.history));
    updateHistory();
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEvents() {
    // Search
    dom.searchInput.onkeypress = e => {
        if (e.key === 'Enter') search(dom.searchInput.value);
    };

    // Player controls
    dom.playBtn.onclick = toggle;
    dom.nextBtn.onclick = playNext;
    dom.prevBtn.onclick = () => {
        if (dom.audioPlayer.currentTime > 3) {
            dom.audioPlayer.currentTime = 0;
        } else if (state.history.length > 1) {
            playById(state.history[1].id);
        }
    };

    dom.shuffleBtn.onclick = () => {
        state.shuffle = !state.shuffle;
        dom.shuffleBtn.classList.toggle('active', state.shuffle);
        toast(state.shuffle ? 'Shuffle on' : 'Shuffle off');
    };

    dom.infiniteVibeBtn.onclick = () => {
        state.infiniteVibe = !state.infiniteVibe;
        dom.infiniteVibeBtn.classList.toggle('active', state.infiniteVibe);
        toast(state.infiniteVibe ? 'Infinite Vibe on' : 'Infinite Vibe off');
    };

    // Progress bar
    dom.progressBar.onclick = e => {
        const rect = dom.progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        dom.audioPlayer.currentTime = pct * dom.audioPlayer.duration;
    };

    // Volume
    dom.volumeSlider.oninput = e => {
        dom.audioPlayer.volume = e.target.value / 100;
    };

    // History panel
    dom.historyBtn.onclick = () => dom.historyPanel.classList.add('open');
    dom.closeHistory.onclick = () => dom.historyPanel.classList.remove('open');
    $('navHistory')?.addEventListener('click', () => dom.historyPanel.classList.toggle('open'));

    // Trending
    $('navTrending')?.addEventListener('click', fetchTrending);

    // Discover cards
    document.querySelectorAll('.discover-card').forEach(card => {
        card.onclick = () => {
            dom.searchInput.value = card.dataset.query;
            search(card.dataset.query);
        };
    });

    // Add to queue
    dom.addToQueueBtn.onclick = () => {
        if (state.current && !state.queue.find(q => q.id === state.current.id)) {
            state.queue.push(state.current);
            updateQueue();
            toast('Added to queue', 'success');
        }
    };

    // Share
    dom.shareBtn?.addEventListener('click', () => {
        if (state.current) {
            navigator.clipboard.writeText(`https://youtube.com/watch?v=${state.current.id}`)
                .then(() => toast('Link copied!', 'success'))
                .catch(() => toast('Copy failed', 'error'));
        }
    });

    // Audio events
    dom.audioPlayer.ontimeupdate = () => {
        const pct = (dom.audioPlayer.currentTime / dom.audioPlayer.duration) * 100 || 0;
        dom.progressFill.style.width = `${pct}%`;
        dom.currentTime.textContent = fmt(dom.audioPlayer.currentTime);
    };

    dom.audioPlayer.onloadedmetadata = () => {
        dom.totalTime.textContent = fmt(dom.audioPlayer.duration);
    };

    dom.audioPlayer.onended = () => {
        state.playing = false;
        updatePlayBtn();
        stopVis();
        playNext();
    };

    dom.audioPlayer.onplay = () => {
        state.playing = true;
        updatePlayBtn();
        animVis();
    };

    dom.audioPlayer.onpause = () => {
        state.playing = false;
        updatePlayBtn();
        stopVis();
    };

    dom.audioPlayer.onerror = () => {
        console.error('Audio error');
        toast('Playback error, skipping...', 'error');
        state.retryCount++;
        if (state.retryCount < state.maxRetries) {
            setTimeout(playNext, 1500);
        }
    };

    // Keyboard shortcuts
    document.onkeydown = e => {
        if (e.target.tagName === 'INPUT') return;
        switch (e.code) {
            case 'Space': e.preventDefault(); toggle(); break;
            case 'ArrowRight': e.preventDefault(); dom.audioPlayer.currentTime += 10; break;
            case 'ArrowLeft': e.preventDefault(); dom.audioPlayer.currentTime -= 10; break;
            case 'ArrowUp': e.preventDefault(); dom.audioPlayer.volume = Math.min(1, dom.audioPlayer.volume + 0.1); dom.volumeSlider.value = dom.audioPlayer.volume * 100; break;
            case 'ArrowDown': e.preventDefault(); dom.audioPlayer.volume = Math.max(0, dom.audioPlayer.volume - 0.1); dom.volumeSlider.value = dom.audioPlayer.volume * 100; break;
            case 'KeyN': playNext(); break;
            case 'KeyF': dom.searchInput.focus(); break;
            case 'KeyM': dom.audioPlayer.muted = !dom.audioPlayer.muted; toast(dom.audioPlayer.muted ? 'Muted' : 'Unmuted'); break;
            case 'Escape': dom.historyPanel.classList.remove('open'); break;
        }
    };

    // Close history when clicking outside
    document.onclick = e => {
        if (!dom.historyPanel.contains(e.target) && !dom.historyBtn.contains(e.target) && !$('navHistory')?.contains(e.target)) {
            dom.historyPanel.classList.remove('open');
        }
    };
}

// ============================================
// INIT
// ============================================
function init() {
    dom.audioPlayer.volume = 0.8;
    initVis();
    updateHistory();
    updateQueue();
    initEvents();
    console.log('🎵 ClashStream v6 ready');
}

init();
