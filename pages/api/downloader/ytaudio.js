import axios from 'axios';

export default async function handler(req, res) {
  // CORS headers
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
      const { query: queryParam } = req.query;
      query = queryParam;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { query: queryBody } = req.body;
      query = queryBody;
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
        message: 'Parameter query is required'
      });
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Parameter query must be a non-empty string'
      });
    }

    console.log('Searching YouTube audio for:', query);

    // Call Vreden API
    const vredenUrl = `https://api.vreden.my.id/api/v1/download/play/audio?query=${encodeURIComponent(query.trim())}`;
    
    const response = await axios.get(vredenUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    const vredenData = response.data;

    if (!vredenData.status || !vredenData.result || !vredenData.result.download || !vredenData.result.download.url) {
      return res.status(404).json({
        status: false,
        message: 'Audio not found or download unavailable'
      });
    }

    const audioUrl = vredenData.result.download.url;
    const metadata = vredenData.result.metadata;

    console.log('Found audio URL:', audioUrl);

    // Option 1: Return audio stream langsung (bisa langsung play)
    if (req.query.direct === 'true' || req.body?.direct === true) {
      try {
        const audioResponse = await axios.get(audioUrl, {
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Range': 'bytes=0-'
          }
        });

        // Set headers untuk audio streaming
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `inline; filename="${metadata.title || 'audio'}.mp3"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Forward audio stream
        audioResponse.data.pipe(res);
        return;

      } catch (streamError) {
        console.error('Stream error, falling back to URL:', streamError.message);
        // Fallback ke return URL jika streaming gagal
      }
    }

    // Option 2: Return JSON dengan audio URL dan metadata
    return res.status(200).json({
      status: true,
      message: 'Audio found successfully',
      data: {
        audio: {
          url: audioUrl,
          directPlay: `${req.headers.host}/api/downloader/ytaudio?query=${encodeURIComponent(query)}&direct=true`,
          quality: vredenData.result.download.quality,
          filename: vredenData.result.download.filename,
          duration: metadata.duration
        },
        metadata: {
          title: metadata.title,
          artist: metadata.author?.name || 'Unknown',
          thumbnail: metadata.thumbnail,
          duration: metadata.timestamp,
          views: metadata.views,
          youtubeUrl: metadata.url
        },
        searchQuery: query
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);

    if (error.response?.status === 404) {
      return res.status(404).json({
        status: false,
        message: 'Audio not found for the given query'
      });
    }

    return res.status(500).json({
      status: false,
      message: error.message || 'Failed to search YouTube audio'
    });
  }
}
