import yts from "yt-search";

async function youtubeSearch(query) {
  try {
    const results = await yts(query);
    return results.all;
  } catch (error) {
    throw new Error(`Error searching YouTube: ${error.message}`);
  }
}

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
    let query;

    // Handle GET request
    if (req.method === 'GET') {
      const { query: q } = req.query;
      query = q;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { query: q } = req.body;
      query = q;
    } 
    else {
      return res.status(405).json({
        status: false,
        message: 'Method not allowed'
      });
    }

    // Validasi parameter
    if (!query) {
      return res.status(400).json({
        status: false,
        error: "Parameter 'query' is required",
        example: "?query=sc bot"
      });
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        status: false,
        error: "Parameter 'query' must be a non-empty string"
      });
    }

    if (query.length > 500) {
      return res.status(400).json({
        status: false,
        error: "Parameter 'query' must be less than 500 characters"
      });
    }

    console.log('Searching YouTube for:', query);

    // Process YouTube search
    const results = await youtubeSearch(query.trim());

    if (!results || results.length === 0) {
      return res.status(404).json({
        status: false,
        error: "No results found for the given query"
      });
    }

    // Format results
    const formattedResults = results.map(item => {
      const baseResult = {
        type: item.type,
        title: item.title,
        url: item.url,
        timestamp: item.timestamp
      };

      // Video-specific properties
      if (item.type === 'video') {
        return {
          ...baseResult,
          videoId: item.videoId,
          duration: item.duration,
          views: item.views,
          thumbnail: item.thumbnail,
          ago: item.ago,
          author: {
            name: item.author?.name,
            url: item.author?.url
          }
        };
      }

      // Channel-specific properties
      if (item.type === 'channel') {
        return {
          ...baseResult,
          name: item.name,
          description: item.description,
          image: item.image,
          subscribers: item.subscribers,
          videoCount: item.videoCount
        };
      }

      // Playlist-specific properties
      if (item.type === 'list') {
        return {
          ...baseResult,
          listId: item.listId,
          videoCountLabel: item.videoCountLabel
        };
      }

      return baseResult;
    });

    return res.status(200).json({
      status: true,
      data: formattedResults,
      meta: {
        totalResults: results.length,
        query: query,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      error: error.message || 'Internal Server Error',
      timestamp: new Date().toISOString()
    });
  }
}