import axios from 'axios';

// Tokens API (bisa diatur via environment variable)
const tokens = process.env.MOVANEST_TOKENS 
  ? process.env.MOVANEST_TOKENS.split(',') 
  : ["movanest-keySKYQ0YJX5N"];

const DELAY_ON_LIMIT = 5000;

async function reactToWhatsAppPost(postUrl, emojis) {
  for (const token of tokens) {
    try {
      const response = await axios.get(
        "https://movanest.zone.id/user-coin",
        {
          params: {
            user_api_key: token,
            postUrl,
            emojis
          },
          timeout: 500000
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.message || error.message;
      
      if (status === 402 || msg.toLowerCase().includes("limit")) {
        await new Promise(r => setTimeout(r, DELAY_ON_LIMIT));
        continue;
      }
      
      if (status === 401) {
        continue;
      }
      
      return {
        success: false,
        status,
        error: error.response?.data || msg
      };
    }
  }
  
  return {
    success: false,
    status: 402,
    error: "All tokens are limited or exhausted"
  };
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
    let postUrl, emojis;

    // Handle GET request
    if (req.method === 'GET') {
      const { url, emoji } = req.query;
      postUrl = url;
      emojis = emoji;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { url, emoji } = req.body;
      postUrl = url;
      emojis = emoji;
    } 
    else {
      return res.status(405).json({
        status: false,
        message: 'Method not allowed'
      });
    }

    // Validasi parameter
    if (!postUrl) {
      return res.status(400).json({
        status: false,
        message: 'Parameter url (postUrl) is required'
      });
    }

    if (!emojis) {
      return res.status(400).json({
        status: false,
        message: 'Parameter emoji is required'
      });
    }

    console.log('Processing WhatsApp reaction:', { postUrl, emojis });

    // Process reaction
    const result = await reactToWhatsAppPost(postUrl, emojis);

    if (result.success) {
      const data = result.data;
      
      return res.status(200).json({
        status: true,
        message: 'Reaction sent successfully',
        data: {
          emojis: data.emojis || emojis,
          postUrl: data.postUrl || postUrl,
          remainingCoins: data.remainingCoins,
          response: data
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(result.status || 500).json({
      status: false,
      message: 'Failed to send reaction',
      error: result.error,
      statusCode: result.status
    });

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal server error'
    });
  }
}
