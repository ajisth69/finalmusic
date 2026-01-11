const express = require('express');
const path = require('path');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

// ============================================
// GLOBAL ERROR HANDLERS (PREVENT CRASH)
// ============================================
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
    // Keep the process alive, but log the error critically
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
    // Keep the process alive
});

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// FRESH YOUTUBE COOKIES
// ============================================
const COOKIES_CONTENT = `# Netscape HTTP Cookie File
#HttpOnly_.youtube.com	TRUE	/	TRUE	1802699414	__Secure-3PSID	g.a0005gibKLu5dKPHgyVsrCj6cljLjj_D_uCPOx2ii52WEVgRkcOjZSTtg1aBI9juQhg_W6S0jwACgYKAUoSARYSFQHGX2MikaiG1jy29CXVI00y9xid3RoVAUF8yKpV8gWPXKl0oY9cKrcTMamv0076
#HttpOnly_.youtube.com	TRUE	/	TRUE	1768141194	GPS	1
#HttpOnly_.youtube.com	TRUE	/	TRUE	1799675414	__Secure-1PSIDTS	sidts-CjQB7I_69JwkZrIpUTC3EzFMh3G5XmWl3-iBcWXt8EK8q1T2twfz6M53Fq4npB9RsHg2op9DEAA
.youtube.com	TRUE	/	TRUE	1802699414	SAPISID	xyQoMZzPZ6Vpyj_e/AfQ10bkgQjOel7c_6
#HttpOnly_.youtube.com	TRUE	/	TRUE	1799675457	__Secure-1PSIDCC	AKEyXzVqf2u7qUtIszR_uMSJ-XgaZMdmxxHkhXhJk9lFns3Xtx8JR7mh9QDYnib52SITBrIutA
#HttpOnly_.youtube.com	TRUE	/	TRUE	1802699414	SSID	AwkPLXodZjzqrbWp8
.youtube.com	TRUE	/	TRUE	1802699414	__Secure-1PAPISID	xyQoMZzPZ6Vpyj_e/AfQ10bkgQjOel7c_6
#HttpOnly_.youtube.com	TRUE	/	TRUE	1802699414	__Secure-1PSID	g.a0005gibKLu5dKPHgyVsrCj6cljLjj_D_uCPOx2ii52WEVgRkcOj7LCX6qIVNshlP9vRraVHXwACgYKAdISARYSFQHGX2MiaSSr1zR93VTbjeyLxbVo9RoVAUF8yKpsfcxhlt2oKTfPjZ0rGELT0076
.youtube.com	TRUE	/	TRUE	1802699414	__Secure-3PAPISID	xyQoMZzPZ6Vpyj_e/AfQ10bkgQjOel7c_6
#HttpOnly_.youtube.com	TRUE	/	TRUE	1799675457	__Secure-3PSIDCC	AKEyXzV59NEfH90MahvFrDPOJuiIQM77S1rQoyTajuqppSVbGdrtdlbqdYuWqEM50AntfT4g
#HttpOnly_.youtube.com	TRUE	/	TRUE	1799675414	__Secure-3PSIDTS	sidts-CjQB7I_69JwkZrIpUTC3EzFMh3G5XmWl3-iBcWXt8EK8q1T2twfz6M53Fq4npB9RsHg2op9DEAA
#HttpOnly_.youtube.com	TRUE	/	TRUE	1802699415	LOGIN_INFO	AFmmF2swRgIhAMIiNsKNWDwtihL-xgxUnJrAaqKzUGazkLHbwklacr5VAiEAlkvJ0Wd1C7T0r6saNBIH_Cvzqf_mlvbKNJdwv8vpz_c:QUQ3MjNmd1hlNFNDOVpJUUtfRVp2b1ZfSU1YU05PYk5WZWROV1JtWjllUWtUUThSNzBTOUJJeVlWUjNzNjdJOHZseGJacmgtTGllZmU0NERMS0E5TjBaR21JT19fd2RKYzZtenVGTzBraDhsTkhEdWc0Q3cyQnB1YXByY2ExQ0tESE5yWWFMeDFPRUZuTlhrdV9zc0o3ZHlpRHBJa3VBazBn
.youtube.com	TRUE	/	TRUE	1802699418	PREF	f4=4000000&tz=Asia.Calcutta`;

