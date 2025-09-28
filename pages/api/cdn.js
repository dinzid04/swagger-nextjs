import axios from 'axios';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Hanya pakai tmpfiles.org
async function uploadToTmpfiles(filePath, originalFilename) {
  const FormData = require('form-data');
  const formData = new FormData();
  const fileStream = fs.createReadStream(filePath);
  
  // Gunakan field name 'files[]' untuk tmpfiles.org
  formData.append('files[]', fileStream);

  const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  });

  console.log('Tmpfiles response:', response.data);

  if (response.data?.success && response.data?.data?.url) {
    // Convert dari download URL ke direct URL
    const downloadUrl = response.data.data.url;
    const directUrl = downloadUrl.replace('/dl/', '/');
    
    return {
      url: directUrl,
      download_url: downloadUrl,
      provider: 'tmpfiles.org',
      expires: '1 hour'
    };
  }
  throw new Error('Tmpfiles.org upload failed: ' + JSON.stringify(response.data));
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Info tentang tmpfiles
  if (req.method === 'GET') {
    return res.status(200).json({
      status: true,
      message: 'Tmpfiles.org CDN API',
      provider: 'tmpfiles.org',
      features: [
        '1 hour expiration',
        'Any file type', 
        'Max 50MB file size',
        'Direct download links'
      ],
      usage: {
        post: 'Upload file menggunakan multipart/form-data',
        field_name: 'file'
      }
    });
  }

  // POST - Upload file ke tmpfiles.org
  if (req.method === 'POST') {
    let filePath = null;

    try {
      const form = formidable({
        uploadDir: '/tmp',
        keepExtensions: true,
        maxFileSize: 50 * 1024 * 1024, // 50MB max
      });

      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });

      const file = files.file?.[0] || files.file;
      
      if (!file) {
        return res.status(400).json({
          status: false,
          message: 'File is required'
        });
      }

      filePath = file.filepath;
      const originalFilename = file.originalFilename || `file_${uuidv4()}${path.extname(file.filepath)}`;

      console.log('Uploading to tmpfiles.org:', originalFilename);

      // Validasi file size
      const stats = fs.statSync(filePath);
      if (stats.size > 50 * 1024 * 1024) {
        return res.status(400).json({
          status: false,
          message: 'File too large. Maximum size is 50MB'
        });
      }

      // Upload ke tmpfiles.org
      const uploadResult = await uploadToTmpfiles(filePath, originalFilename);

      // Clean up
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.status(200).json({
        status: true,
        message: 'File uploaded successfully to tmpfiles.org',
        data: {
          filename: originalFilename,
          size: stats.size,
          mimetype: file.mimetype,
          url: uploadResult.url, // Direct URL
          download_url: uploadResult.download_url, // Download URL
          provider: uploadResult.provider,
          expires: uploadResult.expires,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      // Clean up jika error
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      console.error('Upload error:', error.message);
      return res.status(500).json({
        status: false,
        message: error.message || 'Upload to tmpfiles.org failed'
      });
    }
  }

  return res.status(405).json({
    status: false,
    message: 'Method not allowed'
  });
}
