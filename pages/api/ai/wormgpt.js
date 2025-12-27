import axios from "axios";

const WormGPTAPI = {
  baseURL: "http://145.79.11.101:5000",
  
  headers: {
    "user-agent": "NB Android/1.0.0",
    "accept": "*/*",
    "content-type": "application/json",
    "origin": "http://145.79.11.101:5000",
    "referer": "http://145.79.11.101:5000/"
  },

  config: {
    retry: 2,
    failMax: 4,
    resetMs: 10000,
    respMax: 2 * 1024 * 1024,
    outMax: 8000,
    mode: "pretty"
  },

  stats: {
    fails: 0,
    until: 0
  },

  cleanResponse: (text, mode = null) => {
    if (typeof text !== "string") return "";
    mode = mode || WormGPTAPI.config.mode;

    let output = text.replace(/<span class="wormgpt-prefix">[^<]*<\/span>:/g, "");

    if (mode === "minimal") return output.trim();
    if (mode === "medium") return output.replace(/\s+$/g, "").trim();
    if (mode === "strict")
      return output.replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim();

    if (mode === "pretty")
      return output
        .replace(/(#+\s.*)/g, "\n$1\n")
        .replace(/(\n|^)(\d+\.|\-|\*)\s+/g, "\n$2 ")
        .replace(/```/g, "\n```\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return output.trim();
  },

  sendMessage: async (message) => {
    // Reset stats jika sudah lebih dari 1 menit
    if (WormGPTAPI.stats.until && WormGPTAPI.stats.until < Date.now() - 60000) {
      WormGPTAPI.stats.until = 0;
    }

    // Validasi input
    if (!message || typeof message !== "string" || !message.trim()) {
      return {
        success: false,
        error: "Inputnya mana??"
      };
    }

    // Cek jika sedang dalam cooldown
    if (Date.now() < WormGPTAPI.stats.until) {
      return {
        success: false,
        error: "Breaker On!!",
        detail: "Kebanyakan error bree, coba lagi nanti ae yakk..."
      };
    }

    const payload = { 
      message: message.trim().slice(0, 3000) 
    };

    // Retry mechanism
    for (let attempt = 1; attempt <= WormGPTAPI.config.retry; attempt++) {
      try {
        const response = await axios.post(
          `${WormGPTAPI.baseURL}/api/chat`,
          payload,
          {
            headers: WormGPTAPI.headers,
            timeout: 30000,
            maxContentLength: WormGPTAPI.config.respMax,
            validateStatus: () => true
          }
        );

        // Handle error status codes
        if (response.status >= 400) {
          WormGPTAPI.stats.fails++;
          
          if (WormGPTAPI.stats.fails >= WormGPTAPI.config.failMax) {
            WormGPTAPI.stats.until = Date.now() + WormGPTAPI.config.resetMs;
          }

          if (attempt === WormGPTAPI.config.retry) {
            return {
              success: false,
              error: "Server Error",
              detail: response.statusText || "Server tidak merespon"
            };
          }
          continue;
        }

        // Reset fail counter on success
        WormGPTAPI.stats.fails = 0;

        let responseText = "";
        const responseData = response.data;

        if (responseData && typeof responseData === "object" && typeof responseData.response === "string") {
          responseText = responseData.response;
        } else if (typeof responseData === "string") {
          responseText = responseData;
        }

        // Limit output size
        responseText = responseText.slice(0, WormGPTAPI.config.outMax);

        // Clean response
        let cleanedResponse;
        try {
          cleanedResponse = WormGPTAPI.cleanResponse(responseText || "");
        } catch {
          cleanedResponse = (responseText || "").slice(0, WormGPTAPI.config.outMax);
        }

        return {
          success: true,
          data: cleanedResponse,
          originalLength: responseText.length,
          cleanedLength: cleanedResponse.length
        };

      } catch (error) {
        WormGPTAPI.stats.fails++;
        
        if (WormGPTAPI.stats.fails >= WormGPTAPI.config.failMax) {
          WormGPTAPI.stats.until = Date.now() + WormGPTAPI.config.resetMs;
        }

        if (attempt === WormGPTAPI.config.retry) {
          return {
            success: false,
            error: "Connection Error",
            detail: error.message || String(error)
          };
        }
      }
    }
  }
};

// Handler API untuk Next.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let message;

    // Handle GET request
    if (req.method === 'GET') {
      const { q } = req.query;
      message = q;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { text, message: msg, q } = req.body;
      message = text || msg || q;
    } 
    else {
      return res.status(405).json({
        status: false,
        message: 'Method not allowed'
      });
    }

    // Validasi input
    if (!message) {
      return res.status(400).json({
        status: false,
        message: 'Parameter message/q/text is required',
        example: '?q=Hello World'
      });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Message must be a non-empty string'
      });
    }

    console.log('Processing WormGPT request:', message.substring(0, 50) + '...');

    // Process dengan WormGPT
    const result = await WormGPTAPI.sendMessage(message);

    if (result.success) {
      return res.status(200).json({
        status: true,
        data: result.data,
        meta: {
          originalLength: result.originalLength,
          cleanedLength: result.cleanedLength,
          timestamp: new Date().toISOString()
        },
        credits: {
          author: "Daffa ~",
          team: "NB Team"
        }
      });
    } else {
      return res.status(500).json({
        status: false,
        error: result.error,
        detail: result.detail,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}