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
    formData.append('fileToUpload', fileBuffer, filename);

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

// Process Gemini 2.5 Flash request
async function processGemini(text, systemPrompt, imageUrl = null, sessionId) {
  let apiUrl;
  
  if (imageUrl) {
    // Dengan image
    const params = {
      text: encodeURIComponent(text),
      systemPrompt: encodeURIComponent(systemPrompt),
      imageUrl: encodeURIComponent(imageUrl),
      sessionId: encodeURIComponent(sessionId)
    };
    apiUrl = `https://api.nekolabs.web.id/text-generation/gemini/2.5-flash/v2?text=${params.text}&systemPrompt=${params.systemPrompt}&imageUrl=${params.imageUrl}&sessionId=${params.sessionId}`;
  } else {
    // Tanpa image (hanya text)
    const params = {
      text: encodeURIComponent(text),
      systemPrompt: encodeURIComponent(systemPrompt),
      sessionId: encodeURIComponent(sessionId)
    };
    apiUrl = `https://api.nekolabs.web.id/text-generation/gemini/2.5-flash/v2?text=${params.text}&systemPrompt=${params.systemPrompt}&sessionId=${params.sessionId}`;
  }

  console.log('Calling Gemini 2.5 Flash API:', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  return response.data;
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
    // GET method - dengan imageUrl langsung
    if (req.method === 'GET') {
      const { 
        text, 
        systemPrompt = 'you are a helpful assistant', 
        imageUrl, 
        sessionId 
      } = req.query;

      if (!text) {
        return res.status(400).json({
          success: false,
          message: 'Parameter text is required'
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Parameter sessionId is required'
        });
      }

      console.log('Processing Gemini 2.5 Flash with URL image...');
      const result = await processGemini(text, systemPrompt, imageUrl, sessionId);

      return res.status(200).json({
        ...result,
        sessionId: sessionId,
        hasImage: !!imageUrl,
        timestamp: new Date().toISOString()
      });

    } 
    // POST method - dengan upload file optional
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

      const text = fields.text?.[0] || fields.text;
      const systemPrompt = fields.systemPrompt?.[0] || fields.systemPrompt || 'you are a helpful assistant';
      const sessionId = fields.sessionId?.[0] || fields.sessionId;
      const imageFile = files.image?.[0] || files.image;

      if (!text) {
        return res.status(400).json({
          success: false,
          message: 'Parameter text is required'
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Parameter sessionId is required'
        });
      }

      let imageUrl = null;
      let uploadInfo = null;

      // Jika ada image file, upload ke CDN
      if (imageFile) {
        // Validasi file type
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimes.includes(imageFile.mimetype)) {
          return res.status(400).json({
            success: false,
            message: `Invalid file type: ${imageFile.mimetype}. Supported: JPG, JPEG, PNG, GIF, WEBP`
          });
        }

        console.log('Uploading image to CDN...');
        
        const fileBuffer = fs.readFileSync(imageFile.filepath);
        const filename = imageFile.originalFilename || `image_${uuidv4()}.jpg`;
        
        // Upload ke CDN
        const cdnResult = await uploadToCDN(fileBuffer, filename);
        
        // Clean up temporary file
        fs.unlinkSync(imageFile.filepath);

        imageUrl = cdnResult.url;
        uploadInfo = {
          cdnUrl: cdnResult.url,
          provider: cdnResult.provider,
          filename: filename
        };

        console.log('Image uploaded to CDN:', imageUrl);
      }

      console.log('Processing with Gemini 2.5 Flash...');
      const geminiResult = await processGemini(text, systemPrompt, imageUrl, sessionId);

      const responseData = {
        ...geminiResult,
        sessionId: sessionId,
        hasImage: !!imageUrl,
        timestamp: new Date().toISOString()
      };

      // Tambahkan uploadInfo jika ada image
      if (uploadInfo) {
        responseData.uploadInfo = uploadInfo;
      }

      return res.status(200).json(responseData);
    }

  } catch (error) {
    console.error('API Error:', error);
    
    // Clean up jika ada file temporary
    if (req.method === 'POST' && files?.image) {
      const imageFile = files.image?.[0] || files.image;
      if (imageFile?.filepath && fs.existsSync(imageFile.filepath)) {
        fs.unlinkSync(imageFile.filepath);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }

  return res.status(405).json({
    success: false,
    message: 'Method not allowed',
    timestamp: new Date().toISOString()
  });
}
