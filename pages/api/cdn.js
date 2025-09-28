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

// CDN Providers - hanya tmpfiles dan uguu
const CDN_PROVIDERS = {
  // Tmpfiles.org
  tmpfiles: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('files[]', fileStream);

    const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data?.success && response.data?.data?.url) {
      const downloadUrl = response.data.data.url;
      const directUrl = downloadUrl.replace('/dl/', '/');
      
      return {
        url: directUrl,
        download_url: downloadUrl,
        provider: 'tmpfiles.org',
        expires: '1 hour'
      };
    }
    throw new Error('Tmpfiles.org upload failed');
  },

  // Uguu.se - Alternative yang bagus
  uguu: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('files[]', fileStream);

    const response = await axios.post('https://uguu.se/upload.php', formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    if (response.data && response.data.files && response.data.files[0]) {
      return {
        url: response.data.files[0].url,
        provider: 'uguu.se',
        expires: '1 hour'
      };
    }
    throw new Error('Uguu.se upload failed');
  },

  // Catbox.moe - Backup
  catbox: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', fileStream, originalFilename || `file_${uuidv4()}`);

    const response = await axios.post('https://catbox.moe/user/api.php', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data && response.data.startsWith('http')) {
      return {
        url: response.data,
        provider: 'catbox.moe',
        expires: 'permanent'
      };
    }
    throw new Error('Catbox upload failed');
  }
};

// Upload ke CDN dengan prioritas tmpfiles -> uguu -> catbox
async function uploadToCDN(filePath, originalFilename) {
  const providers = ['tmpfiles', 'uguu', 'catbox'];

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider}...`);
      const result = await CDN_PROVIDERS[provider](filePath, originalFilename);
      console.log(`Success with ${provider}:`, result.url);
      return result;
    } catch (error) {
      console.log(`${provider} failed:`, error.message);
      continue;
    }
  }
  
  throw new Error('All CDN providers failed');
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Info tentang CDN providers
  if (req.method === 'GET') {
    const providers = [
      {
        name: 'tmpfiles',
        description: 'Temporary file hosting with 1 hour expiration',
        maxFileSize: '50MB',
        features: ['1 hour expiration', 'Any file type', 'Fast upload']
      },
      {
        name: 'uguu', 
        description: 'Simple file sharing with 1 hour expiration',
        maxFileSize: '50MB',
        features: ['1 hour expiration', 'Any file type', 'Simple API']
      },
      {
        name: 'catbox',
        description: 'Permanent file storage',
        maxFileSize: '50MB', 
        features: ['Permanent storage', 'Any file type', 'Reliable']
      }
    ];

    return res.status(200).json({
      status: true,
      message: 'CDN Upload API - Tmpfiles & Uguu',
      providers: providers,
      priority: ['tmpfiles', 'uguu', 'catbox'],
      usage: {
        post: 'Upload file menggunakan multipart/form-data',
        field_name: 'file'
      }
    });
  }

  // POST - Upload file
  if (req.method === 'POST') {
    let filePath = null;

    try {
      const form = formidable({
        uploadDir: '/tmp',
        keepExtensions: true,
        maxFileSize: 50 * 1024 * 1024,
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

      console.log('Uploading file:', originalFilename);

      // Validasi file size
      const stats = fs.statSync(filePath);
      if (stats.size > 50 * 1024 * 1024) {
        return res.status(400).json({
          status: false,
          message: 'File too large. Maximum size is 50MB'
        });
      }

      // Upload ke CDN
      const uploadResult = await uploadToCDN(filePath, originalFilename);

      // Clean up
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.status(200).json({
        status: true,
        message: `File uploaded successfully to ${uploadResult.provider}`,
        data: {
          filename: originalFilename,
          size: stats.size,
          mimetype: file.mimetype,
          url: uploadResult.url,
          download_url: uploadResult.download_url || uploadResult.url,
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

      console.error('Upload error:', error);
      return res.status(500).json({
        status: false,
        message: error.message || 'Upload failed'
      });
    }
  }

  return res.status(405).json({
    status: false,
    message: 'Method not allowed'
  });
}
