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

  async schedule(day, page = 1) {
    try {
      const f = await this.is.get('/schedule', {
        params: {
          scheduled_day: day,
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
          currentPage: page,
          day: day
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
    const { day = 'monday', page = 1 } = req.query;

    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(day.toLowerCase())) {
      return res.status(400).json({
        status: false,
        message: `Invalid day. Must be one of: ${validDays.join(', ')}`
      });
    }

    const kurama = new Kuramanime();
    const result = await kurama.schedule(day, parseInt(page));

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}