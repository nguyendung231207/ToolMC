const jwt = require('jsonwebtoken')
const crypto = require('crypto')

// Global Redis connection (reused across requests)
let globalRedis = null

async function getRedisClient() {
  if (!globalRedis || !globalRedis.isOpen) {
    const { createClient } = require('redis')
    globalRedis = createClient({
      url: process.env.REDIS_URL
    })
    await globalRedis.connect()
    console.log('[Redis] Connection pooled and ready')
  }
  return globalRedis
}

// Rate limiting helper
async function checkRateLimit(redis, ip, endpoint, limit = 100, window = 3600) {
  const key = `ratelimit:${endpoint}:${ip}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, window)
  }

  return count <= limit
}

// Logging helper (structured JSON logs)
function logEvent(event, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...data
    })
  )
}

// RSA Private Key - NO FALLBACK
const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY

module.exports = async (req, res) => {
  // ==========================================
  // CORS - Allow all (Electron + Browser)
  // ==========================================
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // Get client IP for rate limiting & logging
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown'

  // ==========================================
  // VALIDATION
  // ==========================================
  const JWT_SECRET = process.env.JWT_SECRET
  if (!JWT_SECRET) {
    logEvent('error', { type: 'missing_jwt_secret', ip: clientIp })
    return res.status(500).json({ valid: false, error: 'Service temporarily unavailable' })
  }

  if (!PRIVATE_KEY) {
    logEvent('error', { type: 'missing_rsa_key', ip: clientIp })
    return res.status(500).json({ valid: false, error: 'Service temporarily unavailable' })
  }

  const { key } = req.body
  if (!key) {
    logEvent('warn', { type: 'missing_key', ip: clientIp })
    return res.status(200).json({ valid: false, error: 'Authentication required' })
  }

  // ==========================================
  // RATE LIMITING
  // ==========================================
  let redis = null
  try {
    // Only connect to Redis if REDIS_URL is set
    if (process.env.REDIS_URL) {
      redis = await getRedisClient()

      // Rate limit: 100 requests per hour per IP
      const allowed = await checkRateLimit(redis, clientIp, 'verify', 100, 3600)
      if (!allowed) {
        logEvent('security', {
          type: 'rate_limit_exceeded',
          ip: clientIp,
          endpoint: '/verify'
        })
        return res.status(429).json({
          valid: false,
          error: 'Too many requests. Please try again later.'
        })
      }
    }
  } catch (redisError) {
    logEvent('error', {
      type: 'redis_connection_error',
      message: redisError.message,
      ip: clientIp
    })
    // Continue without Redis (fail open for rate limiting)
    // But still enforce JWT verification
  }

  // ==========================================
  // JWT VERIFICATION
  // ==========================================
  let decoded
  try {
    decoded = jwt.verify(key, JWT_SECRET)
  } catch (err) {
    logEvent('security', {
      type: 'invalid_jwt',
      ip: clientIp,
      error: err.message
    })
    return res.status(200).json({
      valid: false,
      error: 'Invalid or expired authentication key'
    })
  }

  // ==========================================
  // HWID BINDING (Anti-Key-Sharing)
  // ==========================================
  const { hwid } = req.body

  if (hwid && redis) {
    try {
      const keyBinding = `trafficer:binding:${key}`
      const boundHwid = await redis.get(keyBinding)

      if (boundHwid) {
        // Key is already bound
        if (boundHwid !== hwid) {
          // SHARING DETECTED!
          logEvent('security', {
            type: 'key_sharing_detected',
            ip: clientIp,
            keyPrefix: key.substring(0, 15) + '...',
            boundHwid: boundHwid.substring(0, 8) + '...',
            currentHwid: hwid.substring(0, 8) + '...'
          })

          return res.status(200).json({
            valid: false,
            error: 'Authentication failed. Please request a new key.'
          })
        }
        // Same device - Allowed
        logEvent('info', {
          type: 'hwid_verified',
          ip: clientIp,
          hwidPrefix: hwid.substring(0, 8) + '...'
        })
      } else {
        // First use - Bind to this device
        await redis.setEx(keyBinding, 86400, hwid)
        logEvent('info', {
          type: 'key_bound',
          ip: clientIp,
          hwidPrefix: hwid.substring(0, 8) + '...'
        })
      }
    } catch (redisError) {
      logEvent('error', {
        type: 'redis_hwid_error',
        message: redisError.message,
        ip: clientIp
      })
      // Fail open - allow request even if Redis fails
    }
  } else if (!hwid) {
    logEvent('warn', {
      type: 'missing_hwid',
      ip: clientIp
    })
  }

  // ==========================================
  // CHECK TYPE
  // ==========================================
  if (decoded.type !== 'ad-access') {
    logEvent('security', {
      type: 'invalid_key_type',
      ip: clientIp,
      receivedType: decoded.type
    })
    return res.status(200).json({
      valid: false,
      error: 'Invalid authentication key'
    })
  }

  // ==========================================
  // GENERATE SIGNED RESPONSE
  // ==========================================
  const now = Math.floor(Date.now() / 1000)
  const timeLeft = decoded.exp - now

  const payload = JSON.stringify({
    valid: true,
    timeLeft: timeLeft,
    expiresAt: decoded.exp
  })

  // RSA Signature
  const sign = crypto.createSign('SHA256')
  sign.update(payload)
  sign.end()
  const signature = sign.sign(PRIVATE_KEY, 'hex')

  logEvent('success', {
    type: 'key_verified',
    ip: clientIp,
    timeLeft: Math.floor(timeLeft / 3600) + 'h'
  })

  return res.status(200).json({
    data: payload,
    signature: signature
  })
}
