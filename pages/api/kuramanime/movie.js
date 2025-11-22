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

  async movie(page = 1) {
    try {
      const f = await this.is.get('/', {
        params: {
          page,
          need_json: true
        }
      }).then(i => i.data)
      
      const res = {
        status: true,
        data: f.movieAnimes.data.map(p => ({
          url: this.u+`/anime/${p.id}/${p.slug}`,
          ...p
        })),
        pagination: {
          hasNextPage: !!f.movieAnimes.next_page_url,
          nextPage: f.movieAnimes.next_page_url?.split('page=')?.[1] || null,
          currentPage: page
        }
      }
      return res
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
    const { page = 1 } = req.query;

    const kurama = new Kuramanime();
    const result = await kurama.movie(parseInt(page));

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}