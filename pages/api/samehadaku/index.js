import axios from 'axios';
import cheerio from 'cheerio';

class Samehadaku {
  constructor() {
    this.d = 'v1.samehadaku.how';
    this.ins = axios.create({
      baseURL: 'https://' + this.d,
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Host': this.d,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 16; V2405A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.123 Mobile Safari/537.36',
      }
    });
  }

  async search(query, page = 1) {
    try {
      const r = await this.ins.get(`/page/${page}/`, {
        params: { s: query }
      });
      const $ = cheerio.load(r.data);
      const sr = [];
      const genres = [];

      $('main#main article.animpost').each((idx, el) => {
        const m = $(el);
        const title = m.find('.data .title h2').text().trim();
        const img = m.find('.content-thumb img.anmsa').attr('src');
        const score = m.find('.content-thumb .score').text().trim();
        const type = m.find('.content-thumb .type').text().trim();
        const status = m.find('.data .type').text().trim();
        const synopsis = m.find('.stooltip .ttls').text().trim();
        const url = m.find('.animposx > a').attr('href');

        m.find('.stooltip .genres .mta a').each((_, ex) => {
          genres.push($(ex).text().trim());
        });

        if (title) {
          sr.push({
            index: idx,
            title,
            url,
            img,
            score,
            type,
            status,
            synopsis,
            genres: [...genres]
          });
        }
      });

      const res = {
        status: true,
        data: sr,
      };

      const hh = $('.pagination');
      const gg = hh.find('span').first().text();
      if (gg) {
        const xn = gg.match(/Page (.*?) of (.*?)$/);
        res.totalPage = Number(xn[2]);
        res.hasNext = Number(xn[1]) !== Number(xn[2]);
      } else {
        res.totalPage = sr.length;
        res.hasNext = false;
      }

      return res;
    } catch (e) {
      throw new Error(`An error occurred, msg: ${e.message}`);
    }
  }

  async detail(lnk) {
    try {
      const r = await this.ins.get(lnk);
      const $ = cheerio.load(r.data);
      const synopsis = [];
      const genres = [];
      const detail = {};
      const episode = [];
      const batch = [];

      $('.infox .entry-content p').each((_, l) => synopsis.push($(l).text().trim()));
      $('.infox .genre-info a').each((_, l) => genres.push($(l).text().trim()));
      $('.infox .spe span').each((_, l) => {
        const s = $(l);
        const k = s.find('b').text().trim().toLowerCase().replace(/\s/g, '_').replace(/:/, '');
        s.find('b').remove();
        if (k) {
          detail[k] = s.text().trim();
        }
      });

      $('.lstepsiode.listeps ul li').each((_, l) => {
        const z = $(l);
        const number = z.find('.epsright .eps a').text().trim();
        const title = z.find('.epsleft .lchx a').text().trim();
        const date = z.find('.epsleft .date').text().trim();
        const url = z.find('.epsleft .lchx a').attr('href');
        episode.push({
          number, title, date, url
        });
      });

      $('.listbatch a').each((_, l) => {
        batch.push($(l).attr('href'));
      });

      return {
        status: true,
        title: $('header.info_episode h1.entry-title').text().trim(),
        score: $('.rating-area span[itemprop="ratingValue"]').text().trim(),
        img: $('.infoanime .thumb img').attr('src'),
        published: $('time[itemprop="datePublished"]').attr('datetime'),
        synopsis: synopsis.join('\n'),
        genres,
        detail,
        batch,
        episode: episode.reverse()
      };
    } catch (e) {
      throw new Error(`An error occurred, msg: ${e.message}`);
    }
  }

  async episode(lnk) {
    try {
      const r = await this.ins.get(lnk);
      const $ = cheerio.load(r.data);
      const mdt = {};
      const stream = [];
      const download = [];
      const episode = [];
      const nextUrl = $('.naveps .nvs.rght a').attr('href');

      if (nextUrl && !nextUrl.includes('#')) {
        mdt.nextEpisodeUrl = nextUrl;
        mdt.nextEpisode = true;
      } else {
        mdt.nextEpisode = false;
      }

      $('#server ul li .east_player_option').each((_, l) => {
        const n = $(l);
        const id = n.attr('data-post');
        const name = n.find('span').text().trim();
        const nume = n.attr('data-nume');
        const type = n.attr('data-type');
        stream.push({
          id,
          name,
          nume,
          type,
          data: Buffer.from(`post=${id}&nume=${nume}`).toString('base64')
        });
      });

      $('.download-eps').each((_, l) => {
        const g = $(l);
        const formats = [];
        const title = g.find('p > b').text().trim();
        g.find('ul > li').each((_, j) => {
          const x = $(j);
          const links = [];
          const quality = x.find('strong').text().trim();
          x.find('span a').each((k, a) => {
            links.push({
              host: $(a).text().trim(),
              url: $(a).attr('href')
            });
          });
          if (quality) {
            formats.push({
              quality,
              links
            });
          }
        });
        if (title) {
          download.push({
            title,
            formats
          });
        }
      });

      $('.episode-lainnya .lstepsiode ul li').each((_, l) => {
        const x = $(l);
        const title = x.find('.epsleft .lchx a').text().trim();
        const date = x.find('.epsleft .date').text().trim();
        const img = x.find('.epsright img').attr('src');
        const url = x.find('.epsleft .lchx a').attr('href');
        episode.push({ title, date, img, url });
      });

      return {
        status: true,
        title: $('header.info_episode h1.entry-title').text().trim(),
        series: $('.naveps .nvsc a').attr('href'),
        stream,
        download,
        episode,
        ...mdt
      };
    } catch (e) {
      throw new Error(`An error occurred, msg: ${e.message}`);
    }
  }

  async stream(dt) {
    try {
      const id = Buffer.from(dt, 'base64').toString();
      const r = await this.ins.post('/wp-admin/admin-ajax.php', `action=player_ajax&${id}&type=schtml`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        }
      });
      const n = r.data.match(/iframe\ssrc="(.*?)"\s/)?.[1];
      if (n) {
        return {
          status: true,
          url: n
        };
      } else {
        return {
          status: false,
          msg: 'url not found from iframe'
        };
      }
    } catch (e) {
      throw new Error(`An error occurred, msg: ${e.message}`);
    }
  }

  async schedule(day = 'monday') {
    try {
      const r = await this.ins.get('/wp-json/custom/v1/all-schedule', {
        params: {
          perpage: '50',
          day,
          type: 'schtml'
        }
      });

      return r.data.map(p => ({
        title: p.title,
        score: p.east_score,
        date: p.date,
        type: p.east_type,
        genre: p.genre,
        img: p.featured_img_src,
        url: p.url
      }));
    } catch (e) {
      throw new Error(`An error occurred, msg: ${e.message}`);
    }
  }

  async latest(page = 1) {
    try {
      const r = await this.ins.get(`/anime-terbaru/page/${page}/`);
      const $ = cheerio.load(r.data);
      const dt = [];

      $('.post-show ul li').each((_, l) => {
        const n = $(l);
        const title = n.find('h2 a').text();
        const episode = n.find('span > author').first().text();
        const released = n.find('span:contains("Released on")').text()?.split(':')?.[1]?.trim();
        const img = n.find('a img').attr('src');
        const url = n.find('a[itemprop]').attr('href');
        dt.push({
          title, episode, released, img, url
        });
      });

      return dt;
    } catch (e) {
      throw new Error(`An error occurred, msg: ${e.message}`);
    }
  }
}

