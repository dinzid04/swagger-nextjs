import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import mime from 'mime-types'

class NanoBananaAPI {
  constructor() {
    this.baseURL = 'https://notegpt.io'
  }

  async getToken() {
    const config = {
      method: 'GET',
      url: 'https://notegpt.io/api/v1/oss/sts-token',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        'referer': 'https://notegpt.io/ai-image-editor',
      }
    }
    
    try {
      const response = await axios.request(config)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async upload(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File tidak ditemukan: ${filePath}`)
    }

    const tokenData = await this.getToken()
    if (tokenData.code !== 100000) {
      throw new Error(`Gagal mendapatkan token: ${tokenData.message}`)
    }

    const { AccessKeyId, AccessKeySecret, SecurityToken } = tokenData.data
    const fileBuffer = fs.readFileSync(filePath)
    const fileName = `${uuidv4()}${path.extname(filePath)}`
    const bucketName = 'nc-cdn'
    const objectKey = `notegpt/web3in1/${fileName}`
    const ossPath = `/${bucketName}/${objectKey}`
    const uploadUrl = `https://${bucketName}.oss-us-west-1.aliyuncs.com/${objectKey}`
    const contentType = mime.lookup(filePath) || 'application/octet-stream'
    const date = new Date().toUTCString()
    
    const canonicalizedHeaders = [
      `x-oss-date:${date}`,
      `x-oss-security-token:${SecurityToken}`
    ].sort().join('\n')
    
    const stringToSign = [
      'PUT',
      '',
      contentType,
      date,
      canonicalizedHeaders,
      ossPath
    ].join('\n')
    
    const signature = crypto.createHmac('sha1', AccessKeySecret)
      .update(stringToSign)
      .digest('base64')
    
    const authorization = `OSS ${AccessKeyId}:${signature}`

    const uploadConfig = {
      method: 'PUT',
      url: uploadUrl,
      headers: {
        'Authorization': authorization,
        'Content-Type': contentType,
        'Date': date,
        'x-oss-date': date,
        'x-oss-security-token': SecurityToken,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://notegpt.io/',
        'Origin': 'https://notegpt.io',
      },
      data: fileBuffer
    }

    const response = await axios.request(uploadConfig)
    if (response.status === 200) {
      return uploadUrl
    } else {
      throw new Error(`Upload gagal: ${response.statusText}`)
    }
  }

  async startProcess(imageUrl, userPrompt) {
    const randomUserId = uuidv4()
    const randomSessionId = uuidv4()
    
    const data = JSON.stringify({
      "image_url": imageUrl,
      "type": 60,
      "user_prompt": userPrompt,
      "aspect_ratio": "match_input_image",
      "num": 1,
      "model": "google/nano-banana",
      "sub_type": 3
    })

    const config = {
      method: 'POST',
      url: 'https://notegpt.io/api/v2/images/handle',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/json; charset=UTF-8',
        'origin': 'https://notegpt.io',
        'referer': `https://notegpt.io/ai-image-editor?s=${randomSessionId}`,
        'Cookie': `anonymous_user_id=${randomUserId}`
      },
      data: data
    }

    const response = await axios.request(config)
    return {
      sessionInfo: {
        randomSessionId,
        randomUserId
      },
      data: response.data
    }
  }

  async checkStatus(sessionId, sessionInfo) {
    const config = {
      method: 'GET',
      url: `https://notegpt.io/api/v2/images/status?session_id=${sessionId}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        'referer': `https://notegpt.io/ai-image-editor?s=${sessionInfo.randomSessionId}`,
        'Cookie': `anonymous_user_id=${sessionInfo.randomUserId}`
      }
    }

    const response = await axios.request(config)
    return response.data
  }

  async processImage(filePath, userPrompt, maxRetries = 30) {
    try {
      // Upload gambar terlebih dahulu
      const imageUrl = await this.upload(filePath)
      
      // Mulai proses Nano Banana
      const startResponse = await this.startProcess(imageUrl, userPrompt)
      
      if (startResponse.data.code !== 100000 || !startResponse.data.data.session_id) {
        throw new Error(`Gagal memulai proses: ${startResponse.data.message || 'Session ID tidak ditemukan'}`)
      }

      const sessionId = startResponse.data.data.session_id
      const sessionInfo = startResponse.sessionInfo
      
      // Polling status dengan retry mechanism
      let retryCount = 0
      let finalResult

      while (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        const statusResponse = await this.checkStatus(sessionId, sessionInfo)
        
        if (statusResponse.code !== 100000) {
          throw new Error(`Gagal memeriksa status: ${statusResponse.message}`)
        }

        const statusData = statusResponse.data
        console.log(`Status proses: ${statusData.status}`)

        if (statusData.status === 'succeeded') {
          finalResult = statusData
          break
        }

        if (statusData.status === 'failed') {
          throw new Error('Proses gagal di server')
        }

        retryCount++
      }

      if (!finalResult) {
        throw new Error('Proses timeout setelah beberapa kali percobaan')
      }

      return {
        status: 'success',
        data: finalResult
      }

    } catch (error) {
      console.error(`Error: ${error.message}`)
      return {
        status: 'error',
        message: error.message
      }
    }
  }
}

// Handler API utama
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed. Gunakan POST.' 
    })
  }

  try {
    const { imageUrl, prompt, filePath } = req.body

    if (!prompt) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Prompt diperlukan' 
      })
    }

    if (!imageUrl && !filePath) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'imageUrl atau filePath diperlukan' 
      })
    }

    const nanoBanana = new NanoBananaAPI()
    let result

    if (filePath) {
      // Jika menggunakan file path lokal
      result = await nanoBanana.processImage(filePath, prompt)
    } else {
      // Jika menggunakan URL gambar (perlu modifikasi untuk handle URL)
      // Untuk sementara kita asumsikan file path saja
      return res.status(400).json({ 
        status: 'error', 
        message: 'Fitur URL gambar sedang dalam pengembangan. Gunakan filePath.' 
      })
    }

    if (result.status === 'error') {
      return res.status(500).json(result)
    }

    res.status(200).json(result)

  } catch (error) {
    console.error('Error handler:', error)
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error' 
    })
  }
}

// Fungsi utilitas untuk penggunaan langsung
export async function nanoBananaProcess(filePath, prompt) {
  const nanoBanana = new NanoBananaAPI()
  return await nanoBanana.processImage(filePath, prompt)
}
