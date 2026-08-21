import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const AUTH_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHC2vL15ywAKLYapSVShv3AsPZET
nDG8hgD47wH00ML2YGOHPh/P7RyPPKnS8IJtG2wqiTqr+4x2Scil+S93YjSUJrFC
xMQejjrFRInZakgTO6xEptjb1HvXMLNoUNWFOqLMVwnPs5foeZ0RV0YGt9LYYbAo
50OF9i7ZQKRR1QqPAgMBAAE=
-----END PUBLIC KEY-----`

export async function handleAuthVerify(event, key) {
  if (!key) return { valid: false, error: 'No key provided' }

  try {
    const AUTH_URL = 'https://tool-mc.vercel.app/api/verify'

    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })

    const json = await response.json()

    if (json.error || (json.valid === false && !json.data)) {
      return { valid: false, error: json.error || 'Invalid Key' }
    }

    // 2. RSA Verify Signature
    if (json.data && json.signature) {
      try {
        const verify = crypto.createVerify('SHA256')
        verify.update(json.data)
        verify.end()

        const isValid = verify.verify(AUTH_PUBLIC_KEY, json.signature, 'hex')

        if (!isValid) {
          console.log('[Auth] RSA Signature Mismatch!')
          return { valid: false, error: 'Security Check Failed: Signature Invalid' }
        }

        const data = JSON.parse(json.data)
        return data
      } catch (verifyErr) {
        console.error('[Auth] Crypto Verification Error:', verifyErr)
        return { valid: false, error: 'Verification Logic Error (Check Public Key)' }
      }
    }

    return { valid: false, error: 'Invalid Server Response Format' }
  } catch (err) {
    console.error('[Auth] Verification Error:', err)
    return { valid: false, error: 'Connection Failed' }
  }
}

export async function handleVerifyAccount(event, data) {
  const { username, password, type } = data
  console.log('[Account Verification] Verifying account:', username, 'type:', type)

  if (type === 'offline') {
    return { success: true }
  }

  if (type === 'microsoft') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(username)) {
      return { success: false, error: 'Định dạng Email Microsoft không hợp lệ.' }
    }
    return { success: true }
  }

  if (type === 'thealtening') {
    try {
      const response = await axios.post(
        'https://authserver.thealtening.com/authenticate',
        {
          agent: {
            name: 'Minecraft',
            version: 1
          },
          username: username,
          password: 'dummy'
        },
        {
          timeout: 10000
        }
      )

      if (response.status === 200 && response.data.accessToken) {
        return { success: true }
      } else {
        return { success: false, error: 'Phản hồi không hợp lệ từ TheAltening.' }
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.errorMessage) {
        return { success: false, error: err.response.data.errorMessage }
      }
      return { success: false, error: err.message || 'Không thể kết nối đến máy chủ TheAltening.' }
    }
  }

  if (type === 'microsoft_password') {
    const tempCache = path.join(process.cwd(), 'bot_sessions', '_temp_check_' + username)
    try {
      const { Authflow } = require('prismarine-auth')
      const flow = new Authflow(username, tempCache, {
        password: password,
        flow: 'msal',
        authTitle: '00000000402b5328'
      })
      await flow.getMinecraftJavaToken()

      // Clean up the temp cache directory
      try {
        fs.rmSync(tempCache, { recursive: true, force: true })
      } catch (rmErr) {
        console.error('Failed to clean temp cache:', rmErr)
      }

      return { success: true }
    } catch (err) {
      // Clean up the temp cache directory on error
      try {
        fs.rmSync(tempCache, { recursive: true, force: true })
      } catch (rmErr) {
        console.error('Failed to clean temp cache on error:', rmErr)
      }
      return { success: false, error: err.message || String(err) }
    }
  }

  return { success: false, error: 'Loại tài khoản không được hỗ trợ.' }
}
