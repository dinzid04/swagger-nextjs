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

// Process Nano Banana request - nekolabs
async function processNanoBananaNeko(prompt, imageUrl) {
  const params = {
    prompt: encodeURIComponent(prompt),
    imageUrl: encodeURIComponent(imageUrl)
  };

  const apiUrl = `https://api.nekolabs.web.id/image-generation/nano-banana/v5?prompt=${params.prompt}&imageUrl=${params.imageUrl}`;

  console.log('Calling Nano Banana API (nekolabs):', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  return {
    ...response.data,
    provider: 'nekolabs'
  };
}

// Process Nano Banana request - zenzxz (fallback)
async function processNanoBananaZenz(prompt, imageBuffer, filename) {
  console.log('Calling Nano Banana API (zenzxz)...');

  const formData = new FormData();
  formData.append('image', imageBuffer, { filename });
  formData.append('prompt', prompt);

  const response = await axios.post('https://api.zenzxz.my.id/api/maker/imagedit', formData, {
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 60000,
    responseType: 'arraybuffer'
  });

  // zenzxz return image langsung, bukan JSON
  return {
    success: true,
    result: response.data, // image buffer
    provider: 'zenzxz'
  };
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

// Convert buffer to base64
function bufferToBase64(buffer, mimeType = 'image/png') {
  try {
    const base64 = Buffer.from(buffer, 'binary').toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to convert buffer to base64:', error.message);
    return null;
  }
}

// Main processor dengan fallback
async function processNanoBanana(prompt, imageUrl, imageBuffer = null, filename = null) {
  // Coba nekolabs dulu
  try {
    console.log('Trying nekolabs API...');
    const result = await processNanoBananaNeko(prompt, imageUrl);
    return result;
  } catch (error) {
    console.log('Nekolabs failed, trying zenzxz...');
    
    // Fallback ke zenzxz jika ada image buffer (untuk POST)
    if (imageBuffer && filename) {
      try {
        const result = await processNanoBananaZenz(prompt, imageBuffer, filename);
        return result;
      } catch (zenzError) {
        throw new Error(`Both APIs failed: nekolabs - ${error.message}, zenzxz - ${zenzError.message}`);
      }
    } else {
      throw new Error(`Nekolabs failed and no fallback available: ${error.message}`);
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

  let files;

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

      let imageUrlResult, base64Result;

      if (result.provider === 'nekolabs') {
        // nekolabs return URL
        imageUrlResult = result.result;
        base64Result = await urlToBase64(result.result);
      } else {
        // zenzxz return buffer (tidak mungkin di GET, tapi siapin aja)
        imageUrlResult = null;
        base64Result = bufferToBase64(result.result);
      }

      return res.status(200).json({
        status: true,
        data: result,
        images: {
          url: imageUrlResult,
          base64: base64Result
        },
        provider: result.provider,
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

      files = parsedFiles;

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
        if (fs.existsSync(imageFile.filepath)) {
          fs.unlinkSync(imageFile.filepath);
        }
        return res.status(400).json({
          status: false,
          message: `Invalid file type: ${imageFile.mimetype}. Supported: JPG, JPEG, PNG, GIF, WEBP`
        });
      }

      console.log('Uploading image to CDN for nekolabs...');
      
      const fileBuffer = fs.readFileSync(imageFile.filepath);
      const filename = imageFile.originalFilename || `image_${uuidv4()}.jpg`;
      
      // Upload ke CDN untuk nekolabs
      const cdnResult = await uploadToCDN(fileBuffer, filename);

      console.log('Processing with Nano Banana...');

      // Process dengan fallback
      const nanoResult = await processNanoBanana(prompt, cdnResult.url, fileBuffer, filename);

      let imageUrlResult, base64Result;

      if (nanoResult.provider === 'nekolabs') {
        // nekolabs return URL
        imageUrlResult = nanoResult.result;
        base64Result = await urlToBase64(nanoResult.result);
      } else {
        // zenzxz return buffer langsung
        imageUrlResult = null;
        base64Result = bufferToBase64(nanoResult.result);
      }

      // Clean up temporary file
      if (fs.existsSync(imageFile.filepath)) {
        fs.unlinkSync(imageFile.filepath);
      }

      const responseData = {
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
          url: imageUrlResult,
          base64: base64Result
        },
        provider: nanoResult.provider,
        timestamp: new Date().toISOString()
      };

      return res.status(200).json(responseData);
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
