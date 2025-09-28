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
  
  // Generate nama file yang aman untuk Catbox
  const fileExt = path.extname(originalFilename || 'image.jpg');
  const fileName = `image_${uuidv4()}${fileExt}`;
  
  const fileStream = fs.createReadStream(filePath);
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', fileStream, fileName);

  console.log('Uploading to Catbox...', fileName);

  const response = await axios.post('https://catbox.moe/user/api.php', formData, {
    headers: formData.getHeaders(),
    timeout: 30000
  });

  console.log('Catbox response:', response.data);

  if (response.data && response.data.startsWith('http')) {
    return response.data;
  }
  
  throw new Error('Upload to Catbox failed: ' + response.data);
}

async function processNanoBanana(imageUrl, prompt) {
  const encodedImageUrl = encodeURIComponent(imageUrl);
  const encodedPrompt = encodeURIComponent(prompt);
  
  const apiUrl = `https://api.nekolabs.my.id/ai/gemini/nano-banana?prompt=${encodedPrompt}&imageUrl=${encodedImageUrl}`;

  console.log('Processing with Nano Banana...', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 60000
  });

  console.log('Nano Banana response:', response.data);

  if (response.data && response.data.status === true && response.data.result) {
    return response.data.result;
  }
  
  throw new Error('Nano Banana processing failed');
}

// Fungsi untuk convert tmpfiles.org URL ke Catbox (jika perlu)
async function convertToCatbox(tmpfilesUrl) {
  try {
    // Download gambar dari tmpfiles.org
    const response = await axios.get(tmpfilesUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    // Simpan sementara
    const tempPath = `/tmp/temp_${uuidv4()}.jpg`;
    fs.writeFileSync(tempPath, response.data);
    
    // Upload ke Catbox
    const catboxUrl = await uploadToCatbox(tempPath, 'converted_image.jpg');
    
    // Clean up
    fs.unlinkSync(tempPath);
    
    return catboxUrl;
  } catch (error) {
    throw new Error('Failed to convert to Catbox: ' + error.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET method - convert result ke Catbox
  if (req.method === 'GET') {
    const { prompt, imageUrl, useCatbox = 'true' } = req.query;
    
    if (!prompt || !imageUrl) {
      return res.status(400).json({ 
        status: false, 
        message: 'Parameter prompt dan imageUrl diperlukan' 
      });
    }

    try {
      const result = await processNanoBanana(imageUrl, prompt);
      
      // Jika ingin menggunakan Catbox untuk result juga
      if (useCatbox === 'true' && result.includes('tmpfiles.org')) {
        console.log('Converting tmpfiles.org result to Catbox...');
        const catboxResult = await convertToCatbox(result);
        
        return res.json({ 
          status: true, 
          result: catboxResult,
          originalResult: result,
          message: 'Result converted to Catbox'
        });
      }
      
      return res.json({ status: true, result });
      
    } catch (error) {
      return res.status(500).json({ 
        status: false, 
        message: error.message 
      });
    }
  }

  // POST method - gunakan Catbox untuk semua
  if (req.method === 'POST') {
    try {
      console.log('Processing POST request with Catbox...');
      
      const { fields, files } = await parseFormData(req);
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

      const actualImageFile = Array.isArray(imageFile) ? imageFile[0] : imageFile;
      
      if (!actualImageFile.filepath) {
        return res.status(400).json({ 
          status: false, 
          message: 'File path tidak valid' 
        });
      }

      // 1. Upload gambar input ke Catbox
      console.log('Uploading input image to Catbox...');
      const inputCatboxUrl = await uploadToCatbox(actualImageFile.filepath, actualImageFile.originalFilename);
      console.log('Input image uploaded to Catbox:', inputCatboxUrl);

      // 2. Process dengan Nano Banana
      console.log('Processing with Nano Banana...');
      const nanoBananaResult = await processNanoBanana(inputCatboxUrl, prompt);
      console.log('Nano Banana raw result:', nanoBananaResult);

      let finalResult = nanoBananaResult;
      let converted = false;

      // 3. Convert result ke Catbox jika masih pakai tmpfiles.org
      if (nanoBananaResult.includes('tmpfiles.org')) {
        console.log('Converting result from tmpfiles.org to Catbox...');
        finalResult = await convertToCatbox(nanoBananaResult);
        converted = true;
        console.log('Result converted to Catbox:', finalResult);
      }

      // Clean up
      if (fs.existsSync(actualImageFile.filepath)) {
        fs.unlinkSync(actualImageFile.filepath);
      }

      return res.json({
        status: true,
        result: finalResult,
        originalUpload: inputCatboxUrl,
        converted: converted,
        message: converted ? 'Result converted to Catbox' : 'Result already using Catbox'
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
