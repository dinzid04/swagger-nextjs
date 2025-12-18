import axios from 'axios';
import formidable from 'formidable';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Upload ke CDN untuk result image
async function uploadToCDN(fileBuffer, filename) {
  // Coba uguu.se dulu
  try {
    const formData = new FormData();
    formData.append('files[]', fileBuffer, { filename });

    const response = await axios.post('https://uguu.se/upload.php', formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    if (response.data && response.data.files && response.data.files[0]) {
      return { url: response.data.files[0].url, provider: 'uguu.se' };
    }
  } catch (error) {
    console.log('Uguu failed, trying catbox...');
  }

  // Fallback ke catbox.moe
  try {
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', fileBuffer, { filename });

    const response = await axios.post('https://catbox.moe/user/api.php', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data && response.data.startsWith('http')) {
      return { url: response.data, provider: 'catbox.moe' };
    }
  } catch (error) {
    console.log('Catbox also failed');
  }

  throw new Error('All CDN providers failed');
}

// Convert image URL to base64
async function urlToBase64(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const mimeType = response.headers['content-type'] || 'image/png';
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to convert URL to base64:', error.message);
    return null;
  }
}

// Process Animagine XL 4.0
async function processAnimagine(prompt, ratio = '1:1') {
  const params = {
    prompt: encodeURIComponent(prompt),
    ratio: encodeURIComponent(ratio)
  };

  const apiUrl = `https://api.nekolabs.web.id/image-generation/animagine/xl-4.0?prompt=${params.prompt}&ratio=${params.ratio}`;

  console.log('Calling Animagine XL 4.0 API:', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 90000, // 90 detik karena proses lama
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  return {
    ...response.data,
    model: 'animagine-xl-4.0'
  };
}

// Process NSFW Illustrous
async function processNSFWIllustrous(prompt, ratio = '1:1') {
  const params = {
    prompt: encodeURIComponent(prompt),
    ratio: encodeURIComponent(ratio)
  };

  const apiUrl = `https://api.nekolabs.web.id/image-generation/wai-nsfw-illustrous/v12?prompt=${params.prompt}&ratio=${params.ratio}`;

  console.log('Calling NSFW Illustrous API:', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 90000, // 90 detik karena proses lama
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  return {
    ...response.data,
    model: 'wai-nsfw-illustrous-v12'
  };
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
    const { model = 'animagine' } = req.query;

    // GET method
    if (req.method === 'GET') {
      const { prompt, ratio = '1:1' } = req.query;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt is required'
        });
      }

      console.log(`Processing ${model} with prompt:`, prompt);

      let result;
      if (model === 'nsfw') {
        result = await processNSFWIllustrous(prompt, ratio);
      } else {
        result = await processAnimagine(prompt, ratio);
      }

      // Convert result image to base64
      const base64Result = await urlToBase64(result.result);

      return res.status(200).json({
        status: true,
        data: result,
        images: {
          url: result.result,
          base64: base64Result
        },
        model: result.model,
        timestamp: new Date().toISOString()
      });

    } 
    // POST method - untuk custom processing jika needed
    else if (req.method === 'POST') {
      const form = formidable({
        uploadDir: '/tmp',
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024,
      });

      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });

      const prompt = fields.prompt?.[0] || fields.prompt;
      const ratio = fields.ratio?.[0] || fields.ratio || '1:1';
      const modelType = fields.model?.[0] || fields.model || 'animagine';

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt is required'
        });
      }

      console.log(`Processing ${modelType} with prompt:`, prompt);

      let result;
      if (modelType === 'nsfw') {
        result = await processNSFWIllustrous(prompt, ratio);
      } else {
        result = await processAnimagine(prompt, ratio);
      }

      // Convert result image to base64
      const base64Result = await urlToBase64(result.result);

      return res.status(200).json({
        status: true,
        data: result,
        images: {
          url: result.result,
          base64: base64Result
        },
        model: result.model,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal server error'
    });
  }

  return res.status(405).json({
    status: false,
    message: 'Method not allowed'
  });
        }
