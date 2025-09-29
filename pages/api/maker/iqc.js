import axios from 'axios';

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

    // Set response headers untuk image
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline; filename="iphone-quoted.jpg"');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Send image buffer
    return res.send(response.data);

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Failed to generate iPhone quoted image'
    });
  }
}
