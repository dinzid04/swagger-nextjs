import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024,
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

async function uploadToCatbox(filePath) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  const fileStream = fs.createReadStream(filePath);
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', fileStream, path.basename(filePath));

  const response = await axios.post('https://catbox.moe/user/api.php', formData, {
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  });

  if (response.data && response.data.startsWith('http')) {
    return response.data;
  }
  throw new Error('Upload failed: ' + response.data);
}

async function uploadToLitterbox(filePath) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  const fileStream = fs.createReadStream(filePath);
  formData.append('reqtype', 'fileupload');
  formData.append('time', '1h');
  formData.append('fileToUpload', fileStream, path.basename(filePath));

  const response = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', formData, {
    headers: {
      ...formData.getHeaders(),
    },
    timeout: 30000
  });

  if (response.data && response.data.startsWith('http')) {
    return response.data;
  }
  throw new Error('Upload failed: ' + response.data);
}

async function processNanoBanana(imageUrl, prompt) {
  const encodedImageUrl = encodeURIComponent(imageUrl);
  const encodedPrompt = encodeURIComponent(prompt);
  
  const apiUrl = `https://api.nekolabs.my.id/ai/gemini/nano-banana?prompt=${encodedPrompt}&imageUrl=${encodedImageUrl}`;

  const response = await axios.get(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 60000
  });

  if (response.data?.status === true && response.data?.result) {
    return response.data.result;
  }
  throw new Error('API response error');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { prompt, imageUrl } = req.query;
      if (!prompt || !imageUrl) {
        return res.status(400).json({ status: false, message: 'Parameter required' });
      }

      const result = await processNanoBanana(imageUrl, prompt);
      return res.json({ status: true, result });

    } else if (req.method === 'POST') {
      const { fields, files } = await parseFormData(req);
      const prompt = fields.prompt;
      const imageFile = files.image;

      if (!prompt || !imageFile) {
        return res.status(400).json({ status: false, message: 'Prompt and image required' });
      }

      const imagePath = imageFile.filepath;
      let cdnUrl, result;

      try {
        // Try Catbox first
        cdnUrl = await uploadToCatbox(imagePath);
        
        // Fallback to Litterbox for large files or if Catbox fails
        const stats = fs.statSync(imagePath);
        if (stats.size > 5 * 1024 * 1024) {
          cdnUrl = await uploadToLitterbox(imagePath);
        }
        
        result = await processNanoBanana(cdnUrl, prompt);

        res.json({
          status: true,
          result: result,
          originalUpload: cdnUrl
        });
      } catch (error) {
        throw error;
      } finally {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
    } else {
      res.status(405).json({ status: false, message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: false, message: error.message });
  }
}