// Handler utama
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const samehadaku = new Samehadaku();
    const { endpoint } = req.query;

    switch (endpoint) {
      case 'search':
        const { query, page = 1 } = req.query;
        if (!query) {
          return res.status(400).json({
            status: false,
            message: 'Parameter query is required'
          });
        }
        const searchResult = await samehadaku.search(query, parseInt(page));
        return res.json(searchResult);

      case 'detail':
        const { url } = req.query;
        if (!url) {
          return res.status(400).json({
            status: false,
            message: 'Parameter url is required'
          });
        }
        const detailResult = await samehadaku.detail(url);
        return res.json(detailResult);

      case 'episode':
        const { episodeUrl } = req.query;
        if (!episodeUrl) {
          return res.status(400).json({
            status: false,
            message: 'Parameter episodeUrl is required'
          });
        }
        const episodeResult = await samehadaku.episode(episodeUrl);
        return res.json(episodeResult);

      case 'stream':
        const { data } = req.query;
        if (!data) {
          return res.status(400).json({
            status: false,
            message: 'Parameter data is required'
          });
        }
        const streamResult = await samehadaku.stream(data);
        return res.json(streamResult);

      case 'schedule':
        const { day = 'monday' } = req.query;
        const scheduleResult = await samehadaku.schedule(day);
        return res.json({
          status: true,
          data: scheduleResult,
          day: day
        });

      case 'latest':
        const { latestPage = 1 } = req.query;
        const latestResult = await samehadaku.latest(parseInt(latestPage));
        return res.json({
          status: true,
          data: latestResult,
          page: parseInt(latestPage)
        });

      default:
        return res.status(400).json({
          status: false,
          message: 'Invalid endpoint. Available: search, detail, episode, stream, schedule, latest'
        });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}
