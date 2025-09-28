import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Simple file upload handler tanpa formidable
async function handleFileUpload(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let boundary = '';
    
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'];
        
        if (!contentType || !contentType.includes('multipart/form-data')) {
          reject(new Error('Content-Type must be multipart/form-data'));
          return;
        }
        
        boundary = contentType.split('boundary=')[1];
        const parts = buffer.toString().split(`--${boundary}`);
        
        const fields = {};
        let fileData = null;
        
        for (const part of parts) {
          if (part.includes('Content-Disposition')) {
            const nameMatch = part.match(/name="([^"]+)"/);
            
            if (nameMatch) {
              const name = nameMatch[1];
              
              if (part.includes('filename="')) {
                // File upload
                const filenameMatch = part.match(/filename="([^"]+)"/);
                const contentTypeMatch = part.match(/Content-Type: (.+)/);
                
                if (filenameMatch) {
                  const filename = filenameMatch[1];
                  const fileContent = part.split('\r\n\r\n')[1]?.split(`\r\n--${boundary}`)[0];
                  
                  if (fileContent) {
                    const tempFilename = `/tmp/${uuidv4()}_${filename}`;
                    fs.writeFileSync(tempFilename, fileContent);
                    
                    fileData = {
                      filepath: tempFilename,
                      originalFilename: filename,
                      contentType: contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream'
                    };
                  }
                }
              } else {
                // Regular field
                const value = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
                if (value) fields[name] = value;
              }
            }
          }
        }
        
        resolve({ fields, file: fileData });
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', reject);
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

  if (response.data && response.data.startsWith('http')) {
    return response.data;
  }
  throw new Error('Upload failed');
}

async function processNanoBanana(imageUrl, prompt) {
  const encodedImageUrl = encodeURIComponent(imageUrl);
  const encodedPrompt = encodeURIComponent(prompt);
  
  const apiUrl = `https://api.nekolabs.my.id/ai/gemini/nano-banana?prompt=${encodedPrompt}&imageUrl=${encodedImageUrl}`;

  const response = await axios.get(apiUrl, {
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
        return res.status(400).json({ 
          status: false, 
          message: 'Missing parameters' 
        });
      }

      const result = await processNanoBanana(imageUrl, prompt);
      return res.json({ status: true, result });

    } else if (req.method === 'POST') {
      const { fields, file } = await handleFileUpload(req);
      
      if (!file) {
        return res.status(400).json({ 
          status: false, 
          message: 'No file uploaded' 
        });
      }

      if (!fields.prompt) {
        // Clean up file
        if (fs.existsSync(file.filepath)) {
          fs.unlinkSync(file.filepath);
        }
        return res.status(400).json({ 
          status: false, 
          message: 'Prompt is required' 
        });
      }

      try {
        const cdnUrl = await uploadToCatbox(file.filepath, file.originalFilename);
        const result = await processNanoBanana(cdnUrl, fields.prompt);

        res.json({
          status: true,
          result: result,
          originalUpload: cdnUrl
        });
      } finally {
        // Clean up
        if (fs.existsSync(file.filepath)) {
          fs.unlinkSync(file.filepath);
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
