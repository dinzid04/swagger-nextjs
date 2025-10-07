import axios from 'axios';
import * as cheerio from 'cheerio';

class NontonAnimeID {
    constructor() {
        this.baseUrl = 'https://nontonanimeid.boats/';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache'
        };
    }

    async home() {
        try {
            console.log('Fetching home page...');
            const { data } = await axios.get(this.baseUrl, { 
                headers: this.headers,
                timeout: 10000 
            });
            const $ = cheerio.load(data);
            let result = [];
            
            $('article.animeseries').each((i, el) => {
                try {
                    const title = $(el).find('h3.title').text().trim();
                    const img = $(el).find('img').attr('src');
                    const eps = $(el).find('.episodes').text().trim();
                    const status = $(el).find('.status').text().trim();
                    
                    if (title && img) {
                        result.push({
                            title,
                            img: img.startsWith('http') ? img : this.baseUrl + img,
                            eps: eps || 'Unknown',
                            status: status || 'Unknown',
                        });
                    }
                } catch (e) {
                    console.log('Error parsing anime item:', e.message);
                }
            });
            
            return result.length > 0 ? result : { error: 'No anime found on home page' };
        } catch (error) {
            console.error('Home page error:', error.message);
            return { error: `Failed to fetch home page: ${error.message}` };
        }
    }

    async search(q) {
        if (!q) return { error: 'Query is required' };
        
        try {
            console.log(`Searching for: ${q}`);
            const searchUrl = `${this.baseUrl}?s=${encodeURIComponent(q)}`;
            const { data } = await axios.get(searchUrl, { 
                headers: this.headers,
                timeout: 10000 
            });
            
            const $ = cheerio.load(data);
            let result = [];
            
            $('.as-anime-grid a').each((i, el) => {
                try {
                    const title = $(el).find('.as-anime-title').text().trim();
                    const img = $(el).find('img').attr('src');
                    const rating = $(el).find('.as-rating').text().trim();
                    const type = $(el).find('.as-type').text().trim();
                    const season = $(el).find('.as-season').text().trim();
                    const sypnosis = $(el).find('.as-synopsis').text().trim();
                    const url = $(el).attr('href');
                    
                    if (title && url) {
                        const anime = {
                            title,
                            img: img ? (img.startsWith('http') ? img : this.baseUrl + img) : null,
                            rating: rating || 'N/A',
                            type: type || 'Unknown',
                            season: season || 'Unknown',
                            sypnosis: sypnosis || 'No synopsis available',
                            genre: [],
                            url
                        };
                        
                        $(el).find('.as-genres span').each((j, el2) => {
                            const genre = $(el2).text().trim();
                            if (genre) anime.genre.push(genre);
                        });
                        
                        result.push(anime);
                    }
                } catch (e) {
                    console.log('Error parsing search result:', e.message);
                }
            });
            
            return result.length > 0 ? result : { error: `No results found for "${q}"` };
        } catch (error) {
            console.error('Search error:', error.message);
            return { error: `Search failed: ${error.message}` };
        }
    }

    async detail(url) {
        if (!url) return { error: 'URL is required' };
        
        try {
            console.log(`Fetching detail for: ${url}`);
            const { data } = await axios.get(url, { 
                headers: this.headers,
                timeout: 10000 
            });
            
            const $ = cheerio.load(data);
            let result = {
                title: $('.anime-card__sidebar img').attr('alt') || $('h1').text().trim(),
                img: $('.anime-card__sidebar img').attr('src'),
                synopsis: $('.synopsis-prose').text().trim() || 'No synopsis available',
                detail: {},
                genre: [],
                episodes: []
            };
            
            // Parse details
            $('.details-list li').each((i, el) => {
                try {
                    const label = $(el).find('.detail-label').text().replace(':', '').trim();
                    $(el).find('.detail-label').remove();
                    const value = $(el).text().trim();
                    
                    if (label && value) {
                        const key = label.toLowerCase().replace(/\s/g, '_');
                        result.detail[key] = value;
                    }
                } catch (e) {
                    console.log('Error parsing detail item:', e.message);
                }
            });
            
            // Parse genres
            $('.anime-card__genres a').each((i, el) => {
                const genre = $(el).text().trim();
                if (genre) result.genre.push(genre);
            });
            
            // Parse episodes
            $('.episode-list-items a').each((i, el) => {
                try {
                    const eps = $(el).find('.ep-title').text().trim();
                    const date = $(el).find('.ep-date').text().trim();
                    const episodeUrl = $(el).attr('href');
                    
                    if (eps && episodeUrl) {
                        result.episodes.push({
                            eps,
                            date: date || 'Unknown',
                            url: episodeUrl
                        });
                    }
                } catch (e) {
                    console.log('Error parsing episode:', e.message);
                }
            });
            
            return result;
        } catch (error) {
            console.error('Detail error:', error.message);
            return { error: `Failed to fetch detail: ${error.message}` };
        }
    }

    async download(url) {
        if (!url) return { error: 'URL is required' };
        
        try {
            console.log(`Fetching download links for: ${url}`);
            const { data: page } = await axios.get(url, { 
                headers: this.headers,
                timeout: 10000 
            });
            
            const $ = cheerio.load(page);
            let lokal = null;
            let alternative = [];
            
            // Find download links
            $('.listlink a').each((i, el) => {
                const server = $(el).text().trim();
                const serverUrl = $(el).attr('href');
                
                if (server && serverUrl) {
                    if (server.toLowerCase().includes('lokal')) {
                        lokal = serverUrl;
                    } else {
                        alternative.push({
                            server,
                            url: serverUrl
                        });
                    }
                }
            });
            
            const result = {
                title: $('h1.entry-title').text().trim() || 'Unknown',
                date: $('.bottomtitle time').text().trim() || 'Unknown',
                alternative
            };
            
            // Try to get download links if lokal server found
            if (lokal) {
                try {
                    result.download = await this.initDownload(lokal);
                } catch (downloadError) {
                    result.download = { error: `Download failed: ${downloadError.message}` };
                }
            } else {
                result.download = 'No lokal server found';
            }
            
            return result;
        } catch (error) {
            console.error('Download error:', error.message);
            return { error: `Failed to fetch download links: ${error.message}` };
        }
    }

    async initDownload(url) {
        try {
            console.log('Initializing download...');
            
            // Get token first
            const { data: token } = await axios.post(
                'https://s2.kotakanimeid.link/video/get-token.php',
                { url },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': this.baseUrl,
                        'Referer': url,
                        'User-Agent': this.headers['User-Agent']
                    },
                    timeout: 10000
                }
            );
            
            // Get the download page
            const { data: html } = await axios.get(url, { 
                headers: this.headers,
                timeout: 10000 
            });
            
            const $ = cheerio.load(html);
            const scriptContent = $('script').html() || '';
            
            // Extract encrypted parameters
            const encryptedMatch = scriptContent.match(/const ENCRYPTED_PARAM = "(.*)";/);
            const titleMatch = scriptContent.match(/const TITLE_PARAM = "(.*)";/);
            
            if (!encryptedMatch) {
                throw new Error('Could not find encrypted parameters');
            }
            
            const encryptedParam = encryptedMatch[1];
            const titleParam = titleMatch ? titleMatch[1] : '';
            
            // Build request URL
            const requestUrl = new URL('/video/get-download.php', 'https://s2.kotakanimeid.link');
            requestUrl.searchParams.set('mode', 'lokal');
            requestUrl.searchParams.set('vid', encodeURIComponent(encryptedParam));
            if (titleParam) requestUrl.searchParams.set('title', encodeURIComponent(titleParam));
            requestUrl.searchParams.set('dl', 'yes');
            requestUrl.searchParams.set('json', 'true');
            
            // Get download links
            const { data } = await axios.post(
                requestUrl.toString(),
                {
                    challenge: token.challenge,
                    url: requestUrl.toString(),
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': this.baseUrl,
                        'Referer': url,
                        'X-Challenge': token.challenge,
                        'X-Security-Token': token.token,
                        'X-Timestamp': token.timestamp,
                        'User-Agent': this.headers['User-Agent']
                    },
                    timeout: 15000
                }
            );
            
            const result = [];
            
            // Parse download links
            if (data.links && typeof data.links === 'object') {
                for (const [quality, items] of Object.entries(data.links)) {
                    if (Array.isArray(items) && items.length > 0 && items[0].url) {
                        result.push({
                            quality: quality || 'Unknown',
                            url: 'https://s2.kotakanimeid.link' + items[0].url
                        });
                    }
                }
            }
            
            return result.length > 0 ? result : { error: 'No download links found' };
        } catch (error) {
            console.error('Download init error:', error.message);
            throw new Error(`Download initialization failed: ${error.message}`);
        }
    }
}

