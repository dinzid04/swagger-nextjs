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

// Process Qwen Image request
async function processQwenImage(prompt, ratio = '1:1') {
  // Validasi ratio
  const validRatios = ['1:1', '16:9', '9:16'];
  if (!validRatios.includes(ratio)) {
    throw new Error(`Invalid ratio. Must be one of: ${validRatios.join(', ')}`);
  }

  const params = {
    prompt: encodeURIComponent(prompt),
    ratio: encodeURIComponent(ratio)
  };

  const apiUrl = `https://api.nekolabs.web.id/ai/qwen/image?prompt=${params.prompt}&ratio=${params.ratio}`;

  console.log('Calling Qwen Image API:', apiUrl);

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
    const mimeType = response.headers['content-type'] || 'image/webp';
    
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
    // GET method - generate image langsung
    if (req.method === 'GET') {
      const { prompt, ratio = '1:1' } = req.query;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt is required'
        });
      }

      console.log('Generating Qwen image with prompt:', prompt);
      const result = await processQwenImage(prompt, ratio);

      // Convert result image to base64
      const base64Result = await urlToBase64(result.result);

      return res.status(200).json({
        status: true,
        data: result,
        images: {
          url: result.result,
          base64: base64Result
        },
        parameters: {
          prompt: prompt,
          ratio: ratio
        },
        timestamp: new Date().toISOString()
      });

    } 
    // POST method - dengan upload reference image (optional)
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
      const ratio = fields.ratio?.[0] || fields.ratio || '1:1';
      const imageFile = files.image?.[0] || files.image;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: 'Parameter prompt is required'
        });
      }

      let referenceImageUrl = null;
      let uploadInfo = null;

      // Jika ada image file, upload ke CDN dan tambahkan ke prompt
      if (imageFile) {
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

        console.log('Uploading reference image to CDN...');
        
        const fileBuffer = fs.readFileSync(imageFile.filepath);
        const filename = imageFile.originalFilename || `reference_${uuidv4()}.jpg`;
        
        // Upload ke CDN
        const cdnResult = await uploadToCDN(fileBuffer, filename);
        
        // Clean up temporary file
        if (fs.existsSync(imageFile.filepath)) {
          fs.unlinkSync(imageFile.filepath);
        }

        referenceImageUrl = cdnResult.url;
        uploadInfo = {
          referenceImage: {
            cdnUrl: cdnResult.url,
            provider: cdnResult.provider,
            filename: filename
          }
        };

        console.log('Reference image uploaded to CDN:', referenceImageUrl);
        
        // Modify prompt untuk include reference image
        const enhancedPrompt = `${prompt} [reference: ${referenceImageUrl}]`;
        console.log('Enhanced prompt:', enhancedPrompt);
        
        // Process dengan enhanced prompt
        console.log('Generating Qwen image with reference...');
        const qwenResult = await processQwenImage(enhancedPrompt, ratio);

        // Convert result image to base64
        const base64Result = await urlToBase64(qwenResult.result);

        const responseData = {
          status: true,
          data: qwenResult,
          parameters: {
            prompt: prompt,
            ratio: ratio,
            hasReferenceImage: true
          },
          images: {
            url: qwenResult.result,
            base64: base64Result
          },
          timestamp: new Date().toISOString()
        };

        // Tambahkan uploadInfo jika ada reference image
        if (uploadInfo) {
          responseData.uploadInfo = uploadInfo;
        }

        return res.status(200).json(responseData);

      } else {
        // Tanpa reference image
        console.log('Generating Qwen image without reference...');
        const qwenResult = await processQwenImage(prompt, ratio);

        // Convert result image to base64
        const base64Result = await urlToBase64(qwenResult.result);

        return res.status(200).json({
          status: true,
          data: qwenResult,
          parameters: {
            prompt: prompt,
            ratio: ratio,
            hasReferenceImage: false
          },
          images: {
            url: qwenResult.result,
            base64: base64Result
          },
          timestamp: new Date().toISOString()
        });
      }
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

    // Handle specific errors dari Qwen API
    if (error.response && error.response.status === 500) {
      return res.status(500).json({
        status: false,
        message: 'Qwen Image API is currently unavailable. Please try again later.'
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
