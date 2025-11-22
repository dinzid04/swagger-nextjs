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

  async detail(url, page = 0) {
    try {
      const wb = await this.is.get(url, {
        params: { page }
      }), $ = cheerio.load(wb.data), [tp, episode, related, tags] = [
        ...Array.from({ length: 4 }).map(i => ([]))
      ]
      
      const detail = {
        title: $('.anime__details__title h3').text().trim(),
        alternativeTitle: $('.anime__details__title span').text().trim(),
        rating: $('.anime__details__pic__mobile .ep').text().trim(),
        img: $('.anime__details__pic__mobile').attr('data-setbg'),
        sinopsis: $('#synopsisField').text().trim()
      };
      
      $('.anime__details__widget ul li .row').each((_, l) => {
        let [t1, t2, t3] = [
          $(l).find('.col-3 span').text().replace(/:/,'').toLowerCase(), $(l).find('.col-9')
        ]
        if ($(t2).find('a').length >= 2) {
          t3 = [];
          $(t2).find('a').each((_, h) => {
            t3.push($(h).text().trim())
          });
          if (t1 === 'tayang') t3 = t3.join(' ');
        } else {
          t3 = t2.text().trim()
        }
        detail[t1] = t3;
      });
      
      const strEps = cheerio.load($('#episodeLists').attr('data-content') || '');
      strEps('.btn-danger').each((_, el) => {
        const title = $(el).text().trim()
        const link = $(el).attr('href')
        tp.push({ title, episode: parseInt(title.replace(/\D/g,'')), link })
      })
      
      tp.reverse().forEach((ep, id) => episode.push({
        index: id + 1,
        ...ep
      }));
      
      $('.anime__details__review .breadcrumb__links__v2 div a').each((_, l) => {
        related.push({
          title: $(l).text().slice(2).trim(),
          url: $(l).attr('href')
        });
      });
      
      $('#tagSection .breadcrumb__links__v2__tags a').each((_, l) => {
        tags.push($(l).text().trim().replace(',', ''));
      });
      
      const nextPage = strEps.html().match(/page=(.*?)" (.*)fa-forward/)?.[1]
      
      return {
        status: true,
        data: {
          id: $('input#animeId').attr('value'),
          detail,
          episode,
          related,
          tags,
          pagination: {
            hasNextEpisodePage: !!nextPage,
            nextEpisodePage: nextPage,
            currentPage: page
          }
        }
      };
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
    const { url, page = 0 } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: 'Parameter url is required'
      });
    }

    const kurama = new Kuramanime();
    const result = await kurama.detail(url, parseInt(page));

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}