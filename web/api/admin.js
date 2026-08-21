const jwt = require('jsonwebtoken')
const crypto = require('crypto')

// Verify admin token
function verifyAdmin(req) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    return decoded.role === 'admin' ? decoded : null
  } catch (e) {
    return null
  }
}

// Get Redis client (singleton)
let globalRedis = null
async function getRedisClient() {
  if (!globalRedis || !globalRedis.isOpen) {
    const { createClient } = require('redis')
    globalRedis = createClient({ url: process.env.REDIS_URL })
    await globalRedis.connect()
  }
  return globalRedis
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { action } = req.query

  // ==========================================
  // AUTH (No token required)
  // ==========================================
  if (action === 'auth') {
    const { password } = req.body
    if (!password) {
      return res.status(400).json({ error: 'Password required' })
    }

    const ADMIN_PASSWORD_HASH =
      process.env.ADMIN_PASSWORD_HASH ||
      crypto.createHash('sha256').update('admin123').digest('hex')

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex')

    if (passwordHash === ADMIN_PASSWORD_HASH) {
      const token = jwt.sign({ role: 'admin', createdAt: Date.now() }, process.env.JWT_SECRET, {
        expiresIn: '8h'
      })
      return res.status(200).json({ success: true, token })
    } else {
      return res.status(401).json({ error: 'Invalid password' })
    }
  }

  // ==========================================
  // ALL OTHER ACTIONS REQUIRE ADMIN TOKEN
  // ==========================================
  const admin = verifyAdmin(req)
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ==========================================
  // STATS
  // ==========================================
  if (action === 'stats') {
    let stats = {
      totalVerifications: 0,
      activeKeys: 0,
      sharingAttempts: 0,
      rateLimitBlocks: 0
    }

    if (process.env.REDIS_URL) {
      try {
        const redis = await getRedisClient()
        const keys = await redis.keys('trafficer:binding:*')
        stats.activeKeys = keys.length
        stats.totalVerifications = parseInt((await redis.get('stats:total_verifications')) || 0)
        stats.sharingAttempts = parseInt((await redis.get('stats:sharing_attempts')) || 0)
        stats.rateLimitBlocks = parseInt((await redis.get('stats:rate_limit_blocks')) || 0)
      } catch (error) {
        console.error('Redis error:', error)
      }
    }
    return res.status(200).json(stats)
  }

  // ==========================================
  // CREATE KEY
  // ==========================================
  if (action === 'create-key') {
    const { expiresIn, label } = req.body
    const validExpiries = ['1h', '6h', '24h', '7d', '30d', '365d']

    if (!expiresIn || !validExpiries.includes(expiresIn)) {
      return res.status(400).json({ error: 'Invalid expiry' })
    }

    const token = jwt.sign(
      {
        createdAt: Date.now(),
        type: 'ad-access',
        label: label || 'admin-created',
        createdBy: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn }
    )

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'admin',
        type: 'key_created',
        expiresIn,
        label
      })
    )

    return res.status(200).json({ success: true, key: token, expiresIn })
  }

  // ==========================================
  // REVOKE KEY
  // ==========================================
  if (action === 'revoke-key') {
    const { key } = req.body
    if (!key) return res.status(400).json({ error: 'Key required' })
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    try {
      const redis = await getRedisClient()
      await redis.setEx(`blacklist:${key}`, 86400, 'admin-revoked')
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'admin',
          type: 'key_revoked'
        })
      )
      return res.status(200).json({ success: true, message: 'Key revoked' })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to revoke key' })
    }
  }

  // ==========================================
  // LIST KEYS
  // ==========================================
  if (action === 'keys') {
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    try {
      const redis = await getRedisClient()
      const keys = await redis.keys('trafficer:binding:*')
      const activeKeys = []

      for (const redisKey of keys) {
        const keyToken = redisKey.replace('trafficer:binding:', '')
        const hwid = await redis.get(redisKey)
        const ttl = await redis.ttl(redisKey)

        let metadata = {}
        try {
          const decoded = jwt.decode(keyToken)
          metadata = {
            type: decoded.type,
            label: decoded.label || 'N/A',
            createdBy: decoded.createdBy || 'user',
            createdAt: decoded.createdAt ? new Date(decoded.createdAt).toISOString() : 'Unknown',
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'Unknown'
          }
        } catch (e) {}

        activeKeys.push({
          key: keyToken,
          keyPrefix: keyToken.substring(0, 20) + '...',
          hwid: hwid ? hwid.substring(0, 12) + '...' : 'Not bound',
          hwidFull: hwid,
          ttl,
          expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : 'Expired',
          ...metadata
        })
      }

      activeKeys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return res.status(200).json({ keys: activeKeys })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch keys' })
    }
  }

  // ==========================================
  // DELETE KEY
  // ==========================================
  if (action === 'delete-key') {
    const { key } = req.body
    if (!key) return res.status(400).json({ error: 'Key required' })
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    try {
      const redis = await getRedisClient()
      const deleted = await redis.del(`trafficer:binding:${key}`)
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'admin',
          type: 'key_deleted'
        })
      )

      if (deleted > 0) {
        return res.status(200).json({ success: true, message: 'Key binding deleted' })
      } else {
        return res.status(404).json({ error: 'Key not found' })
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to delete key' })
    }
  }

  // ==========================================
  // BLOCK IP
  // ==========================================
  if (action === 'block-ip') {
    const { ip, duration } = req.body
    if (!ip) return res.status(400).json({ error: 'IP required' })
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    const durationSeconds = (duration || 24) * 3600

    try {
      const redis = await getRedisClient()
      await redis.setEx(`blocked:ip:${ip}`, durationSeconds, 'admin-blocked')
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'admin',
          type: 'ip_blocked',
          ip,
          duration: duration || 24
        })
      )
      return res
        .status(200)
        .json({ success: true, message: `IP ${ip} blocked for ${duration || 24} hours` })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to block IP' })
    }
  }

  // ==========================================
  // UNBLOCK IP
  // ==========================================
  if (action === 'unblock-ip') {
    const { ip } = req.body
    if (!ip) return res.status(400).json({ error: 'IP required' })
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    try {
      const redis = await getRedisClient()
      await redis.del(`blocked:ip:${ip}`)
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'admin',
          type: 'ip_unblocked',
          ip
        })
      )
      return res.status(200).json({ success: true, message: `IP ${ip} unblocked` })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to unblock IP' })
    }
  }

  // ==========================================
  // LIST BLOCKED IPS
  // ==========================================
  if (action === 'blocked-ips') {
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    try {
      const redis = await getRedisClient()
      const keys = await redis.keys('blocked:ip:*')
      const blockedIps = []

      for (const key of keys) {
        const ip = key.replace('blocked:ip:', '')
        const ttl = await redis.ttl(key)
        const reason = await redis.get(key)

        blockedIps.push({
          ip,
          reason: reason || 'admin-blocked',
          ttl,
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
        })
      }

      return res.status(200).json({ blockedIps })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch blocked IPs' })
    }
  }

  // ==========================================
  // ANALYTICS
  // ==========================================
  if (action === 'analytics') {
    const { timeRange } = req.query
    if (!process.env.REDIS_URL) return res.status(500).json({ error: 'Redis not configured' })

    try {
      const redis = await getRedisClient()
      const rateLimitKeys = await redis.keys('ratelimit:*')
      const ipStats = {}

      for (const key of rateLimitKeys) {
        const count = await redis.get(key)
        const parts = key.split(':')

        if (parts.length >= 3) {
          const ip = parts[2]
          if (!ipStats[ip]) {
            ipStats[ip] = { ip, totalRequests: 0, endpoints: {} }
          }
          ipStats[ip].totalRequests += parseInt(count)
          const endpoint = parts[1]
          ipStats[ip].endpoints[endpoint] = parseInt(count)
        }
      }

      const topIps = Object.values(ipStats)
        .sort((a, b) => b.totalRequests - a.totalRequests)
        .slice(0, 50)

      let timeStats = {
        totalRequests: parseInt((await redis.get('stats:total_requests')) || 0),
        successfulVerifications: parseInt((await redis.get('stats:successful_verifications')) || 0),
        failedVerifications: parseInt((await redis.get('stats:failed_verifications')) || 0),
        keysCreated: parseInt((await redis.get('stats:keys_created')) || 0),
        sharingAttempts: parseInt((await redis.get('stats:sharing_attempts')) || 0)
      }

      return res.status(200).json({
        timeRange: timeRange || 'all',
        stats: timeStats,
        topIps
      })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch analytics' })
    }
  }

  // Unknown action
  return res.status(400).json({ error: 'Invalid action' })
}
