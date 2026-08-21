// ==================================
// ToolMC Authentication System
// ==================================
// This file handles the authentication overlay and key verification
// It communicates with the Vercel serverless API to verify JWT tokens

; (function () {
  'use strict'

  const API_BASE = 'https://tool-mc.vercel.app/api'

  // RSA PUBLIC KEY (Must match the private key on Vercel API)
  const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHC2vL15ywAKLYapSVShv3AsPZET
nDG8hgD47wH00ML2YGOHPh/P7RyPPKnS8IJtG2wqiTqr+4x2Scil+S93YjSUJrFC
xMQejjrFRInZakgTO6xEptjb1HvXMLNoUNWFOqLMVwnPs5foeZ0RV0YGt9LYYbAo
50OF9i7ZQKRR1QqPAgMBAAE=
-----END PUBLIC KEY-----`

  // Load the stored auth key from localStorage
  function loadStoredKey() {
    try {
      return localStorage.getItem('trafficermc_auth_key')
    } catch (e) {
      console.error('Failed to load stored key:', e)
      return null
    }
  }

  // Save auth key to localStorage
  function saveKey(key) {
    try {
      localStorage.setItem('trafficermc_auth_key', key)
      return true
    } catch (e) {
      console.error('Failed to save key:', e)
      return false
    }
  }

  // Clear the stored key
  function clearKey() {
    try {
      localStorage.removeItem('trafficermc_auth_key')
      localStorage.removeItem('trafficer_key_verified') // Also clear verified flag
    } catch (e) {
      console.error('Failed to clear key:', e)
    }
  }

  // Verify the RSA signature using Web Crypto API
  async function verifySignature(payload, signature) {
    try {
      // Convert PEM to ArrayBuffer
      const pemHeader = '-----BEGIN PUBLIC KEY-----'
      const pemFooter = '-----END PUBLIC KEY-----'
      const pemContents = PUBLIC_KEY.replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, '')
      const binaryDer = atob(pemContents)
      const binaryDerArray = new Uint8Array(binaryDer.length)
      for (let i = 0; i < binaryDer.length; i++) {
        binaryDerArray[i] = binaryDer.charCodeAt(i)
      }

      // Import the public key
      const publicKey = await crypto.subtle.importKey(
        'spki',
        binaryDerArray.buffer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['verify']
      )

      // Convert signature from hex to ArrayBuffer
      const signatureArray = new Uint8Array(
        signature.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
      )

      // Convert payload to ArrayBuffer
      const encoder = new TextEncoder()
      const payloadArray = encoder.encode(payload)

      // Verify the signature
      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signatureArray,
        payloadArray
      )

      return isValid
    } catch (error) {
      console.error('Signature verification failed:', error)
      return false
    }
  }

  // Verify key with the server
  async function verifyKey(key) {
    try {
      // Get Hardware ID
      let hwid = null
      if (window.api && window.api.getHardwareId) {
        try {
          hwid = await window.api.getHardwareId()
          // console.log('HWID:', hwid);
        } catch (e) {
          console.error('Failed to get HWID from renderer:', e)
        }
      }

      const response = await fetch(`${API_BASE}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, hwid })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      // Check if the response indicates the key is valid
      if (result.valid === false) {
        return { valid: false, error: result.error || 'Invalid key' }
      }

      // If we have encrypted data and signature, verify it
      if (result.data && result.signature) {
        const isSignatureValid = await verifySignature(result.data, result.signature)

        if (!isSignatureValid) {
          return {
            valid: false,
            error: 'Signature verification failed. Possible tampering detected.'
          }
        }

        // Parse the payload
        const payload = JSON.parse(result.data)

        if (!payload.valid) {
          return { valid: false, error: 'Key validation failed' }
        }

        // Check expiration
        const now = Math.floor(Date.now() / 1000)
        if (payload.expiresAt && payload.expiresAt < now) {
          return { valid: false, error: 'Key has expired' }
        }

        return {
          valid: true,
          timeLeft: payload.timeLeft,
          expiresAt: payload.expiresAt
        }
      }

      return { valid: false, error: 'Invalid server response' }
    } catch (error) {
      console.error('Key verification error:', error)
      return { valid: false, error: `Network error: ${error.message}` }
    }
  }

  // Show/Hide the auth overlay
  function showAuthOverlay() {
    const overlay = document.getElementById('authOverlay')
    if (overlay) {
      overlay.style.display = 'flex'
    }
  }

  function hideAuthOverlay() {
    const overlay = document.getElementById('authOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }
  }

  // Set status message
  function setAuthStatus(message, isError = true) {
    const statusEl = document.getElementById('authStatus')
    if (statusEl) {
      // Remove previous classes
      statusEl.classList.remove('success', 'error')

      // Add appropriate class
      if (!isError) {
        statusEl.classList.add('success')
      } else {
        statusEl.classList.add('error')
      }

      statusEl.innerText = message
    }
  }

  // Show/hide loading state
  function showLoadingState(message = 'Checking stored authentication key...') {
    const loadingState = document.getElementById('authLoadingState')
    const authCard = document.getElementById('authCard')
    const loadingMessage = document.getElementById('loadingMessage')

    if (loadingState && authCard && loadingMessage) {
      loadingMessage.innerText = message
      authCard.style.display = 'none'
      loadingState.style.display = 'block'
    }
  }

  function hideLoadingState() {
    const loadingState = document.getElementById('authLoadingState')
    const authCard = document.getElementById('authCard')

    if (loadingState && authCard) {
      loadingState.style.display = 'none'
      authCard.style.display = 'block'
    }
  }

  // Initialize authentication system
  async function initAuth() {
    // Check for stored key first
    const storedKey = loadStoredKey()

    if (storedKey) {
      // Show loading state instead of text
      showLoadingState('Verifying stored authentication key...')

      const result = await verifyKey(storedKey)

      if (result.valid) {
        // Mark key as verified (for Get Key button)
        localStorage.setItem('trafficer_key_verified', 'true')

        const hoursLeft = Math.floor((result.timeLeft || 0) / 3600)
        showLoadingState(`✓ Authentication successful! (${hoursLeft}h remaining)`)

        setTimeout(() => {
          hideAuthOverlay()
        }, 1500)
        return
      } else {
        // Key is invalid or expired, clear it silently
        clearKey()
        // Also clear the verified flag
        localStorage.removeItem('trafficer_key_verified')
        hideLoadingState()
      }
    } else {
      // No stored key, show auth card
      hideLoadingState()
    }

    // Show the overlay
    showAuthOverlay()
    setupAuthHandlers()
  }

  // Setup event handlers for auth buttons
  function setupAuthHandlers() {
    const btnGetKey = document.getElementById('btnGetKey')
    const btnVerifyKey = document.getElementById('btnVerifyKey')
    const authKeyInput = document.getElementById('authKeyInput')
    const keyOptions = document.getElementById('keyOptions')
    const btnCopyKey = document.getElementById('btnCopyKey')
    const btnOpenBrowser = document.getElementById('btnOpenBrowser')

    let currentUrl = null

    // Check if key was successfully verified (not just requested)
    const keyVerified = localStorage.getItem('trafficer_key_verified')

    if (btnGetKey) {
      // Only disable if a key was successfully verified
      if (keyVerified === 'true') {
        btnGetKey.disabled = true
        btnGetKey.innerText = 'Key Already Activated'
        btnGetKey.style.opacity = '0.5'
        btnGetKey.style.cursor = 'not-allowed'
      } else {
        btnGetKey.onclick = async () => {
          btnGetKey.disabled = true
          btnGetKey.innerText = 'Loading...'

          try {
            const response = await fetch(`${API_BASE}/get-link`, {
              method: 'GET'
            })

            if (!response.ok) {
              throw new Error(`Failed to get link: ${response.status}`)
            }

            const data = await response.json()

            if (data.url) {
              currentUrl = data.url

              // DON'T mark as permanently used here
              // Only after successful verification

              // Show options
              if (keyOptions) {
                keyOptions.classList.add('show')
              }

              // Update button text but keep it enabled for retry
              btnGetKey.innerText = 'Key Link Generated'
              btnGetKey.disabled = false // Allow getting new link if needed
            } else {
              throw new Error('No URL returned from server')
            }
          } catch (error) {
            console.error('Error getting link:', error)
            notify('Failed to Get Key', error.message, 'error')
            // On error, allow retry
            btnGetKey.disabled = false
            btnGetKey.innerText = 'Get Key (Free key)'
          }
        }
      }
    }

    // Copy link button
    if (btnCopyKey) {
      btnCopyKey.onclick = () => {
        if (currentUrl) {
          navigator.clipboard.writeText(currentUrl).then(() => {
            btnCopyKey.innerText = 'Copied!'
            setTimeout(() => {
              btnCopyKey.innerText = 'Copy Link'
            }, 2000)
          })
        }
      }
    }

    // Open browser button
    if (btnOpenBrowser) {
      btnOpenBrowser.onclick = () => {
        if (currentUrl) {
          window.open(currentUrl, '_blank')
        }
      }
    }

    if (btnVerifyKey && authKeyInput) {
      btnVerifyKey.onclick = async () => {
        const key = authKeyInput.value.trim()

        if (!key) {
          notify('Missing Key', 'Please enter your authentication key', 'error')
          return
        }

        // Validate minimum 8 characters
        if (key.length < 8) {
          notify(
            'Invalid Key Length',
            'Authentication key must be at least 8 characters long',
            'error'
          )
          return
        }

        btnVerifyKey.disabled = true
        btnVerifyKey.innerText = 'Verifying...'

        try {
          const result = await verifyKey(key)

          if (result.valid) {
            // Save the key
            saveKey(key)

            // Mark that a key has been successfully verified
            // This will disable "Get Key" button permanently
            localStorage.setItem('trafficer_key_verified', 'true')

            // Show success loading state
            const hoursLeft = Math.floor((result.timeLeft || 0) / 3600)
            showLoadingState(`✓ Authentication successful! (${hoursLeft}h remaining)`)

            setTimeout(() => {
              hideAuthOverlay()
            }, 1500)
          } else {
            notify(
              'Authentication Failed',
              result.error || 'The key is invalid or expired',
              'error'
            )
            authKeyInput.value = ''
            authKeyInput.focus()
          }
        } catch (error) {
          console.error('Verification error:', error)
          notify('Network Error', error.message, 'error')
        } finally {
          btnVerifyKey.disabled = false
          btnVerifyKey.innerText = 'Login'
        }
      }

      // Allow Enter key to verify
      authKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          btnVerifyKey.click()
        }
      })
    }
  }

  // ================================
  // BACKGROUND KEY VALIDATION
  // ================================

  let validationInterval = null

  // Periodic check if stored key is still valid
  async function checkKeyValidity() {
    const storedKey = loadStoredKey()

    if (!storedKey) {
      // No key stored, ignore
      return
    }

    const result = await verifyKey(storedKey)

    if (!result.valid) {
      // Key expired or invalid during runtime
      console.log('Key expired during runtime, logging out...')
      clearKey()

      // Stop bots if running
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.send('stopAllBots')
      }

      // Stop checking
      if (validationInterval) {
        clearInterval(validationInterval)
        validationInterval = null
      }

      // Reload page to reset button states
      console.log('Reloading page to reset authentication state...')
      window.location.reload()
    } else {
      // Key still valid
      const hoursLeft = Math.floor((result.timeLeft || 0) / 3600)
      console.log(`Key still valid. Time remaining: ${hoursLeft}h`)
    }
  }

  // Start background validation (check every 30 minutes)
  function startBackgroundValidation() {
    // Check immediately
    checkKeyValidity()

    // Then check every 30 minutes (1800000ms)
    validationInterval = setInterval(checkKeyValidity, 1800000)

    console.log('Background key validation started (checking every 30 min)')
  }

  // Stop background validation
  function stopBackgroundValidation() {
    if (validationInterval) {
      clearInterval(validationInterval)
      validationInterval = null
      console.log('Background key validation stopped')
    }
  }

  // Start auth when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAuth().then(() => {
        // Start background check after auth
        const storedKey = loadStoredKey()
        if (storedKey) {
          startBackgroundValidation()
        }
      })
    })
  } else {
    initAuth().then(() => {
      // Start background check after auth
      const storedKey = loadStoredKey()
      if (storedKey) {
        startBackgroundValidation()
      }
    })
  }

  // Export for debugging in console
  window.TrafficerAuth = {
    verifyKey,
    clearKey,
    loadStoredKey,
    showAuthOverlay,
    hideAuthOverlay,
    checkKeyValidity,
    startBackgroundValidation,
    stopBackgroundValidation
  }
})()