const COOKIES_PATH = path.join(os.tmpdir(), 'clashstream_yt_cookies.txt');
fs.writeFileSync(COOKIES_PATH, COOKIES_CONTENT);
console.log('🍪 Cookies ready');

// ============================================
// PERSISTENT HTTP AGENTS (Keep-Alive)
// ============================================
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
});

const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============================================
// CACHES WITH SMART MANAGEMENT
// ============================================
const audioCache = new Map();
const searchCache = new Map();
const failedVideos = new Set(); // Track videos that consistently fail
const CACHE_TTL = 30 * 60 * 1000; // 30 min (shorter for freshness)
const SEARCH_TTL = 5 * 60 * 1000;

// Cleanup every minute
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of audioCache) {
        if (now - v.ts > CACHE_TTL) audioCache.delete(k);
    }
    for (const [k, v] of searchCache) {
        if (now - v.ts > SEARCH_TTL) searchCache.delete(k);
    }
    // Clear failed videos periodically
    if (failedVideos.size > 100) failedVideos.clear();
}, 60000);

// ============================================
// YT-DLP EXTRACTION - AGGRESSIVE MODE
// ============================================
async function extractAudio(videoId) {
    const cached = audioCache.get(videoId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached;
    }

    console.log(`⬇️ Extracting: ${videoId}`);

    // Strategy 1: Try multiple player clients with format selection
    const playerClients = ['android', 'ios', 'web', 'tv_embedded'];

    for (const client of playerClients) {
        try {
            const opts = {
                cookies: COOKIES_PATH,
                dumpSingleJson: true,
                noPlaylist: true,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                extractorArgs: `youtube:player_client=${client}`,
                geoBypass: true,
            };

            const info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, opts);

            if (!info || !info.formats || info.formats.length === 0) {
                console.log(`⚠️ No formats with ${client}, trying next...`);
                continue;
            }

            // Be VERY lenient - accept any format with a URL and some form of audio
            let formats = info.formats.filter(f => f.url && !f.url.includes('.m3u8'));

            // Try to find one with audio
            let audio = formats.find(f => f.acodec && f.acodec !== 'none' && f.vcodec === 'none' && f.ext === 'm4a')
                || formats.find(f => f.acodec && f.acodec !== 'none' && f.vcodec === 'none')
                || formats.find(f => f.format_id === '140') // m4a audio
                || formats.find(f => f.format_id === '251') // webm audio
                || formats.find(f => f.format_id === '250')
                || formats.find(f => f.format_id === '249')
                || formats.find(f => f.format_id === '18')  // 360p mp4
                || formats.find(f => f.format_id === '22')  // 720p mp4
                || formats.find(f => f.acodec && f.acodec !== 'none') // any with audio
                || formats[formats.length - 1]; // last resort: any format

            if (!audio || !audio.url) {
                console.log(`⚠️ No playable format with ${client}, trying next...`);
                continue;
            }

            const result = {
                id: info.id,
                title: info.title || 'Unknown',
                thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                audioUrl: audio.url,
                contentType: audio.ext === 'm4a' ? 'audio/mp4' : (audio.ext === 'webm' ? 'audio/webm' : 'video/mp4'),
                duration: info.duration || 0,
                channel: info.uploader || info.channel || 'Unknown',
                ts: Date.now()
            };

            audioCache.set(videoId, result);
            console.log(`✅ Ready (${client}): ${result.title.substring(0, 40)}...`);
            return result;

        } catch (err) {
            console.error(`❌ ${client} failed: ${err.message.substring(0, 80)}`);
        }
    }

    // Strategy 2: Use getUrl mode (simpler, sometimes more reliable)
    try {
        console.log(`🔄 Trying getUrl mode for ${videoId}...`);
        const directUrl = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
            cookies: COOKIES_PATH,
            getUrl: true,
            format: 'bestaudio/best',
            noPlaylist: true,
            noCheckCertificates: true,
            geoBypass: true,
        });

        if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
            const result = {
                id: videoId,
                title: 'Loading...',
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                audioUrl: directUrl,
                contentType: 'audio/mp4',
                duration: 0,
                channel: 'Unknown',
                ts: Date.now()
            };
            audioCache.set(videoId, result);
            console.log(`✅ Ready (getUrl): ${videoId}`);
            return result;
        }
    } catch (e) {
        console.error(`❌ getUrl failed: ${e.message.substring(0, 50)}`);
    }

    // All strategies failed
    console.error(`❌❌ All extraction methods failed for ${videoId}`);
    throw new Error('No supported format found');
}

