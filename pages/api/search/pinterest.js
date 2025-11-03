import axios from 'axios';
import sharp from 'sharp';

// Process Pinterest Search
async function searchPinterest(query) {
  const apiUrl = `https://api.nekolabs.web.id/discovery/pinterest/search?q=${encodeURIComponent(query)}`;

  console.log('Calling Pinterest API:', apiUrl);

  const response = await axios.get(apiUrl, {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  return response.data;
}

// Convert image URL to compressed base64
async function imageUrlToCompressedBase64(imageUrl, maxWidth = 300, quality = 70) {
  try {
    // Download image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Compress dan resize menggunakan sharp
    const compressedBuffer = await sharp(response.data)
      .resize(maxWidth, null, { // Resize width, maintain aspect ratio
        withoutEnlargement: true, // Jangan perbesar jika sudah kecil
        fit: 'inside'
      })
      .jpeg({ 
        quality: quality,
        progressive: true 
      })
      .toBuffer();

    const base64 = compressedBuffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;

  } catch (error) {
    console.error('Failed to convert image to base64:', error.message);
    return null;
  }
}

// Process semua result dengan base64
async function processResultsWithBase64(results) {
  const processedResults = [];
  
  // Process maksimal 10 gambar untuk menghindari timeout
  const limitedResults = results.slice(0, 10);
  
  for (const item of limitedResults) {
    try {
      const base64Image = await imageUrlToCompressedBase64(item.imageUrl);
      
      processedResults.push({
        ...item,
        base64: base64Image,
        hasBase64: !!base64Image
      });
      
      // Small delay untuk menghindari rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Failed to process image for ${item.caption}:`, error.message);
      // Tetap include item tanpa base64 jika gagal
      processedResults.push({
        ...item,
        base64: null,
        hasBase64: false
      });
    }
  }
  
  return processedResults;
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
    let query;

    // Handle GET request
    if (req.method === 'GET') {
      const { q } = req.query;
      query = q;
    } 
    // Handle POST request
    else if (req.method === 'POST') {
      const { q } = req.body;
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
        message: 'Parameter q (query) is required'
      });
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Parameter q must be a non-empty string'
      });
    }

    console.log('Searching Pinterest for:', query);

    // Search Pinterest
    const pinterestResult = await searchPinterest(query.trim());

    if (!pinterestResult.success || !pinterestResult.result) {
      return res.status(500).json({
        status: false,
        message: 'Failed to search Pinterest'
      });
    }

    // Process results dengan base64
    console.log('Processing images with base64 conversion...');
    const processedResults = await processResultsWithBase64(pinterestResult.result);

    return res.status(200).json({
      status: true,
      data: {
        success: pinterestResult.success,
        query: query,
        totalResults: pinterestResult.result.length,
        processedResults: processedResults.length,
        results: processedResults,
        timestamp: new Date().toISOString(),
        responseTime: pinterestResult.responseTime
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      status: false,
      message: error.message || 'Internal server error'
    });
  }
}
