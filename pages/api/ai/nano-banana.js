import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseFormData(req) {
  const formidable = require('formidable');
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

async function uploadToCDN(filePath) {
  try {
    // Try tmpfiles.org first
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, path.basename(filePath));

    const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    if (response.data && response.data.data && response.data.data.url) {
      return response.data.data.url.replace('/dl/', '/');
    }
    throw new Error('Upload to tmpfiles.org failed');
  } catch (error) {
    console.log('Trying file.io as fallback...');
    
    // Fallback to file.io
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, path.basename(filePath));

    const response = await axios.post('https://file.io', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000
    });

    if (response.data && response.data.success && response.data.link) {
      return response.data.link;
    }
    throw new Error('All CDN upload failed');
  }
}

async function processNanoBanana(imageUrl, prompt) {
  const encodedImageUrl = encodeURIComponent(imageUrl);
  const encodedPrompt = encodeURIComponent(prompt);
  
  const apiUrl = `https://api.nekolabs.my.id/ai/gemini/nano-banana?prompt=${encodedPrompt}&imageUrl=${encodedImageUrl}`;

  const response = await axios.get(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json',
    },
    timeout: 60000
  });

  if (response.data && response.data.status === true && response.data.result) {
    return response.data.result;
  }
  throw new Error('Invalid response from Nano Banana API');
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { prompt, imageUrl } = req.query;

      if (!prompt || !imageUrl) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt dan imageUrl diperlukan'
        });
      }

      const result = await processNanoBanana(imageUrl, prompt);
      
      return res.status(200).json({
        status: true,
        result: result
      });

    } else if (req.method === 'POST') {
      const { fields, files } = await parseFormData(req);
      const prompt = Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt;
      const imageFile = files.image;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt diperlukan'
        });
      }

      if (!imageFile) {
        return res.status(400).json({
          status: false,
          message: 'File gambar diperlukan'
        });
      }

      const imagePath = imageFile.filepath;
      let cdnUrl, result;

      try {
        // Upload to CDN
        cdnUrl = await uploadToCDN(imagePath);
        
        // Process with Nano Banana
        result = await processNanoBanana(cdnUrl, prompt);

      } finally {
        // Clean up temporary file
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      return res.status(200).json({
        status: true,
        result: result,
        originalUpload: cdnUrl
      });

    } else {
      return res.status(405).json({
        status: false,
        message: 'Method tidak diizinkan'
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal server error'
    });
  }
}
