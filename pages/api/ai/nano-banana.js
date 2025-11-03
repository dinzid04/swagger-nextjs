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

// Upload ke CDN dengan priority: uguu -> catbox
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

// Process Nano Banana request
async function processNanoBanana(prompt, imageUrl) {
  const params = {
    prompt: encodeURIComponent(prompt),
    imageUrl: encodeURIComponent(imageUrl)
  };

  const apiUrl = `https://api.nekolabs.web.id/ai/gemini/nano-banana?prompt=${params.prompt}&imageUrl=${params.imageUrl}`;

  console.log('Calling Nano Banana API:', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  return response.data;
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

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let files; // Deklarasi files di scope handler

  try {
    // GET method - dengan imageUrl langsung
    if (req.method === 'GET') {
      const { prompt, imageUrl } = req.query;

      if (!prompt || !imageUrl) {
        return res.status(400).json({
          status: false,
          message: 'Parameters prompt and imageUrl are required'
        });
      }

      console.log('Processing Nano Banana with URL image...');
      const result = await processNanoBanana(prompt, imageUrl);

      // Convert result image to base64
      const base64Result = await urlToBase64(result.result);

      return res.status(200).json({
        status: true,
        data: result,
        images: {
          url: result.result,
          base64: base64Result
        },
        timestamp: new Date().toISOString()
      });

    } 
    // POST method - dengan upload file
    else if (req.method === 'POST') {
      const form = formidable({
        uploadDir: '/tmp',
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
      });

      const [fields, parsedFiles] = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });

      files = parsedFiles; // Assign ke variabel files di scope handler

      const prompt = fields.prompt?.[0] || fields.prompt;
      const imageFile = files.image?.[0] || files.image;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt is required'
        });
      }

      if (!imageFile) {
        return res.status(400).json({
          status: false,
          message: 'Image file is required for POST method'
        });
      }

      // Validasi file type
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimes.includes(imageFile.mimetype)) {
        // Clean up file temporary
        if (fs.existsSync(imageFile.filepath)) {
          fs.unlinkSync(imageFile.filepath);
        }
        return res.status(400).json({
          status: false,
          message: `Invalid file type: ${imageFile.mimetype}. Supported: JPG, JPEG, PNG, GIF, WEBP`
        });
      }

      console.log('Uploading image to CDN...');
      
      const fileBuffer = fs.readFileSync(imageFile.filepath);
      const filename = imageFile.originalFilename || `image_${uuidv4()}.jpg`;
      
      // Upload ke CDN
      const cdnResult = await uploadToCDN(fileBuffer, filename);
      
      // Clean up temporary file
      if (fs.existsSync(imageFile.filepath)) {
        fs.unlinkSync(imageFile.filepath);
      }

      console.log('Image uploaded to CDN:', cdnResult.url);
      console.log('Processing with Nano Banana...');

      // Process dengan Nano Banana
      const nanoResult = await processNanoBanana(prompt, cdnResult.url);

      // Convert result image to base64
      const base64Result = await urlToBase64(nanoResult.result);

      return res.status(200).json({
        status: true,
        data: nanoResult,
        uploadInfo: {
          originalImage: {
            cdnUrl: cdnResult.url,
            provider: cdnResult.provider,
            filename: filename
          }
        },
        images: {
          url: nanoResult.result,
          base64: base64Result
        },
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    
    // Clean up jika ada file temporary
    if (req.method === 'POST' && files) {
      const imageFile = files.image?.[0] || files.image;
      if (imageFile?.filepath && fs.existsSync(imageFile.filepath)) {
        fs.unlinkSync(imageFile.filepath);
      }
    }

    // Handle specific errors dari Nano Banana API
    if (error.response && error.response.status === 500) {
      return res.status(500).json({
        status: false,
        message: 'Nano Banana API is currently unavailable. Please try again later.'
      });
    }

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
