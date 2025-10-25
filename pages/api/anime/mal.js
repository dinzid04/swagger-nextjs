import axios from 'axios';
import cheerio from 'cheerio';

class MAL {
    topAnime = async function () {
        try {
            const { data } = await axios.get('https://myanimelist.net/topanime.php');
            const $ = cheerio.load(data);
            const animeList = [];
    
            $('.ranking-list').each((_, element) => {
                const rank = $(element).find('.rank').text().trim();
                const title = $(element).find('.title h3 a').text().trim();
                const url = $(element).find('.title h3 a').attr('href');
                const score = $(element).find('.score span').text().trim();
                const cover = $(element).find('.title img').attr('data-src');
                const type = $(element).find('.information').text().split('\n')[1].trim();
                const release = $(element).find('.information').text().split('\n')[2].trim();
                const members = $(element).find('.information').text().split('\n')[3].trim();
    
                animeList.push({
                    rank,
                    title,
                    score,
                    type,
                    release,
                    members,
                    cover,
                    url
                });
            });
    
            return animeList;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    seasonalAnime = async function (season, type) {
        try {
            const valid = {
                seasons: ['fall', 'spring', 'winter', 'summer'],
                types: {
                    'tv-new': 'TV (New)',
                    'tv-continuing': 'TV (Continuing)',
                    'ona': 'ONA',
                    'ova': 'OVA',
                    'movie': 'Movie',
                    'special': 'Special'
                }
            };
            
            if (!valid.types[type]) throw new Error(`Available types: ${Object.keys(valid.types).join(', ')}`);
            if (!valid.seasons.includes(season)) throw new Error(`Available seasons: ${valid.seasons.join(', ')}`);
    
            const { data } = await axios.get(`https://myanimelist.net/anime/season/2024/${season}`);
            const $ = cheerio.load(data);
            const animeList = [];
    
            $('.seasonal-anime-list').each((_, list) => {
                const typeTxt = $(list).find('.anime-header').text().trim();
    
                $(list).find('.js-seasonal-anime').each((_, element) => {
                    const title = $(element).find('.h2_anime_title > a').text().trim();
                    const url = $(element).find('.h2_anime_title > a').attr('href');
                    const cover = $(element).find('.image > a > img').attr('src') || $(element).find('.image > a > img').attr('data-src');
                    const score = $(element).find('.js-score').text().trim();
                    const members = $(element).find('.js-members').text().trim();
                    const formattedMembers = Number(members.replace(/\D/g, '')).toLocaleString('en-US');
    
                    const infoDiv = $(element).find('.info');
                    const releaseDate = infoDiv.find('.item:first-child').text().trim();
                    const totalEps = infoDiv.find('.item:nth-child(2) span:first-child').text().trim();
                    const duration = infoDiv.find('.item:nth-child(2) span:nth-child(2)').text().trim();
                    const totalEpsWithDuration = `${totalEps}, ${duration}`;
    
                    const synopsis = $(element).find('.synopsis p').text().trim();
    
                    const studio = $(element).find('.property:contains("Studio") .item').text().trim();
                    const source = $(element).find('.property:contains("Source") .item').text().trim();
                    const themes = $(element).find('.property:contains("Themes") .item').map((_, theme) => $(theme).text().trim()).get().join(', ');
                    const genres = $(element).find('.genres .genre a').map((_, g) => $(g).text().trim()).get().join(', ');
    
                    animeList.push({
                        title,
                        type: typeTxt || 'Unknown',
                        url,
                        cover,
                        stats: {
                            score: score || 'N/A',
                            members: formattedMembers || 'N/A'
                        },
                        details: {
                            releaseDate: releaseDate || 'Unknown',
                            totalEpisodes: totalEpsWithDuration || 'Unknown',
                            studio: studio || 'Unknown',
                            source: source || 'Unknown'
                        },
                        tags: {
                            themes: themes || 'None',
                            genres: genres || 'None'
                        },
                        synopsis: synopsis
                    });
                });
            });
            
            return animeList.filter(obj => obj.type === valid.types[type]);
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    animeSearch = async function (query) {
        try {
            if (!query) throw new Error('Query is required');
            
            const { data } = await axios.get(`https://myanimelist.net/anime.php?q=${encodeURIComponent(query)}&cat=anime`);
            const $ = cheerio.load(data);
            const animeList = [];
    
            $('table tbody tr').each((_, element) => {
                const cover = $(element).find('td:nth-child(1) img').attr('data-src') || $(element).find('td:nth-child(1) img').attr('src');
                const title = $(element).find('td:nth-child(2) strong').text().trim();
                const url = $(element).find('td:nth-child(2) a').attr('href');
                const type = $(element).find('td:nth-child(3)').text().trim();
                const episodes = $(element).find('td:nth-child(4)').text().trim();
                const score = $(element).find('td:nth-child(5)').text().trim();
                const description = $(element).find('td:nth-child(2) .pt4').text().replace('read more.', '').trim()  || 'No Desc'
                
                if (title && url) {
                    animeList.push({
                        title,
                        description,
                        type,
                        episodes,
                        score,
                        cover,
                        url
                    });
                }
            });
            
            return animeList;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    mangaSearch = async function (query) {
        try {
            if (!query) throw new Error('Query is required');
            
            const { data } = await axios.get(`https://myanimelist.net/manga.php?q=${encodeURIComponent(query)}&cat=manga`);
            const $ = cheerio.load(data);
            const mangaList = [];
    
            $('table tbody tr').each((_, element) => {
                const cover = $(element).find('td:nth-child(1) img').attr('data-src') || $(element).find('td:nth-child(1) img').attr('src');
                const title = $(element).find('td:nth-child(2) strong').text().trim();
                const url = $(element).find('td:nth-child(2) a').attr('href');
                const type = $(element).find('td:nth-child(3)').text().trim();
                const vol = $(element).find('td:nth-child(4)').text().trim();
                const score = $(element).find('td:nth-child(5)').text().trim();
                const description = $(element).find('td:nth-child(2) .pt4').text().replace('read more.', '').trim() || 'No Desc'
                
                if (title && url) {
                    mangaList.push({
                        title,
                        description,
                        type,
                        vol,
                        score,
                        cover,
                        url
                    });
                }
            });
            
            return mangaList;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    charaSearch = async function (query) {
        try {
            if (!query) throw new Error('Query is required');
            
            const { data } = await axios.get(`https://myanimelist.net/character.php?q=${encodeURIComponent(query)}&cat=character`);
            const $ = cheerio.load(data);
            const characterData = [];
    
            $('table tbody tr').each((_, element) => {
                const cover = $(element).find('td .picSurround img').attr('data-src') || $(element).find('td .picSurround img').attr('src');
                const nameElement = $(element).find('td:nth-child(2) a');
                const name = nameElement.text().trim();
                const url = nameElement.attr('href') || '';
    
                const animeList = [];
                const mangaList = [];
    
                $(element).find('td small a[href*="/anime/"]').each((_, anime) => {
                    animeList.push({
                        title: $(anime).text().trim(),
                        url: `https://myanimelist.net${$(anime).attr('href')}`
                    });
                });
    
                $(element).find('td small a[href*="/manga/"]').each((_, manga) => {
                    mangaList.push({
                        title: $(manga).text().trim(),
                        url: `https://myanimelist.net${$(manga).attr('href')}`
                    });
                });
    
                if (name && url) {
                    characterData.push({
                        name,
                        anime: animeList,
                        manga: mangaList,
                        cover,
                        url
                    });
                }
            });
    
            return characterData;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    animeDetail = async function (url) {
        try {
            if (!url.includes('myanimelist.net/anime')) throw new Error('Invalid url');
            
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);
            
            const title = $("h1.title-name").text().trim();
            const cover = $(".leftside img").attr("data-src");
            const synopsis = $(".js-scrollfix-bottom-rel").find("p").first().text().trim();
            const background = $('td.pb24:contains("Background")').contents().map(function() {
                if (this.type === 'text') {
                    return $(this).text();
                } else if (this.name === 'i') {
                    return $(this).text();
                }
            }).get().join('').trim();
    
            const alternativeTitles = {
                synonyms: $('.spaceit_pad:contains("Synonyms")').contents().not('span').text().trim(),
                japanese: $('.spaceit_pad:contains("Japanese")').contents().not('span').text().trim(),
                english: $('.spaceit_pad:contains("English")').contents().not('span').text().trim(),
            };
    
            const information = {
                type: $('.spaceit_pad:contains("Type") a').text().trim(),
                episodes: $('.spaceit_pad:contains("Episodes")').contents().not('span').text().trim(),
                status: $('.spaceit_pad:contains("Status")').contents().not('span').text().trim(),
                aired: $('.spaceit_pad:contains("Aired")').contents().not('span').text().trim(),
                premiered: $('.spaceit_pad:contains("Premiered")').contents().not('span').text().trim(),
                broadcast: $('.spaceit_pad:contains("Broadcast")').contents().not('span').text().trim(),
                producers: $("span:contains('Producers:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'Unknown',
                licensors: $("span:contains('Licensors:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'Unknown',
                studios: $("span:contains('Studios:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'Unknown',
                source: $('.spaceit_pad:contains("Source")').contents().not('span').text().trim(),
                genres: $("span:contains('Genres:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                themes: $("span:contains('Themes:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                demographic: $("span:contains('Demographic:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                duration: $('.spaceit_pad:contains("Duration")').contents().not('span').text().trim(),
                rating: $('.spaceit_pad:contains("Rating")').contents().not('span').text().trim(),
            };
            
            const element = $('.spaceit_pad').filter((_, el) => {
                return $(el).find('span.dark_text').text().trim() === 'Ranked:';
            });
            const rankedText = element.contents().filter((_, el) => el.type === 'text').text().trim();
            
            const statistics = {
                score: $('span[itemprop="ratingValue"]').text().trim(),
                ranked: rankedText,
                popularity: $('.spaceit_pad:contains("Popularity")').contents().not('span').text().trim(),
                members: $('.spaceit_pad:contains("Members")').contents().not('span').text().trim(),
                favorites: $('.spaceit_pad:contains("Favorites")').contents().not('span').text().trim(),
            };
            
            const externalLinks = $(".external_urls a").map((i, el) => {
                const name = $(el).find(".caption").text().trim();
                const url = $(el).attr("href");
                if (name && url) {
                    return { name, url };
                }
            }).get()
            
            return {
                title,
                synopsis,
                background,
                alternativeTitles,
                information,
                statistics,
                externalLinks,
                cover,
                url: url
            };
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    mangaDetail = async function (url) {
        try {
            if (!url.includes('myanimelist.net/manga')) throw new Error('Invalid url');
            
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);
            
            const title = $('span.h1-title span[itemprop="name"]').text().trim();
            const cover = $(".leftside img").attr("data-src");
            const synopsis = $('span[itemprop="description"]').text().trim();
            const background = $('td.pb24:contains("Background")').contents().map(function() {
                if (this.type === 'text') {
                    return $(this).text();
                } else if (this.name === 'i') {
                    return $(this).text();
                }
            }).get().join('').trim();
    
            const alternativeTitles = {
                synonyms: $('.spaceit_pad:contains("Synonyms")').contents().not('span').text().trim(),
                japanese: $('.spaceit_pad:contains("Japanese")').contents().not('span').text().trim(),
                english: $('.spaceit_pad:contains("English")').contents().not('span').text().trim(),
            };
    
            const information = {
                type: $('.spaceit_pad:contains("Type") a').text().trim(),
                volumes: $('.spaceit_pad:contains("Volumes")').contents().not('span').text().trim(),
                chapters: $('.spaceit_pad:contains("Chapters")').contents().not('span').text().trim(),
                status: $('.spaceit_pad:contains("Status")').contents().not('span').text().trim(),
                published: $('.spaceit_pad:contains("Published")').contents().not('span').text().trim(),
                genres: $("span:contains('Genres:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                themes: $("span:contains('Themes:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                demographic: $("span:contains('Demographic:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                serialization: $("span:contains('Serialization:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'None',
                authors: $("span:contains('Authors:')").nextAll("a").map((i, el) => $(el).text().trim()).get().join(', ') || 'Unknown',
            };
            
            const element = $('.spaceit_pad').filter((_, el) => {
                return $(el).find('span.dark_text').text().trim() === 'Ranked:';
            });
            const rankedText = element.contents().filter((_, el) => el.type === 'text').text().trim();
            
            const statistics = {
                score: $('span[itemprop="ratingValue"]').text().trim(),
                ranked: rankedText,
                popularity: $('.spaceit_pad:contains("Popularity")').contents().not('span').text().trim(),
                members: $('.spaceit_pad:contains("Members")').contents().not('span').text().trim(),
                favorites: $('.spaceit_pad:contains("Favorites")').contents().not('span').text().trim(),
            };
            
            const externalLinks = $(".external_urls a").map((i, el) => {
                const name = $(el).find(".caption").text().trim();
                const url = $(el).attr("href");
                if (name && url) {
                    return { name, url };
                }
            }).get()
            
            return {
                title,
                synopsis,
                background,
                alternativeTitles,
                information,
                statistics,
                externalLinks,
                cover,
                url: url
            };
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    charaDetail = async function (url) {
        try {
            if (!url.includes('myanimelist.net/character')) throw new Error('Invalid url');
            
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);
    
            const name = $('h2.normal_header').first().text().trim();
            const description = $('h2.normal_header').closest('td').clone().children().remove().end().text().trim();
            const cover = $('img.portrait-225x350').attr('data-src') || $('img.portrait-225x350').attr('src');
    
            const animeography = [];
            $('td.borderClass').each((i, el) => {
                const animeTitle = $(el).find('a[href*="https://myanimelist.net/anime/"]').text().trim()
                const animeLink = $(el).find('a[href*="https://myanimelist.net/anime/"]').attr('href')
                if (animeTitle && animeLink) {
                    animeography.push({ title: animeTitle, url: animeLink });
                }
            });
    
            const mangaography = [];
            $('td.borderClass').each((i, el) => {
                const mangaTitle = $(el).find('a[href*="https://myanimelist.net/manga/"]').text().trim()
                const mangaLink = $(el).find('a[href*="https://myanimelist.net/manga/"]').attr('href')
                if (mangaTitle && mangaLink) {
                    mangaography.push({ title: mangaTitle, url: mangaLink });
                }
            });
    
            const voiceActors = [];
            $('div.voice_actor').find('tr').each((i, el) => {
                const vaName = $(el).find('td:nth-child(2) a').text().trim();
                const vaImage = $(el).find('td:nth-child(1) img').attr('data-src') || $(el).find('td:nth-child(1) img').attr('src');
                const vaRole = $(el).find('td:nth-child(3)').text().trim();
                if (vaName && vaImage) {
                    voiceActors.push({ name: vaName, role: vaRole, image: vaImage });
                }
            });
    
            return {
                name,
                description,
                cover,
                animeography,
                mangaography,
                voiceActors
            };
        } catch (error) {
            throw new Error(error.message);
        }
    };
}

const mal = new MAL();

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            status: false,
            message: 'Method not allowed'
        });
    }

    const { action } = req.query;

    try {
        let result;

        switch (action) {
            case 'top-anime':
                result = await mal.topAnime();
                break;

            case 'seasonal-anime':
                const { season, type } = req.query;
                if (!season || !type) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameters season and type are required for seasonal-anime'
                    });
                }
                result = await mal.seasonalAnime(season, type);
                break;

            case 'search-anime':
                const { query: animeQuery } = req.query;
                if (!animeQuery) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameter query is required for search-anime'
                    });
                }
                result = await mal.animeSearch(animeQuery);
                break;

            case 'search-manga':
                const { query: mangaQuery } = req.query;
                if (!mangaQuery) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameter query is required for search-manga'
                    });
                }
                result = await mal.mangaSearch(mangaQuery);
                break;

            case 'search-character':
                const { query: charaQuery } = req.query;
                if (!charaQuery) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameter query is required for search-character'
                    });
                }
                result = await mal.charaSearch(charaQuery);
                break;

            case 'anime-detail':
                const { url: animeUrl } = req.query;
                if (!animeUrl) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameter url is required for anime-detail'
                    });
                }
                result = await mal.animeDetail(animeUrl);
                break;

            case 'manga-detail':
                const { url: mangaUrl } = req.query;
                if (!mangaUrl) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameter url is required for manga-detail'
                    });
                }
                result = await mal.mangaDetail(mangaUrl);
                break;

            case 'character-detail':
                const { url: charaUrl } = req.query;
                if (!charaUrl) {
                    return res.status(400).json({
                        status: false,
                        message: 'Parameter url is required for character-detail'
                    });
                }
                result = await mal.charaDetail(charaUrl);
                break;

            default:
                return res.status(400).json({
                    status: false,
                    message: 'Invalid action. Available actions: top-anime, seasonal-anime, search-anime, search-manga, search-character, anime-detail, manga-detail, character-detail'
                });
        }

        return res.status(200).json({
            status: true,
            data: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('MAL API Error:', error);
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}
