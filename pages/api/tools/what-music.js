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

// Upload ke CDN untuk audio
async function uploadAudioToCDN(fileBuffer, filename) {
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

// Process music recognition
async function recognizeMusic(audioUrl) {
  const apiUrl = `https://api.nekolabs.web.id/tools/what-music?audioUrl=${encodeURIComponent(audioUrl)}`;

  console.log('Calling music recognition API:', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 30000,
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

  let files; // Deklarasi files di scope handler

  try {
    // GET method - dengan audioUrl langsung
    if (req.method === 'GET') {
      const { audioUrl } = req.query;

      if (!audioUrl) {
        return res.status(400).json({
          status: false,
          message: 'Parameter audioUrl is required'
        });
      }

      if (typeof audioUrl !== 'string' || audioUrl.trim().length === 0) {
        return res.status(400).json({
          status: false,
          message: 'Parameter audioUrl must be a non-empty string'
        });
      }

      // Validasi URL format
      try {
        new URL(audioUrl.trim());
      } catch (error) {
        return res.status(400).json({
          status: false,
          message: 'Invalid audioUrl format'
        });
      }

      console.log('Recognizing music from URL:', audioUrl);

      // Process music recognition
      const result = await recognizeMusic(audioUrl.trim());

      return res.status(200).json({
        status: true,
        data: result,
        timestamp: new Date().toISOString()
      });

    } 
    // POST method - dengan upload file audio
    else if (req.method === 'POST') {
      const form = formidable({
        uploadDir: '/tmp',
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB max untuk audio
      });

      const [fields, parsedFiles] = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });

      files = parsedFiles;

      const audioFile = files.audio?.[0] || files.audio;
      const audioUrlFromField = fields.audioUrl?.[0] || fields.audioUrl;

      let finalAudioUrl;

      // Jika ada file upload, proses upload ke CDN
      if (audioFile) {
        // Validasi file type audio
        const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a'];
        if (!allowedMimes.includes(audioFile.mimetype)) {
          // Clean up file temporary
          if (fs.existsSync(audioFile.filepath)) {
            fs.unlinkSync(audioFile.filepath);
          }
          return res.status(400).json({
            status: false,
            message: `Invalid file type: ${audioFile.mimetype}. Supported: MP3, WAV, OGG, AAC, M4A`
          });
        }

        console.log('Uploading audio to CDN...');
        
        const fileBuffer = fs.readFileSync(audioFile.filepath);
        const filename = audioFile.originalFilename || `audio_${uuidv4()}.mp3`;
        
        // Upload ke CDN
        const cdnResult = await uploadAudioToCDN(fileBuffer, filename);
        
        // Clean up temporary file
        if (fs.existsSync(audioFile.filepath)) {
          fs.unlinkSync(audioFile.filepath);
        }

        finalAudioUrl = cdnResult.url;
        console.log('Audio uploaded to CDN:', finalAudioUrl);

      } 
      // Jika ada audioUrl dari field, gunakan itu
      else if (audioUrlFromField) {
        if (typeof audioUrlFromField !== 'string' || audioUrlFromField.trim().length === 0) {
          return res.status(400).json({
            status: false,
            message: 'Parameter audioUrl must be a non-empty string'
          });
        }

        try {
          new URL(audioUrlFromField.trim());
        } catch (error) {
          return res.status(400).json({
            status: false,
            message: 'Invalid audioUrl format'
          });
        }

        finalAudioUrl = audioUrlFromField.trim();
        console.log('Using provided audio URL:', finalAudioUrl);

      } else {
        return res.status(400).json({
          status: false,
          message: 'Either audio file or audioUrl is required'
        });
      }

      // Process music recognition
      console.log('Recognizing music...');
      const result = await recognizeMusic(finalAudioUrl);

      const responseData = {
        status: true,
        data: result,
        timestamp: new Date().toISOString()
      };

      // Tambahkan upload info jika menggunakan file upload
      if (audioFile) {
        responseData.uploadInfo = {
          cdnUrl: finalAudioUrl,
          provider: 'uguu.se/catbox.moe',
          filename: audioFile.originalFilename || `audio_${uuidv4()}.mp3`,
          method: 'file_upload'
        };
      } else {
        responseData.uploadInfo = {
          method: 'direct_url'
        };
      }

      return res.status(200).json(responseData);
    }

  } catch (error) {
    console.error('API Error:', error);
    
    // Clean up jika ada file temporary
    if (req.method === 'POST' && files) {
      const audioFile = files.audio?.[0] || files.audio;
      if (audioFile?.filepath && fs.existsSync(audioFile.filepath)) {
        fs.unlinkSync(audioFile.filepath);
      }
    }

    // Handle specific errors
    if (error.response) {
      if (error.response.status === 404) {
        return res.status(404).json({
          status: false,
          message: 'Music not recognized. Please try with a different audio sample.'
        });
      }
      
      if (error.response.status === 500) {
        return res.status(500).json({
          status: false,
          message: 'Music recognition service is currently unavailable.'
        });
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