// ============================================
// SEARCH - STABLE VERSION
// ============================================
async function searchYT(query, count = 10) {
    const key = `${query}_${count}`;
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.ts < SEARCH_TTL) {
        return cached.data;
    }

    console.log(`🔎 Searching: "${query}"`);

    const result = await youtubedl(`ytsearch${count}:${query}`, {
        cookies: COOKIES_PATH,
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        quiet: true,
    });

    const entries = (result.entries || []).filter(e =>
        e?.id?.length === 11 &&
        !e.id.startsWith('UC') &&
        !failedVideos.has(e.id)
    );

    searchCache.set(key, { data: entries, ts: Date.now() });
    console.log(`📋 Found: ${entries.length} tracks`);
    return entries;
}

// ============================================
// STREAM PROXY - FOLLOWS REDIRECTS
// ============================================
app.get('/stream/:videoId', async (req, res) => {
    const { videoId } = req.params;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    let extractionRetries = 0;
    const maxExtractionRetries = 2;

    async function tryStream() {
        try {
            // Force fresh extraction if this is a retry
            if (extractionRetries > 0) {
                audioCache.delete(videoId);
            }

            const data = await extractAudio(videoId);

            if (!data.audioUrl) {
                return res.status(500).json({ error: 'No audio URL available' });
            }

            // Follow redirects manually
            async function fetchWithRedirects(audioUrl, maxRedirects = 5) {
                let currentUrl = audioUrl;
                let redirectCount = 0;

                while (redirectCount < maxRedirects) {
                    const url = new URL(currentUrl);
                    const proto = url.protocol === 'https:' ? https : http;
                    const agent = url.protocol === 'https:' ? httpsAgent : httpAgent;

                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.youtube.com/',
                        'Origin': 'https://www.youtube.com',
                        'Accept': '*/*',
                        'Accept-Encoding': 'identity',
                        'Connection': 'keep-alive',
                    };

                    if (req.headers.range) {
                        headers['Range'] = req.headers.range;
                    }

                    return new Promise((resolve, reject) => {
                        const proxyReq = proto.request(currentUrl, {
                            agent,
                            headers,
                            timeout: 20000,
                            method: 'GET'
                        }, (proxyRes) => {
                            // Handle redirects
                            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
                                const location = proxyRes.headers.location;
                                if (location) {
                                    console.log(`↩️ Redirect ${redirectCount + 1}: ${proxyRes.statusCode}`);
                                    currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
                                    redirectCount++;
                                    proxyReq.destroy();
                                    // Continue the loop
                                    resolve(fetchWithRedirects(currentUrl, maxRedirects - 1));
                                    return;
                                }
                            }

                            // Check for errors
                            if (proxyRes.statusCode >= 400) {
                                console.error(`❌ YouTube returned ${proxyRes.statusCode}`);
                                reject(new Error(`HTTP ${proxyRes.statusCode}`));
                                return;
                            }

                            // Success - stream the response
                            res.status(proxyRes.statusCode);

                            const contentType = proxyRes.headers['content-type'] || data.contentType || 'audio/mp4';
                            res.setHeader('Content-Type', contentType);

                            if (proxyRes.headers['content-length']) {
                                res.setHeader('Content-Length', proxyRes.headers['content-length']);
                            }
                            if (proxyRes.headers['content-range']) {
                                res.setHeader('Content-Range', proxyRes.headers['content-range']);
                            }
                            res.setHeader('Accept-Ranges', 'bytes');
                            res.setHeader('Cache-Control', 'no-cache');

                            console.log(`🎵 Streaming ${videoId} (${contentType})`);

                            proxyRes.pipe(res);

                            proxyRes.on('error', (e) => {
                                console.error('ProxyRes error:', e.message);
                            });

                            proxyRes.on('end', () => {
                                resolve();
                            });
                        });

                        proxyReq.on('error', (err) => {
                            console.error(`Proxy error: ${err.message}`);
                            reject(err);
                        });

                        proxyReq.on('timeout', () => {
                            proxyReq.destroy();
                            reject(new Error('Timeout'));
                        });

                        req.on('close', () => {
                            proxyReq.destroy();
                        });

                        proxyReq.end();
                    });
                }

                throw new Error('Too many redirects');
            }

            await fetchWithRedirects(data.audioUrl);

        } catch (err) {
            console.error('Stream error:', err.message);

            // Retry with fresh extraction
            if (extractionRetries < maxExtractionRetries && !res.headersSent) {
                extractionRetries++;
                console.log(`🔄 Retry extraction ${extractionRetries}/${maxExtractionRetries} for ${videoId}`);
                audioCache.delete(videoId);
                return tryStream();
            }

            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        }
    }

    await tryStream();
});

