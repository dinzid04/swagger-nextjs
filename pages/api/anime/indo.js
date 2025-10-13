import axios from 'axios';
import * as cheerio from 'cheerio';

class AnimeIndoScraper {
    constructor() {
        this.baseUrl = 'https://anime-indo.lol';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache'
        };
    }

    async makeRequest(path = '') {
        try {
            const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
            const { data } = await axios.get(url, {
                headers: this.headers,
                timeout: 15000
            });
            return data;
        } catch (error) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    async home() {
        try {
            const data = await this.makeRequest();
            const $ = cheerio.load(data);
            const result = {
                ongoing: [],
                completed: [],
                latest_episodes: []
            };

            // Ongoing Anime
            $('.anime-ongoing .anime-item, .ongoing .series-grid article').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, h3, .entry-title').text().trim();
                const img = $el.find('img').attr('src');
                const url = $el.find('a').attr('href');
                
                if (title && img) {
                    result.ongoing.push({
                        title,
                        img: img.startsWith('http') ? img : this.baseUrl + img,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        episode: $el.find('.episode, .ep').text().trim() || 'Latest',
                        score: $el.find('.score, .rating').text().trim() || null
                    });
                }
            });

            // Completed Anime
            $('.anime-completed .anime-item, .completed .series-grid article').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, h3, .entry-title').text().trim();
                const img = $el.find('img').attr('src');
                const url = $el.find('a').attr('href');
                
                if (title && img) {
                    result.completed.push({
                        title,
                        img: img.startsWith('http') ? img : this.baseUrl + img,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        type: $el.find('.type').text().trim() || 'TV',
                        score: $el.find('.score, .rating').text().trim() || null
                    });
                }
            });

            // Latest Episodes
            $('.latest-episodes .episode-item, .episode-list .item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, .anime-title').text().trim();
                const episode = $el.find('.episode, .ep').text().trim();
                const url = $el.find('a').attr('href');
                const time = $el.find('.time, .date').text().trim();
                
                if (title && episode) {
                    result.latest_episodes.push({
                        title,
                        episode,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        time: time || 'Recently',
                        anime_url: $el.find('a').attr('href') || null
                    });
                }
            });

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async genre(genreName = '') {
        try {
            let url = '/genre/';
            if (genreName) {
                url += genreName.toLowerCase() + '/';
            }

            const data = await this.makeRequest(url);
            const $ = cheerio.load(data);
            const result = {
                genres: [],
                anime_list: []
            };

            // Genre List
            $('.genre-list a, .genres a').each((i, el) => {
                const $el = $(el);
                const name = $el.text().trim();
                const url = $el.attr('href');
                
                if (name) {
                    result.genres.push({
                        name,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        count: $el.find('.count').text().trim() || null
                    });
                }
            });

            // Anime by Genre
            $('.series-grid article, .anime-item, .post').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, h3, .entry-title').text().trim();
                const img = $el.find('img').attr('src');
                const url = $el.find('a').attr('href');
                
                if (title && img) {
                    result.anime_list.push({
                        title,
                        img: img.startsWith('http') ? img : this.baseUrl + img,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        type: $el.find('.type').text().trim() || 'TV',
                        score: $el.find('.score, .rating').text().trim() || null,
                        genre: genreName || 'All'
                    });
                }
            });

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async movie() {
        try {
            const data = await this.makeRequest('/movie/');
            const $ = cheerio.load(data);
            const result = [];

            $('.series-grid article, .anime-item, .movie-item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, h3, .entry-title').text().trim();
                const img = $el.find('img').attr('src');
                const url = $el.find('a').attr('href');
                
                if (title && img) {
                    result.push({
                        title,
                        img: img.startsWith('http') ? img : this.baseUrl + img,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        type: 'Movie',
                        duration: $el.find('.duration, .time').text().trim() || null,
                        score: $el.find('.score, .rating').text().trim() || null,
                        year: $el.find('.year').text().trim() || null
                    });
                }
            });

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async jadwal() {
        try {
            const data = await this.makeRequest('/jadwal/');
            const $ = cheerio.load(data);
            const result = {
                days: {}
            };

            // Parse schedule by day
            $('.schedule-day, .day-schedule').each((i, el) => {
                const $el = $(el);
                const day = $el.find('.day-name, h3').text().trim() || `Day ${i + 1}`;
                result.days[day] = [];

                $el.find('.schedule-item, .anime-item').each((j, item) => {
                    const $item = $(item);
                    const title = $item.find('.title, .anime-title').text().trim();
                    const time = $item.find('.time, .schedule-time').text().trim();
                    const episode = $item.find('.episode, .ep').text().trim();
                    const url = $item.find('a').attr('href');
                    
                    if (title) {
                        result.days[day].push({
                            title,
                            time: time || 'Unknown',
                            episode: episode || 'Latest',
                            url: url.startsWith('http') ? url : this.baseUrl + url
                        });
                    }
                });
            });

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async search(query) {
        try {
            if (!query) {
                return { error: 'Query is required' };
            }

            const data = await this.makeRequest(`/?s=${encodeURIComponent(query)}`);
            const $ = cheerio.load(data);
            const result = [];

            $('.search-result article, .series-grid article, .anime-item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, h3, .entry-title').text().trim();
                const img = $el.find('img').attr('src');
                const url = $el.find('a').attr('href');
                const synopsis = $el.find('.synopsis, .description').text().trim();
                
                if (title) {
                    result.push({
                        title,
                        img: img ? (img.startsWith('http') ? img : this.baseUrl + img) : null,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        type: $el.find('.type').text().trim() || 'Anime',
                        status: $el.find('.status').text().trim() || null,
                        score: $el.find('.score, .rating').text().trim() || null,
                        synopsis: synopsis || null
                    });
                }
            });

            return result.length > 0 ? result : { error: `No results found for "${query}"` };
        } catch (error) {
            return { error: error.message };
        }
    }

    async detail(url) {
        try {
            if (!url) {
                return { error: 'URL is required' };
            }

            const data = await this.makeRequest(url);
            const $ = cheerio.load(data);
            const result = {
                title: $('.anime-title, h1.entry-title').text().trim(),
                img: $('.anime-poster img, .thumbnail img').attr('src'),
                synopsis: $('.synopsis, .description').text().trim(),
                details: {},
                genres: [],
                episodes: []
            };

            // Parse details
            $('.anime-details li, .detail-list li').each((i, el) => {
                const $el = $(el);
                const text = $el.text().trim();
                const parts = text.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
                    const value = parts.slice(1).join(':').trim();
                    result.details[key] = value;
                }
            });

            // Parse genres
            $('.anime-genres a, .genre-tags a').each((i, el) => {
                const genre = $(el).text().trim();
                if (genre) {
                    result.genres.push(genre);
                }
            });

            // Parse episodes
            $('.episode-list li, .episodes a').each((i, el) => {
                const $el = $(el);
                const episode = $el.find('.episode-number, .episode-title').text().trim();
                const url = $el.attr('href');
                const date = $el.find('.episode-date, .date').text().trim();
                
                if (episode && url) {
                    result.episodes.push({
                        episode,
                        url: url.startsWith('http') ? url : this.baseUrl + url,
                        date: date || null
                    });
                }
            });

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
        const { action, query, genre, url } = req.query;
        const scraper = new AnimeIndoScraper();

        let result;

        switch (action) {
            case 'home':
                result = await scraper.home();
                break;

            case 'genre':
                result = await scraper.genre(genre);
                break;

            case 'movie':
                result = await scraper.movie();
                break;

            case 'jadwal':
                result = await scraper.jadwal();
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

            default:
                return res.status(400).json({
                    status: false,
                    message: 'Invalid action. Available: home, genre, movie, jadwal, search, detail'
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
