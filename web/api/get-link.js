const jwt = require('jsonwebtoken')

// Logging helper
function logEvent(event, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...data
    })
  )
}

// Global Redis for rate limiting
let globalRedis = null

async function getRedisClient() {
  if (!globalRedis || !globalRedis.isOpen) {
    const { createClient } = require('redis')
    globalRedis = createClient({
      url: process.env.REDIS_URL
    })
    await globalRedis.connect()
  }
  return globalRedis
}

async function checkRateLimit(redis, ip, limit = 5, window = 3600) {
  const key = `ratelimit:get-link:${ip}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, window)
  }

  return count <= limit
}

module.exports = async (req, res) => {
  // ==========================================
  // CORS - Allow all (Electron + Browser)
  // ==========================================
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // Get client IP
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown'

  // ==========================================
  // VALIDATION
  // ==========================================
  const JWT_SECRET = process.env.JWT_SECRET
  if (!JWT_SECRET) {
    logEvent('error', { type: 'missing_jwt_secret', ip: clientIp })
    return res.status(500).json({ error: 'Service temporarily unavailable' })
  }

  const VUOTLINK_API_KEY = process.env.VUOTLINK_API_KEY
  if (!VUOTLINK_API_KEY) {
    logEvent('error', { type: 'missing_vuotlink_key', ip: clientIp })
    return res.status(500).json({ error: 'Service temporarily unavailable' })
  }

  // ==========================================
  // RATE LIMITING (5 requests per hour per IP)
  // ==========================================
  if (process.env.REDIS_URL) {
    try {
      const redis = await getRedisClient()
      const allowed = await checkRateLimit(redis, clientIp, 5, 3600)

      if (!allowed) {
        logEvent('security', {
          type: 'rate_limit_exceeded',
          ip: clientIp,
          endpoint: '/get-link'
        })
        return res.status(429).json({
          error: 'Too many requests. Please try again in 1 hour.'
        })
      }
    } catch (redisError) {
      logEvent('error', {
        type: 'redis_error',
        message: redisError.message,
        ip: clientIp
      })
      // Continue without rate limit (fail open)
    }
  }

  // ==========================================
  // GENERATE JWT KEY
  // ==========================================
  const token = jwt.sign(
    {
      createdAt: Date.now(),
      type: 'ad-access'
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  )

  const baseUrl = 'https://tool-mc.vercel.app'
  const destinationUrl = `${baseUrl}/api/view-key?k=${token}`

  // ==========================================
  // CREATE VUOTLINK URL
  // ==========================================
  const apiUrl = `https://vuotlink.vip/api?api=${VUOTLINK_API_KEY}&url=${encodeURIComponent(destinationUrl)}&format=json`

  try {
    const response = await fetch(apiUrl)
    const data = await response.json()

    if (data.status === 'success' || data.shortenedUrl) {
      logEvent('success', {
        type: 'link_generated',
        ip: clientIp
      })

      res.status(200).json({ url: data.shortenedUrl })
    } else {
      logEvent('error', {
        type: 'vuotlink_failed',
        ip: clientIp,
        response: data
      })

      res.status(500).json({ error: 'Failed to generate link. Please try again.' })
    }
  } catch (error) {
    logEvent('error', {
      type: 'fetch_error',
      ip: clientIp,
      message: error.message
    })

    res.status(500).json({ error: 'Service temporarily unavailable' })
  }
}
