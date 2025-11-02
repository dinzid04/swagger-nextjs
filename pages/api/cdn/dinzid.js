import axios from 'axios';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Info tentang API
  if (req.method === 'GET') {
    return res.status(200).json({
      status: true,
      message: 'DinzID CDN Upload API',
      usage: {
        post: 'Upload file menggunakan multipart/form-data',
        field_name: 'file',
        max_file_size: '50MB',
        supported_types: 'All file types'
      },
      example: {
        curl: 'curl -X POST "https://your-domain.com/api/cdn/dinzid" -F "file=@/path/to/file.jpg"'
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
        maxFileSize: 50 * 1024 * 1024, // 50MB
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

      console.log('Uploading to DinzID CDN...');

      // Upload ke DinzID CDN
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      formData.append('file', fileStream);

      const response = await axios.post('https://cdn.dinzid.biz.id/upload', formData, {
        headers: {
          ...formData.getHeaders(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
      });

      console.log('DinzID CDN response:', response.data);

      // Clean up temporary file
      fs.unlinkSync(filePath);

      if (response.data && response.data.url) {
        return res.status(200).json({
          status: true,
          message: 'File uploaded successfully to DinzID CDN',
          data: {
            url: response.data.url,
            filename: file.originalFilename,
            size: file.size,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        throw new Error('Invalid response from DinzID CDN');
      }

    } catch (error) {
      // Clean up jika error
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      console.error('Upload error:', error);
      
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `DinzID CDN Error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`;
      } else if (error.request) {
        errorMessage = 'Cannot connect to DinzID CDN';
      }

      return res.status(500).json({
        status: false,
        message: errorMessage
      });
    }
  }

  return res.status(405).json({
    status: false,
    message: 'Method not allowed'
  });
}