// ============================================
// API ENDPOINTS
// ============================================

// Search and auto-play first result
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        const results = await searchYT(query, 12);
        if (!results.length) {
            return res.status(404).json({ error: 'No results' });
        }

        // Try up to 5 results to find one that works
        for (let i = 0; i < Math.min(5, results.length); i++) {
            try {
                const data = await extractAudio(results[i].id);
                return res.json({ ...data, audioUrl: `/stream/${data.id}` });
            } catch (e) {
                console.log(`Skip ${results[i].id}`);
            }
        }

        res.status(500).json({ error: 'No playable results' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get search results list
app.get('/search-list', async (req, res) => {
    const { query, count = 12 } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        const results = await searchYT(query, parseInt(count));
        res.json({
            tracks: results.map(e => ({
                id: e.id,
                title: e.title || 'Unknown',
                thumbnail: e.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
                duration: e.duration || 0,
                channel: e.uploader || e.channel || 'Unknown'
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Play specific video
app.get('/play/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!videoId || videoId.length !== 11) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const data = await extractAudio(videoId);
        res.json({ ...data, audioUrl: `/stream/${videoId}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Trending
app.get('/trending', async (req, res) => {
    try {
        const queries = ['top songs 2024', 'bollywood hits', 'english pop hits', 'anime openings'];
        const q = queries[Math.floor(Math.random() * queries.length)];
        const results = await searchYT(q, 15);
        res.json({
            tracks: results.map(e => ({
                id: e.id,
                title: e.title || 'Unknown',
                thumbnail: e.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
                duration: e.duration || 0,
                channel: e.uploader || 'Unknown'
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Related tracks
app.get('/related/:videoId', async (req, res) => {
    try {
        const c = audioCache.get(req.params.videoId);
        const q = c ? c.title : 'popular music';
        const count = req.query.count ? parseInt(req.query.count) : 10;
        const results = await searchYT(q, count);
        res.json({
            tracks: results.filter(e => e.id !== req.params.videoId).slice(0, 8).map(e => ({
                id: e.id,
                title: e.title || 'Unknown',
                thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
                duration: e.duration || 0,
                channel: e.uploader || 'Unknown'
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        cached: audioCache.size,
        failed: failedVideos.size
    });
});

// Clear cache
app.post('/api/clear-cache', (req, res) => {
    audioCache.clear();
    searchCache.clear();
    failedVideos.clear();
    res.json({ ok: true });
});

// ============================================
// START
// ============================================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║  🎵 ClashStream v6 - STABLE EDITION              ║
║  📍 http://localhost:${PORT}                       ║
║  ⚡ Keep-alive connections                        ║
║  🔄 Auto-retry with fallback                     ║
║  🍪 Fresh cookies enabled                        ║
╚══════════════════════════════════════════════════╝
    `);
});
