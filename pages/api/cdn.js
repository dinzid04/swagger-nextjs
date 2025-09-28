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

// CDN Providers
const CDN_PROVIDERS = {
  // File.io - Simple & reliable
  fileio: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('file', fileStream, originalFilename || `file_${uuidv4()}`);

    const response = await axios.post('https://file.io', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data && response.data.success) {
      return {
        url: response.data.link,
        provider: 'file.io',
        expires: response.data.expires || '14 days'
      };
    }
    throw new Error('File.io upload failed');
  },

  // tmpfiles.org - Alternative
  tmpfiles: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('files[]', fileStream);

    const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data?.data?.url) {
      return {
        url: response.data.data.url.replace('/dl/', '/'),
        provider: 'tmpfiles.org',
        expires: '1 hour'
      };
    }
    throw new Error('tmpfiles.org upload failed');
  },

  // FreeImage.host - Untuk gambar
  freeimage: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('source', fileStream);

    const response = await axios.post('https://freeimage.host/api/1/upload', formData, {
      headers: {
        ...formData.getHeaders(),
      },
      params: {
        key: '6d207e02198a847aa98d0a2a901485a5' // Free API key
      },
      timeout: 30000
    });

    if (response.data && response.data.image && response.data.image.url) {
      return {
        url: response.data.image.url,
        provider: 'freeimage.host',
        expires: 'permanent'
      };
    }
    throw new Error('FreeImage.host upload failed');
  },

  // Litterbox - Temporary storage
  litterbox: async (filePath, originalFilename) => {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('reqtype', 'fileupload');
    formData.append('time', '24h');
    formData.append('fileToUpload', fileStream, originalFilename || `file_${uuidv4()}`);

    const response = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data && response.data.startsWith('http')) {
      return {
        url: response.data,
        provider: 'litterbox',
        expires: '24 hours'
      };
    }
    throw new Error('Litterbox upload failed');
  }
};

// Upload ke CDN dengan fallback
async function uploadToCDN(filePath, originalFilename, preferredProvider = null) {
  const providers = preferredProvider ? 
    [preferredProvider, ...Object.keys(CDN_PROVIDERS).filter(p => p !== preferredProvider)] : 
    Object.keys(CDN_PROVIDERS);

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

// Parse form data
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB max
      filter: function ({ name, originalFilename, mimetype }) {
        // Terima semua jenis file
        return true;
      }
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

// Handler utama
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
    const providers = Object.keys(CDN_PROVIDERS).map(provider => ({
      name: provider,
      description: getProviderDescription(provider),
      maxFileSize: '50MB',
      features: getProviderFeatures(provider)
    }));

    return res.status(200).json({
      status: true,
      message: 'CDN Upload API',
      providers: providers,
      usage: {
        post: 'Upload file menggunakan multipart/form-data',
        parameters: {
          file: 'File yang akan diupload',
          provider: `Preferred CDN provider (optional): ${Object.keys(CDN_PROVIDERS).join(', ')}`
        }
      }
    });
  }

  // POST - Upload file
  if (req.method === 'POST') {
    let filePath = null;

    try {
      const { fields, files } = await parseFormData(req);
      
      const file = files.file?.[0] || files.file;
      const preferredProvider = fields.provider?.[0] || fields.provider;

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
      const uploadResult = await uploadToCDN(filePath, originalFilename, preferredProvider);

      // Clean up
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.status(200).json({
        status: true,
        message: 'File uploaded successfully',
        data: {
          filename: originalFilename,
          size: stats.size,
          mimetype: file.mimetype,
          url: uploadResult.url,
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

// Helper functions
function getProviderDescription(provider) {
  const descriptions = {
    fileio: 'Simple file sharing with 14 days expiration',
    tmpfiles: 'Temporary file hosting with 1 hour expiration',
    freeimage: 'Permanent image hosting (images only)',
    litterbox: 'Temporary file storage with 24 hours expiration'
  };
  return descriptions[provider] || 'File hosting service';
}

function getProviderFeatures(provider) {
  const features = {
    fileio: ['14 days expiration', 'Any file type', 'Simple API'],
    tmpfiles: ['1 hour expiration', 'Fast upload', 'Temporary storage'],
    freeimage: ['Permanent storage', 'Images only', 'No registration'],
    litterbox: ['24 hours expiration', 'Any file type', 'Catbox network']
  };
  return features[provider] || [];
}
