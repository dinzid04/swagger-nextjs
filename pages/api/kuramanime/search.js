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

  async search(query, page = 1, order_by = "latest") {
    try {
      const f = await this.is.get(`/anime`, {
        params: {
          order_by,
          search: query,
          page,
          need_json: true
        }
      }).then(i => i.data)
      
      const res = {
        status: true,
        data: f.animes.data.map(p => ({
          url: this.u+`/anime/${p.id}/${p.slug}`,
          ...p
        })),
        pagination: {
          hasNextPage: !!f.animes.next_page_url,
          nextPage: f.animes.next_page_url?.split('page=')?.[1] || null,
          currentPage: page
        }
      }
      return res
    } catch (error) {
      throw error;
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
    const { query, page = 1, order_by = "latest" } = req.query;

    if (!query) {
      return res.status(400).json({
        status: false,
        message: 'Parameter query is required'
      });
    }

    const kurama = new Kuramanime();
    const result = await kurama.search(query, parseInt(page), order_by);

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}