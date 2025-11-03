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

async function uploadToCatbox(filePath, originalFilename) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  const fileName = originalFilename || `image_${uuidv4()}.jpg`;
  const fileStream = fs.createReadStream(filePath);
  
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', fileStream, fileName);

  const response = await axios.post('https://catbox.moe/user/api.php', formData, {
    headers: formData.getHeaders(),
    timeout: 30000
  });

  return response.data;
}

async function processNanoBanana(imageUrl, prompt) {
  const encodedImageUrl = encodeURIComponent(imageUrl);
  const encodedPrompt = encodeURIComponent(prompt);
  
  const apiUrl = `https://api.nekolabs.web.id/ai/gemini/nano-banana?prompt=${encodedPrompt}&imageUrl=${encodedImageUrl}`;

  const response = await axios.get(apiUrl, {
    timeout: 60000
  });

  return response.data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET method - sudah bekerja
  if (req.method === 'GET') {
    const { prompt, imageUrl } = req.query;
    
    if (!prompt || !imageUrl) {
      return res.status(400).json({ 
        status: false, 
        message: 'Parameter prompt dan imageUrl diperlukan' 
      });
    }

    try {
      const result = await processNanoBanana(imageUrl, prompt);
      return res.json({ status: true, result });
    } catch (error) {
      return res.status(500).json({ 
        status: false, 
        message: error.message 
      });
    }
  }

  // POST method - yang perlu diperbaiki
  if (req.method === 'POST') {
    try {
      console.log('Processing POST request...');
      
      const { fields, files } = await parseFormData(req);
      console.log('Parsed fields:', fields);
      console.log('Parsed files:', files);

      const prompt = fields.prompt;
      const imageFile = files.image;

      if (!prompt) {
        return res.status(400).json({ 
          status: false, 
          message: 'Prompt diperlukan' 
        });
      }

      if (!imageFile) {
        return res.status(400).json({ 
          status: false, 
          message: 'File gambar diperlukan' 
        });
      }

      // Handle array vs single file
      const actualImageFile = Array.isArray(imageFile) ? imageFile[0] : imageFile;
      
      if (!actualImageFile.filepath) {
        return res.status(400).json({ 
          status: false, 
          message: 'File path tidak valid' 
        });
      }

      console.log('Uploading to Catbox...');
      const cdnUrl = await uploadToCatbox(actualImageFile.filepath, actualImageFile.originalFilename);
      console.log('Uploaded to:', cdnUrl);

      console.log('Processing with Nano Banana...');
      const result = await processNanoBanana(cdnUrl, prompt);
      console.log('Processing result:', result);

      // Clean up
      if (fs.existsSync(actualImageFile.filepath)) {
        fs.unlinkSync(actualImageFile.filepath);
      }

      return res.json({
        status: true,
        result: result,
        originalUpload: cdnUrl
      });

    } catch (error) {
      console.error('POST Error:', error);
      
      // Clean up jika ada error
      if (files?.image) {
        const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
        if (imageFile?.filepath && fs.existsSync(imageFile.filepath)) {
          fs.unlinkSync(imageFile.filepath);
        }
      }

      return res.status(500).json({ 
        status: false, 
        message: error.message 
      });
    }
  }

  return res.status(405).json({ 
    status: false, 
    message: 'Method tidak diizinkan' 
  });
}