// Handler API
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { action, query, url } = req.query;
        
        if (!action) {
            return res.status(400).json({
                status: false,
                message: 'Action parameter is required. Available actions: home, search, detail, download'
            });
        }

        const scraper = new NontonAnimeID();
        let result;

        switch (action) {
            case 'home':
                result = await scraper.home();
                break;

            case 'search':
                if (!query) {
                    return res.status(400).json({
                        status: false,
                        message: 'Query parameter is required for search action'
                    });
                }
                result = await scraper.search(query);
                break;

            case 'detail':
                if (!url) {
                    return res.status(400).json({
                        status: false,
                        message: 'URL parameter is required for detail action'
                    });
                }
                result = await scraper.detail(url);
                break;

            case 'download':
                if (!url) {
                    return res.status(400).json({
                        status: false,
                        message: 'URL parameter is required for download action'
                    });
                }
                result = await scraper.download(url);
                break;

            default:
                return res.status(400).json({
                    status: false,
                    message: 'Invalid action. Available actions: home, search, detail, download'
                });
        }

        // Check if result contains error
        if (result && result.error) {
            return res.status(500).json({
                status: false,
                message: result.error,
                timestamp: new Date().toISOString()
            });
        }

        return res.status(200).json({
            status: true,
            data: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('API Handler Error:', error);
        return res.status(500).json({
            status: false,
            message: error.message || 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
                        }
