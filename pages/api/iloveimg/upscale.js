import axios from "axios";
import cheerio from "cheerio";
import path from "path";
import FormData from "form-data";
import formidable from "formidable";
import fs from "fs";

// Simple mime type detector
function getMimeType(buffer) {
  const signature = buffer.slice(0, 4).toString('hex');
  
  const signatures = {
    'ffd8ffe0': 'image/jpeg',
    'ffd8ffe1': 'image/jpeg',
    'ffd8ffe2': 'image/jpeg',
    '89504e47': 'image/png',
    '47494638': 'image/gif',
    '52494646': 'image/webp',
    '49492a00': 'image/tiff',
    '4d4d002a': 'image/tiff'
  };
  
  return signatures[signature] || 'application/octet-stream';
}

function getFileExtension(mimeType) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/tiff': 'tiff'
  };
  
  return extensions[mimeType] || 'jpg';
}

class UpscaleImageAPI {
  constructor() {
    this.api = null;
    this.server = null;
    this.taskId = null;
    this.token = null;
  }

  async getTaskId() {
    try {
      const { data: html } = await axios.get("https://www.iloveimg.com/upscale-image", {
        headers: {
          "Accept": "*/*",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Connection": "keep-alive",
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
        },
      });

      const tokenMatches = html.match(/(ey[a-zA-Z0-9?%-_/]+)/g);
      if (!tokenMatches || tokenMatches.length < 2) {
        throw new Error("Token not found.");
      }
      this.token = tokenMatches[1];

      const configMatch = html.match(/var ilovepdfConfig = ({.*?});/s);
      if (!configMatch) {
        throw new Error("Server configuration not found.");
      }
      const configJson = JSON.parse(configMatch[1]);
      const servers = configJson.servers;
      if (!Array.isArray(servers) || servers.length === 0) {
        throw new Error("Server list is empty.");
      }

      this.server = servers[Math.floor(Math.random() * servers.length)];
      this.taskId = html.match(/ilovepdfConfig\.taskId\s*=\s*['"](\w+)['"]/)?.[1];

      this.api = axios.create({
        baseURL: `https://${this.server}.iloveimg.com`,
        headers: {
          "Accept": "*/*",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Authorization": `Bearer ${this.token}`,
          "Connection": "keep-alive",
          "Origin": "https://www.iloveimg.com",
          "Referer": "https://www.iloveimg.com/",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-site",
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
        },
      });

      if (!this.taskId) throw new Error("Task ID not found!");

      return { taskId: this.taskId, server: this.server, token: this.token };
    } catch (error) {
      throw new Error(`Failed to get Task ID: ${error.message}`);
    }
  }

  async uploadFromUrl(imageUrl) {
    if (!this.taskId || !this.api) {
      throw new Error("Task ID or API not available. Run getTaskId() first.");
    }

    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
        },
        timeout: 15000,
      });

      const buffer = Buffer.from(imageResponse.data, "binary");
      const mimeType = getMimeType(buffer);
      
      if (!mimeType.startsWith("image/")) {
        throw new Error("File type is not a supported image.");
      }

      const urlPath = new URL(imageUrl).pathname;
      const ext = getFileExtension(mimeType);
      const fileName = path.basename(urlPath) || `image.${ext}`;

      const form = new FormData();
      form.append("name", fileName);
      form.append("chunk", "0");
      form.append("chunks", "1");
      form.append("task", this.taskId);
      form.append("preview", "1");
      form.append("pdfinfo", "0");
      form.append("pdfforms", "0");
      form.append("pdfresetforms", "0");
      form.append("v", "web.0");
      form.append("file", buffer, { filename: fileName, contentType: mimeType });

