import axios from "axios";
import * as cheerio from "cheerio";
import FormData from "form-data";

class SnapTikClient {
  constructor(config = {}) {
    this.config = {
      baseURL: "https://snaptik.app",
      ...config,
    };

    this.axios = axios.create({
      ...this.config,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
        "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "Upgrade-Insecure-Requests": "1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
      timeout: 30000,
    });
  }

  async get_token() {
    try {
      const { data } = await this.axios.get("/en2");
      const $ = cheerio.load(data);
      const token = $("input[name=\"token\"]").val();
      console.log("Token found:", token ? "Yes" : "No");
      return token;
    } catch (error) {
      console.error("Error getting token:", error.message);
      return null;
    }
  }

  async get_script(url) {
    try {
      const form = new FormData();
      const token = await this.get_token();

      if (!token) {
        throw new Error("Failed to get token");
      }

      form.append("url", url);
      form.append("lang", "en2");
      form.append("token", token);

      const { data } = await this.axios.post("/abc2.php", form, {
        headers: {
          ...form.getHeaders(),
          "origin": "https://snaptik.app",
          "referer": "https://snaptik.app/en2",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
      });
      
      console.log("Script response length:", data.length);
      return data;
    } catch (error) {
      console.error("Error getting script:", error.message);
      throw error;
    }
  }

  async eval_script(script1) {
    try {
      const script2 = await new Promise((resolve, reject) => {
        try {
          Function("eval", script1)(resolve);
        } catch (error) {
          reject(error);
        }
      });

      return new Promise((resolve, reject) => {
        let html = "";
        const mockObjects = {
          $: () => ({
            remove() {},
            style: { display: "" },
            get innerHTML() {
              return html;
            },
            set innerHTML(t) {
              html = t;
            },
          }),
          app: { showAlert: reject },
          document: { getElementById: () => ({ src: "" }) },
          fetch: (a) => {
            resolve({ html, oembed_url: a });
            return { json: () => ({ thumbnail_url: "" }) };
          },
          gtag: () => 0,
          Math: { round: () => 0 },
          XMLHttpRequest: function () {
            return { open() {}, send() {} };
          },
          window: { location: { hostname: "snaptik.app" } },
        };

        try {
          Function(
            ...Object.keys(mockObjects),
            script2
          )(...Object.values(mockObjects));
        } catch (error) {
          console.log("Eval error:", error.message);
          reject(error);
        }
      });
    } catch (error) {
      console.error("Error in eval_script:", error.message);
      throw error;
    }
  }

  async parse_html(html) {
    try {
      const $ = cheerio.load(html);
      const isVideo = !$("div.render-wrapper").length;

      console.log("Is video:", isVideo);

      const thumbnail = $(".avatar").attr("src") || $("#thumbnail").attr("src");
      const title = $(".video-title").text().trim();
      const creator = $(".info span").text().trim();

      console.log("Thumbnail:", thumbnail ? "Found" : "Not found");
      console.log("Title:", title);
      console.log("Creator:", creator);

      if (isVideo) {
        const hdButton = $("div.video-links > button[data-tokenhd]");
        const hdTokenUrl = hdButton.data("tokenhd");
        const backupUrl = hdButton.data("backup");

        console.log("HD Token URL:", hdTokenUrl);
        console.log("Backup URL:", backupUrl);

        const videoUrls = [
          backupUrl,
          ...$("div.video-links > a:not(a[href=\"/\"])")
            .map((_, elem) => $(elem).attr("href"))
            .get()
            .filter((url) => url && !url.includes("play.google.com"))
            .map((x) => (x.startsWith("/") ? this.config.baseURL + x : x)),
        ].filter(Boolean);

        console.log("Video URLs found:", videoUrls.length);

        return {
          type: "video",
          urls: videoUrls,
          metadata: {
            title: title || null,
            description: title || null,
            thumbnail: thumbnail || null,
            creator: creator || null,
          },
        };
      } else {
        const photos = $("div.columns > div.column > div.photo")
          .map((_, elem) => ({
            urls: [
              $(elem).find("img[alt=\"Photo\"]").attr("src"),
              $(elem)
                .find("a[data-event=\"download_albumPhoto_photo\"]")
                .attr("href"),
            ],
          }))
          .get();

        console.log("Photos found:", photos.length);

        return {
          type: photos.length === 1 ? "photo" : "slideshow",
          urls:
            photos.length === 1
              ? photos[0].urls
              : photos.map((photo) => photo.urls),
          metadata: {
            title: title || null,
            description: title || null,
            thumbnail: thumbnail || null,
            creator: creator || null,
          },
        };
      }
    } catch (error) {
      console.error("Error parsing HTML:", error.message);
      throw error;
    }
  }

  async process(url) {
    try {
      console.log("Starting process for URL:", url);
      
      const script = await this.get_script(url);
      console.log("Script obtained");
      
      const { html, oembed_url } = await this.eval_script(script);
      console.log("Script evaluated, HTML length:", html.length);
      
      const result = await this.parse_html(html);
      console.log("HTML parsed successfully");

      return {
        original_url: url,
        oembed_url,
        type: result.type,
        urls: result.urls,
        metadata: result.metadata,
      };
    } catch (error) {
      console.error("Process error:", error.message);
      return {
        original_url: url,
        error: error.message,
      };
    }
  }
}

async function scrapeTiktok(url) {
  try {
    const client = new SnapTikClient();
    return await client.process(url);
  } catch (error) {
    console.error("Tiktok scrape error:", error);
    return null;
  }
}

// Handler API sederhana
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let tiktokUrl;

    // Handle GET request
    if (req.method === 'GET') {
      const { url } = req.query;
      tiktokUrl = url;
    } 
    // Handle POST request  
    else if (req.method === 'POST') {
      const { url } = req.body;
      tiktokUrl = url;
    } 
    else {
      return res.status(405).json({
        status: false,
        message: 'Method not allowed'
      });
    }

    // Validasi URL
    if (!tiktokUrl) {
      return res.status(400).json({
        status: false,
        message: 'URL parameter is required'
      });
    }

    if (typeof tiktokUrl !== 'string' || tiktokUrl.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: 'URL must be a non-empty string'
      });
    }

    // Validasi format URL TikTok
    if (!tiktokUrl.includes('tiktok.com') && !tiktokUrl.includes('vt.tiktok.com')) {
      return res.status(400).json({
        status: false,
        message: 'Invalid TikTok URL'
      });
    }

    console.log('Processing TikTok URL:', tiktokUrl);

    // Process TikTok URL
    const result = await scrapeTiktok(tiktokUrl.trim());
    
    if (!result || result.error) {
      return res.status(500).json({
        status: false,
        message: result?.error || 'Failed to process TikTok URL'
      });
    }

    // Success response
    return res.status(200).json({
      status: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal Server Error'
    });
  }
}
