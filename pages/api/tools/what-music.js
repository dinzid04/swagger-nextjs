import axios from 'axios';

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

  try {
    let audioUrl;

    // Handle GET request
    if (req.method === 'GET') {
      const { audioUrl: url } = req.query;
      audioUrl = url;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { audioUrl: url } = req.body;
      audioUrl = url;
    } 
    else {
      return res.status(405).json({
        status: false,
        message: 'Method not allowed'
      });
    }

    // Validasi parameter
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

  } catch (error) {
    console.error('API Error:', error);
    
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
      }
