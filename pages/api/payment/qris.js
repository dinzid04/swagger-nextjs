import axios from 'axios';
import FormData from 'form-data';

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
      message: 'QRIS Generator API',
      usage: {
        post: 'Generate QRIS dan upload ke CDN',
        parameters: {
          amount: 'Amount in string (required)',
          qris_statis: 'QRIS static data (required)'
        }
      },
      example: {
        request: {
          amount: "10000",
          qris_statis: "XXXE3353COM.GO-JEK.WWWVDXXX44553463.CO.QRIS.WWXXXX4664XX.MERCHANT ENTE, XX65646XXXXTY5YY"
        },
        response: {
          status: true,
          message: "QRIS generated and uploaded successfully",
          data: {
            qris_url: "https://tmpfiles.org/123456/qris_image.jpg",
            amount: "10000",
            timestamp: "2024-01-01T00:00:00.000Z"
          }
        }
      }
    });
  }

  // POST - Generate QRIS
  if (req.method === 'POST') {
    try {
      const { amount, qris_statis } = req.body;

      // Validasi input
      if (!amount || !qris_statis) {
        return res.status(400).json({
          status: false,
          message: 'Parameters amount and qris_statis are required'
        });
      }

      if (typeof amount !== 'string' || typeof qris_statis !== 'string') {
        return res.status(400).json({
          status: false,
          message: 'Amount and qris_statis must be strings'
        });
      }

      console.log('Generating QRIS...');

      // Request ke API QRIS
      const qrisResponse = await axios.post('https://qrisku.my.id/api', {
        amount: amount,
        qris_statis: qris_statis
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
      });

      console.log('QRIS API response:', qrisResponse.data);

      if (qrisResponse.data.status !== 'success' || !qrisResponse.data.qris_base64) {
        throw new Error('Failed to generate QRIS: ' + (qrisResponse.data.message || 'Unknown error'));
      }

      // Convert base64 ke buffer
      const base64Data = qrisResponse.data.qris_base64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      console.log('Uploading QRIS image to CDN...');

      // Upload ke CDN
      const cdnUrl = await uploadToCDN(imageBuffer, `qris_${Date.now()}.jpg`);

      return res.status(200).json({
        status: true,
        message: 'QRIS generated and uploaded successfully',
        data: {
          qris_url: cdnUrl,
          amount: amount,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('QRIS API Error:', error);
      
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `QRIS Service Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        errorMessage = 'Cannot connect to QRIS service';
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

// Function untuk upload ke CDN
async function uploadToCDN(imageBuffer, filename) {
  // Coba tmpfiles.org dulu
  try {
    const formData = new FormData();
    formData.append('files[]', imageBuffer, { filename });

    const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data?.success && response.data?.data?.url) {
      const downloadUrl = response.data.data.url;
      const directUrl = downloadUrl.replace('/dl/', '/');
      return directUrl;
    }
  } catch (error) {
    console.log('Tmpfiles failed, trying uguu...');
  }

  // Fallback ke uguu.se
  try {
    const formData = new FormData();
    formData.append('files[]', imageBuffer, { filename });

    const response = await axios.post('https://uguu.se/upload.php', formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    if (response.data && response.data.files && response.data.files[0]) {
      return response.data.files[0].url;
    }
  } catch (error) {
    console.log('Uguu also failed');
  }

  throw new Error('All CDN providers failed');
}
