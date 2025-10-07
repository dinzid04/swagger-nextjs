import axios from 'axios';
import * as cheerio from 'cheerio';

class NontonAnimeID {
    constructor() {
        this.baseUrl = 'https://s7.nontonanimeid.boats/';
        this.headers = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        };
    }

    async home() {
        try {
            let { data } = await axios.get(this.baseUrl, { headers: this.headers });
            const $ = cheerio.load(data);
            let result = [];
            $('article.animeseries').each((i, el) => {
                result.push({
                    title: $(el).find('h3.title').text().trim(),
                    img: $(el).find('img').attr('src'),
                    eps: $(el).find('.episodes').text().trim(),
                    status: $(el).find('.status').text().trim(),
                });
            });
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async search(q) {
        if (!q) return { error: 'Query is required' };
        try {
            let { data } = await axios.get(new URL(`/?s=${q}`, this.baseUrl).toString(), { headers: this.headers });
            const $ = cheerio.load(data);
            let result = [];
            $('.icon').remove();
            $('.as-anime-grid a').each((i, el) => {
                result.push({
                    title: $(el).find('.as-anime-title').text().trim(),
                    img: $(el).find('img').attr('src'),
                    rating: $(el).find('.as-rating').text().trim(),
                    type: $(el).find('.as-type').text().trim(),
                    season: $(el).find('.as-season').text().trim(),
                    sypnosis: $(el).find('.as-synopsis').text().trim(),
                    genre: [],
                    url: $(el).attr('href')
                });
                $(el).find('.as-genres span').each((j, el2) => {
                    result[i].genre.push($(el2).text().trim());
                });
            });
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async detail(url) {
        try {
            let { data } = await axios.get(url, { headers: this.headers });
            const $ = cheerio.load(data);
            let result = {
                title: $('.anime-card__sidebar img').attr('alt'),
                img: $('.anime-card__sidebar img').attr('src'),
                synopsis: $('.synopsis-prose').text().trim(),
                detail: {},
                genre: [],
                episodes: []
            };
            $('.detail-separator').remove();
            $('.details-list li').each((i, el) => {
                let key = $(el).find('.detail-label').text().replace(':', '').toLowerCase().replace(/\s/g, '_');
                $(el).find('.detail-label').remove();
                let value = $(el).text().trim();
                result.detail[key] = value;
            });
            $('.anime-card__genres a').each((i, el) => {
                result.genre.push($(el).text().trim());
            });
            $('.episode-list-items a').each((i, el) => {
                result.episodes.push({
                    eps: $(el).find('.ep-title').text().trim(),
                    date: $(el).find('.ep-date').text().trim(),
                    url: $(el).attr('href')
                });
            });
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async download(url) {
        try {
            let { data: page } = await axios.get(url, { headers: this.headers });
            const $ = cheerio.load(page);
            let lokal = null;
            let alternative = [];
            $('.listlink a').each((i, el) => {
                if ($(el).text().toLowerCase().includes('lokal')) {
                    lokal = $(el).attr('href');
                } else {
                    alternative.push({
                        server: $(el).text().trim(),
                        url: $(el).attr('href')
                    });
                }
            });
            return {
                title: $('h1.entry-title').text().trim(),
                date: $('.bottomtitle time').text().trim(),
                download: lokal ? await this.initDownload(lokal) : 'No lokal server found',
                alternative
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    async initDownload(url) {
        try {
            let { data: token } = await axios.post(`https://s2.kotakanimeid.link/video/get-token.php`, { url }, {
                headers: {
                    'content-type': 'application/json',
                    'origin': this.baseUrl,
                    'referer': url,
                    'x-fingerprint': 'dummy-fingerprint',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
                }
            });
            let { data: html } = await axios.get(url, { headers: this.headers });
            const $ = cheerio.load(html);
            const script = $('script').html();
            const matchEncryptedParam = script.match(/const ENCRYPTED_PARAM = "(.*)";/);
            const matchTitleParam = script.match(/const TITLE_PARAM = "(.*)";/);
            const encryptedParam = matchEncryptedParam[1];
            const titleParam = matchTitleParam[1];
            const requestUrl = new URL('/video/get-download.php', 'https://s2.kotakanimeid.link');
            requestUrl.searchParams.set('mode', 'lokal');
            requestUrl.searchParams.set('vid', encodeURIComponent(encryptedParam));
            if (titleParam) requestUrl.searchParams.set('title', encodeURIComponent(titleParam));
            requestUrl.searchParams.set('dl', 'yes');
            requestUrl.searchParams.set('json', 'true');
            let { data } = await axios.post(requestUrl.toString(), {
                challenge: token.challenge,
                url: requestUrl.toString(),
            }, {
                headers: {
                    'content-type': 'application/json',
                    'origin': this.baseUrl,
                    'referer': url,
                    'x-fingerprint': 'dummy-fingerprint',
                    'x-challenge': token.challenge,
                    'x-security-token': token.token,
                    'x-timestamp': token.timestamp,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
                }
            });
            let result = [];
            for (const [quality, items] of Object.entries(data.links)) {
                result.push({
                    quality,
                    url: 'https://s2.kotakanimeid.link' + items[0].url
                });
            }
            // Get final download URLs
            for (let i = 0; i < result.length; i++) {
                try {
                    let res = await axios.get(result[i].url, {
                        headers: {
                            ...this.headers,
                            referer: result[i].url
                        },
                        maxRedirects: 0,
                        validateStatus: function (status) {
                            return status >= 200 && status < 400;
                        }
                    });
                    if (res.headers.location) {
                        result[i].url = res.headers.location;
                    }
                } catch (error) {
                    console.log(`Failed to get final URL for ${result[i].quality}:`, error.message);
                }
            }
            return result;
        } catch (error) {
            return { error: error.message };
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
                        message: 'Query parameter is required for search'
                    });
                }
                result = await scraper.search(query);
                break;

            case 'detail':
                if (!url) {
                    return res.status(400).json({
                        status: false,
                        message: 'URL parameter is required for detail'
                    });
                }
                result = await scraper.detail(url);
                break;

            case 'download':
                if (!url) {
                    return res.status(400).json({
                        status: false,
                        message: 'URL parameter is required for download'
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

        if (result.error) {
            return res.status(500).json({
                status: false,
                message: result.error
            });
        }

        return res.status(200).json({
            status: true,
            data: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            status: false,
            message: error.message || 'Internal server error'
        });
    }
              }
