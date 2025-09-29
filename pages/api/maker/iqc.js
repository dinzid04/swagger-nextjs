import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let messageText;

    // Handle GET request
    if (req.method === 'GET') {
      const { text } = req.query;
      messageText = text;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { text } = req.body;
      messageText = text;
    } 
    else {
      return res.status(405).json({
        status: false,
        message: 'Method not allowed'
      });
    }

    // Validasi parameter
    if (!messageText) {
      return res.status(400).json({
        status: false,
        message: 'Parameter text is required'
      });
    }

    if (typeof messageText !== 'string' || messageText.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Parameter text must be a non-empty string'
      });
    }

    // Generate waktu Jakarta
    const time = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());

    // Generate battery percentage random
    const batteryPercentage = Math.floor(Math.random() * 100) + 1;

    // Build API URL
    const apiUrl = `https://brat.siputzx.my.id/iphone-quoted?time=${encodeURIComponent(time)}&batteryPercentage=${batteryPercentage}&carrierName=INDOSAT&messageText=${encodeURIComponent(messageText.trim())}&emojiStyle=apple`;

    console.log('Generating iPhone quoted image with text:', messageText);

    // Get image from external API
    const response = await axios.get(apiUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const imageBuffer = response.data;

    // Handle different response based on method
    if (req.method === 'GET') {
      // Untuk GET: Upload ke CDN dulu, return JSON dengan URL
      try {
        // Coba tmpfiles.org dulu
        let cdnUrl;
        let provider = 'tmpfiles.org';
        
        try {
          cdnUrl = await uploadToTmpfiles(imageBuffer, `iphone-quoted-${uuidv4()}.jpg`);
          console.log('Success with tmpfiles.org');
        } catch (tmpfilesError) {
          console.log('Tmpfiles failed, trying uguu.se...');
          // Fallback ke uguu.se
          cdnUrl = await uploadToUguu(imageBuffer, `iphone-quoted-${uuidv4()}.jpg`);
          provider = 'uguu.se';
          console.log('Success with uguu.se');
        }
        
        return res.status(200).json({
          status: true,
          message: 'iPhone quoted image generated successfully',
          data: {
            url: cdnUrl,
            text: messageText,
            provider: provider,
            timestamp: new Date().toISOString(),
            info: {
              time: time,
              battery: `${batteryPercentage}%`,
              carrier: 'INDOSAT'
            }
          }
        });

      } catch (uploadError) {
        console.error('All CDN upload failed:', uploadError);
        // Return error JSON
        return res.status(500).json({
          status: false,
          message: 'Failed to upload image to CDN: ' + uploadError.message
        });
      }

    } else if (req.method === 'POST') {
      // Untuk POST: Return image langsung
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', 'inline; filename="iphone-quoted.jpg"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageBuffer);
    }

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Failed to generate iPhone quoted image'
    });
  }
}

// Function untuk upload ke tmpfiles.org
async function uploadToTmpfiles(imageBuffer, filename) {
  const formData = new FormData();
  formData.append('files[]', imageBuffer, { filename });

  const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
    headers: formData.getHeaders(),
    timeout: 30000
  });

  console.log('Tmpfiles response:', response.data);

  if (response.data?.success && response.data?.data?.url) {
    const downloadUrl = response.data.data.url;
    const directUrl = downloadUrl.replace('/dl/', '/');
    return directUrl;
  }
  
  throw new Error('Upload to tmpfiles.org failed: ' + JSON.stringify(response.data));
}

// Function untuk upload ke uguu.se
async function uploadToUguu(imageBuffer, filename) {
  const formData = new FormData();
  formData.append('files[]', imageBuffer, { filename });

  const response = await axios.post('https://uguu.se/upload.php', formData, {
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  });

  console.log('Uguu response:', response.data);

  if (response.data && response.data.files && response.data.files[0]) {
    return response.data.files[0].url;
  }
  
  throw new Error('Upload to uguu.se failed: ' + JSON.stringify(response.data));
}
