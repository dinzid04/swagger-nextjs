import axios from 'axios';
import cheerio from 'cheerio';

class Kuramanime {
  constructor() {
    this.u = 'https://v8.kuramanime.tel';
    this.targetEnv = 'data-kk';
    this.is = axios.create({
      baseURL: this.u,
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 16; NX729J) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.34 Mobile Safari/537.36',
        'origin': this.u,
        'referer': this.u,
      }
    });
  }

  async ex(a, b) {
    try {
      const c = cheerio.load(b.data)(`.row div[${this.targetEnv}]`).attr(this.targetEnv),
      d = await this.is.get(`/assets/js/${c}.js`),
      e = d.data.match(/= ({[\s\S]*?});/)?.[1], [j1, j2, j3] = [
        e.match(/MIX_AUTH_ROUTE_PARAM: '(.*?)',/)?.[1],
        e.match(/MIX_PAGE_TOKEN_KEY: '(.*?)',/)?.[1],
        e.match(/MIX_STREAM_SERVER_KEY: '(.*?)',/)?.[1]
      ], f = await this.is.get(`/assets/${j1}`), param = [
        [j2, f.data.trim()], [j3, 'kuramadrive'], ['page', '1']
      ], g = new URL(a);
      param.map(i => g.searchParams.set(...i));
      return g.toString();
    } catch(e) {
      throw "Failed to init url"
    }
  }

  async episode(url) {
    try {
      const t = await this.is.get(url), k = await this.ex(url, t),
      a = await axios.get(k, {
        headers: {
          cookie: t.headers['set-cookie']?.map(i => `${i};`).join('') || ''
        }
      }), $ = cheerio.load(a.data)
      
      const result = {
        id: $('input#animeId').attr('value'),
        postId: $('input#postId').attr('value'),
        title: $('title').text(),
        lastUpdated: $('.breadcrumb__links__v2 > span:nth-child(2)').text().split("\n")[0],
        batch: $('a.ep-button[type="batch"]').attr('href') || null,
        episode: [],
        download: [],
        video: []
      }
      
      $('a.ep-button[type="episode"]').each((_, l) => {
        if ($(l).text().trim()) result.episode.push({
          episode: $(l).text().trim(),
          url: $(l).attr('href')
        });
      });
            
      $('#animeDownloadLink').find('h6').each((_, l) => {
        let [ne, reso] = [
          $(l).next(), { type: $(l).text().trim(), links: [] }
        ]
        while (ne.length && !ne.is('h6') && !ne.is('br')) {
          if (ne.is('a')) {
            reso.links.push({
              name: ne.text().trim(),
              url: ne.attr('href'),
              recommended: ne.find('i.fa-fire').length > 0
            });
          }
          ne = ne.next();
        }
        if (reso.links.length > 0) {
          result.download.push(reso);
        }
      });
      
      $('#player source').each((_, l) => {
        result.video.push({
          quality: $(l).attr('size'),
          url: $(l).attr('src')
        });
      });
      
      return {
        status: true,
        data: result
      }
    } catch(e) {
      throw e
    }
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: 'Parameter url is required'
      });
    }

    const kurama = new Kuramanime();
    const result = await kurama.episode(url);

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}