      const response = await this.api.post("/v1/upload", form, {
        headers: form.getHeaders(),
        data: form,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  async uploadFromFile(fileBuffer, fileName, mimeType) {
    if (!this.taskId || !this.api) {
      throw new Error("Task ID or API not available. Run getTaskId() first.");
    }

    try {
      if (!mimeType.startsWith("image/")) {
        throw new Error("File type is not a supported image.");
      }

      const form = new FormData();
      form.append("name", fileName);
      form.append("chunk", "0");
      form.append("chunks", "1");
      form.append("task", this.taskId);
      form.append("preview", "1");
      form.append("pdfinfo", "0");
      form.append("pdfforms", "0");
      form.append("pdfresetforms", "0");
      form.append("v", "web.0");
      form.append("file", fileBuffer, { filename: fileName, contentType: mimeType });

      const response = await this.api.post("/v1/upload", form, {
        headers: form.getHeaders(),
        data: form,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  async upscaleImage(serverFilename, scale = 2) {
    if (!this.taskId || !this.api) {
      throw new Error("Task ID or API not available. Run getTaskId() first.");
    }

    if (scale !== 2 && scale !== 4) {
      throw new Error("Scale can only be 2 or 4.");
    }

    try {
      const form = new FormData();
      form.append("task", this.taskId);
      form.append("server_filename", serverFilename);
      form.append("scale", scale.toString());

      const response = await this.api.post("/v1/upscale", form, {
        headers: form.getHeaders(),
        data: form,
        responseType: "arraybuffer",
      });

      return response.data;
    } catch (error) {
      console.error("Error detail:", error.response ? error.response.data : error);
      throw new Error(`Failed to perform upscaling: ${error.message}`);
    }
  }
}

async function scrapeUpscaleFromUrl(imageUrl, scale) {
  const upscaler = new UpscaleImageAPI();
  await upscaler.getTaskId();

  const uploadResult = await upscaler.uploadFromUrl(imageUrl);
  if (!uploadResult || !uploadResult.server_filename) {
    throw new Error("Failed to upload image.");
  }

  const imageBuffer = await upscaler.upscaleImage(uploadResult.server_filename, scale);
  return imageBuffer;
}

async function scrapeUpscaleFromFile(fileBuffer, fileName, mimeType, scale) {
  const upscaler = new UpscaleImageAPI();
  await upscaler.getTaskId();

  const uploadResult = await upscaler.uploadFromFile(fileBuffer, fileName, mimeType);
  if (!uploadResult || !uploadResult.server_filename) {
    throw new Error("Failed to upload image.");
  }

  const imageBuffer = await upscaler.upscaleImage(uploadResult.server_filename, scale);
  return imageBuffer;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET method - from URL
    if (req.method === 'GET') {
      const { image, scale = '2' } = req.query;

      if (!image) {
        return res.status(400).json({
          status: false,
          error: "Parameter 'image' is required."
        });
      }

      if (typeof image !== 'string' || image.trim().length === 0) {
        return res.status(400).json({
          status: false,
          error: "Parameter 'image' must be a non-empty string."
        });
      }

      const scaleNum = parseInt(scale);
      if (scaleNum !== 2 && scaleNum !== 4) {
        return res.status(400).json({
          status: false,
          error: "Parameter 'scale' must be 2 or 4."
        });
      }

      try {
        new URL(image.trim());
      } catch (error) {
        return res.status(400).json({
          status: false,
          error: "Invalid URL format"
        });
      }

      console.log('Processing upscale from URL:', image);
      const imageBuffer = await scrapeUpscaleFromUrl(image.trim(), scaleNum);
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', 'inline; filename="upscaled_image.jpg"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      return res.send(imageBuffer);

    } 
    // POST method - from file upload
    else if (req.method === 'POST') {
      const form = formidable({
        uploadDir: '/tmp',
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
      });

      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });

      const imageFile = files.image?.[0] || files.image;
      const scale = fields.scale?.[0] || fields.scale || '2';

      if (!imageFile) {
        return res.status(400).json({
          status: false,
          error: "File 'image' is required in multipart/form-data."
        });
      }

      const scaleNum = parseInt(scale);
      if (scaleNum !== 2 && scaleNum !== 4) {
        return res.status(400).json({
          status: false,
          error: "Parameter 'scale' must be 2 or 4."
        });
      }

      // Validasi file type
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimes.includes(imageFile.mimetype)) {
        return res.status(400).json({
          status: false,
          error: `Invalid file type: ${imageFile.mimetype}. Supported: JPG, JPEG, PNG, GIF, WEBP`
        });
      }

      const fileBuffer = fs.readFileSync(imageFile.filepath);
      const fileName = imageFile.originalFilename || `image.${path.extname(imageFile.filepath)}`;

      console.log('Processing upscale from file:', fileName);
      const imageBuffer = await scrapeUpscaleFromFile(fileBuffer, fileName, imageFile.mimetype, scaleNum);

      // Clean up temporary file
      fs.unlinkSync(imageFile.filepath);

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', 'inline; filename="upscaled_image.jpg"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      return res.send(imageBuffer);
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: false,
      error: error.message || 'An error occurred while processing the image.'
    });
  }

  return res.status(405).json({
    status: false,
    error: 'Method not allowed'
  });
}
