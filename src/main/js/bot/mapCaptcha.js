import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import axios from 'axios'
import { sendEvent, delay } from '../misc/utils'
import { storeinfo } from './botState'

const captchaDir = path.join(process.cwd(), 'captchas')
const latestPath = path.join(captchaDir, 'latest.png')

// Optional Telegram config for captcha data collection (set via env or leave empty)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''

export class MapCaptcha {
  constructor(bot) {
    this.bot = bot
    this.maps = new Map()
    this.active = false
    this.lastImageUrl = null
    this.attached = false
    this.lastCaptchaAnswer = null
    this.lastCaptchaPngBuffer = null
    fs.mkdirSync(captchaDir, { recursive: true })

    // Bound listeners for proper dynamic attach/detach cleanup
    this.onMessageStr = (text) => {
      const botInstance = this.bot
      if (/xác minh captcha thành công|xac minh captcha thanh cong/i.test(text)) {
        this.active = false
        botInstance._onemcbypassActive = false
        this.debug('Captcha đã xác minh thành công, tắt modal captcha.', { text })
        sendEvent(botInstance.username, 'chat', '[Map Captcha] Xác minh captcha thành công!')

        // Gửi captcha image + answer lên Telegram để train AI
        this.sendCaptchaToTelegram()

        this.detach()
        return
      }

      if (!botInstance._onemcbypassActive) return

      if (
        /mã captcha sai|ma captcha sai|mã mới đã được gửi|ma moi da duoc gui|nhìn vào tay|nhin vao tay|captcha|mã captcha/i.test(
          text
        )
      ) {
        this.active = true
        this.debug('Captcha đang active / server yêu cầu nhìn map.', { text })
        this.tryHoldMap('captcha-prompt')
      }
    }

    this.onPacket = (data, meta) => {
      const botInstance = this.bot
      const name = meta?.name || ''

      if (this.isInventoryPacket(name) && botInstance._onemcbypassActive) {
        setTimeout(() => this.tryHoldMap(`inventory-packet:${name}`), 150)
      }

      if (this.isMapPacket(name, data)) {
        this.handleMapPacket(name, data)
      }
    }
  }

  attach() {
    if (this.attached) return
    const bot = this.bot
    if (!bot?._client) return

    this.debug('MapCaptcha attached, sniffing map/item/set_slot/window packets.')
    this.attached = true

    // Hook bot.chat để bắt captcha answer
    if (!bot._origChatForCaptcha) {
      bot._origChatForCaptcha = bot.chat.bind(bot)
      const self = this
      bot.chat = function (message) {
        // Nếu đang active captcha, lưu answer
        if (self.active || bot._onemcbypassActive) {
          self.lastCaptchaAnswer = message
          self.debug(`Captured captcha answer: ${message}`)
        }
        return bot._origChatForCaptcha(message)
      }
    }

    bot.on('messagestr', this.onMessageStr)
    bot._client.on('packet', this.onPacket)
  }

  detach() {
    if (!this.attached) return
    const bot = this.bot
    this.debug('MapCaptcha detached, stopping packet sniffer.')
    this.attached = false

    if (bot) {
      bot.removeListener('messagestr', this.onMessageStr)
      if (bot._client) {
        try {
          bot._client.removeListener('packet', this.onPacket)
        } catch (e) {
          this.debug('Error removing packet listener during detach:', e.message)
        }
      }
      // Restore original bot.chat
      if (bot._origChatForCaptcha) {
        bot.chat = bot._origChatForCaptcha
        delete bot._origChatForCaptcha
      }
    }
  }

  isInventoryPacket(name) {
    return /slot|window|container|inventory|held/i.test(name)
  }

  isMapPacket(name, packet) {
    if (!/^map$|map_data|map_update|map_item_data$/i.test(name)) return false
    const dimensions = this.extractDimensions(packet)
    return !!this.extractColorData(packet) && dimensions.width > 0 && dimensions.height > 0
  }

  tryHoldMap(reason) {
    const bot = this.bot
    try {
      const slots = bot.inventory?.slots || []
      const mapItem = slots.find((item) => item && /map/i.test(item.name || item.displayName || ''))
      this.debug('Thử tìm map trong inventory/hotbar.', {
        reason,
        found: !!mapItem,
        slot: mapItem?.slot,
        name: mapItem?.name,
        displayName: mapItem?.displayName
      })

      if (!mapItem) return
      if (typeof bot.equip === 'function') {
        bot
          .equip(mapItem, 'hand')
          .then(() => {
            this.debug('Đã cầm map lên tay chính.', { slot: mapItem.slot, name: mapItem.name })
          })
          .catch((error) => {
            this.debug('Equip map thất bại.', { error: error.message })
          })
      }
    } catch (error) {
      this.debug('tryHoldMap lỗi.', { error: error.message })
    }
  }

  async handleMapPacket(name, packet) {
    const bot = this.bot
    const dimensions = this.extractDimensions(packet)
    const mapId =
      packet.itemDamage ?? packet.mapId ?? packet.mapid ?? packet.id ?? packet.itemId ?? 'latest'
    const { width, height, x, y } = dimensions
    const colors = this.extractColorData(packet)

    this.debug(`Map packet: ${name}`, {
      mapId,
      width,
      height,
      x,
      y,
      colorsLength: colors?.length || 0
    })

    if (!colors || width <= 0 || height <= 0) {
      return
    }

    const map = this.getMap(mapId)
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const src = row * width + col
        const dstX = x + col
        const dstY = y + row
        if (dstX >= 0 && dstX < 128 && dstY >= 0 && dstY < 128 && src < colors.length) {
          map[dstY * 128 + dstX] = colors[src]
        }
      }
    }

    // Always keep latest map data for onemcbypass fallback
    bot._latestMapData = { data: packet, meta: { name } }

    // ONLY proceed to equip, render, and solve if onemcbypass is active!
    if (!bot._onemcbypassActive) return

    // Render 128x128 map
    try {
      const mapSize = 128
      const fullColorBuffer = Buffer.alloc(mapSize * mapSize * 4)
      for (let i = 0; i < map.length; i++) {
        const rgba = mapColorToRGBA(map[i])
        const off = i * 4
        fullColorBuffer[off] = rgba[0]
        fullColorBuffer[off + 1] = rgba[1]
        fullColorBuffer[off + 2] = rgba[2]
        fullColorBuffer[off + 3] = rgba[3]
      }

      // Convert full color buffer to PNG base64
      const fullPngBuffer = await sharp(fullColorBuffer, {
        raw: { width: mapSize, height: mapSize, channels: 4 }
      })
        .png()
        .toBuffer()
      const imageBase64 = fullPngBuffer.toString('base64')
      const imageDataUrl = 'data:image/png;base64,' + imageBase64

      // Also save PNG file to disk
      await this.savePng(fullPngBuffer, mapId)

      // Lưu lại PNG buffer mới nhất để gửi Telegram khi captcha thành công
      this.lastCaptchaPngBuffer = fullPngBuffer

      // Send event to renderer for manual resolver
      sendEvent(bot.username, 'mapCaptchaManual', imageDataUrl)
      sendEvent(
        bot.username,
        'chat',
        '[Map Captcha] Đã nhận được ảnh bản đồ mới nhất, vui lòng giải.'
      )

      // Check if 2Captcha auto solving is configured
      const apiKey = storeinfo()?.value?.captchaApiKey || ''
      if (apiKey) {
        this.debug('Auto solving with 2Captcha...')
        this.solve2Captcha(apiKey, imageBase64, map)
      }
    } catch (err) {
      this.debug('Lỗi render/giải captcha map:', { error: err.message })
    }
  }

  async savePng(buffer, mapId) {
    try {
      const filename = `map-${Date.now()}-${String(mapId).replace(/[^a-z0-9_-]/gi, '_')}.png`
      const filePath = path.join(captchaDir, filename)
      fs.writeFileSync(filePath, buffer)
      fs.writeFileSync(latestPath, buffer)
      this.lastImageUrl = `/captchas/${filename}`
    } catch (e) {
      this.debug('Không thể lưu file PNG:', { error: e.message })
    }
  }

  async solve2Captcha(apiKey, imageBase64, map) {
    const bot = this.bot
    const mapSize = 128
    const dataLen = map.length

    try {
      // === RENDER ẢNH ĐÃ LỌC NHIỄU (cho 2Captcha) ===
      const colorHistogram = {}
      for (let i = 0; i < map.length; i++) {
        const cid = map[i]
        colorHistogram[cid] = (colorHistogram[cid] || 0) + 1
      }
      const sortedColors = Object.entries(colorHistogram)
        .sort((a, b) => b[1] - a[1])
        .map((x) => parseInt(x[0], 10))

      const bgColorID = sortedColors[0]
      const threshold = Math.floor(dataLen * 0.005) // 0.5%
      const noiseColors = new Set()
      noiseColors.add(bgColorID)
      for (const [cid, count] of Object.entries(colorHistogram)) {
        if (count < threshold) noiseColors.add(parseInt(cid, 10))
      }

      const cleanBuffer = Buffer.alloc(mapSize * mapSize * 4)
      for (let i = 0; i < map.length; i++) {
        const cid = map[i]
        const off = i * 4
        if (noiseColors.has(cid)) {
          cleanBuffer[off] = 255
          cleanBuffer[off + 1] = 255
          cleanBuffer[off + 2] = 255
          cleanBuffer[off + 3] = 255
        } else {
          cleanBuffer[off] = 0
          cleanBuffer[off + 1] = 0
          cleanBuffer[off + 2] = 0
          cleanBuffer[off + 3] = 255
        }
      }

      // Encode clean image
      const cleanPngBuffer = await sharp(cleanBuffer, {
        raw: { width: mapSize, height: mapSize, channels: 4 }
      })
        .png()
        .toBuffer()
      const cleanBase64 = cleanPngBuffer.toString('base64')

      sendEvent(bot.username, 'chat', '[Map Captcha] Đang gửi captcha lên 2Captcha...')

      const responsePost = await axios.post('http://2captcha.com/in.php', {
        key: apiKey,
        method: 'base64',
        body: cleanBase64,
        json: 1
      })

      if (responsePost.data.status !== 1) {
        sendEvent(
          bot.username,
          'chat',
          `[Map Captcha] Lỗi gửi lên API: ${responsePost.data.request}`
        )
        return
      }

      const captchaId = responsePost.data.request

      // Polling loop
      for (let attempt = 0; attempt < 15; attempt++) {
        await delay(3000)
        const responseGet = await axios.get(
          `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`
        )

        if (responseGet.data.status === 1) {
          const result = responseGet.data.request
          sendEvent(bot.username, 'chat', `[Map Captcha] Giải thành công: ${result}`)
          bot.chat(result)
          return
        }

        if (responseGet.data.request !== 'CAPCHA_NOT_READY') {
          sendEvent(
            bot.username,
            'chat',
            `[Map Captcha] Lỗi từ hệ thống giải: ${responseGet.data.request}`
          )
          return
        }
      }

      sendEvent(bot.username, 'chat', '[Map Captcha] Timeout chờ kết quả giải mã từ 2Captcha.')
    } catch (error) {
      this.debug('solve2Captcha crash:', { error: error.message })
      sendEvent(bot.username, 'chat', `[Map Captcha] Lỗi giải mã: ${error.message}`)
    }
  }

  async sendCaptchaToTelegram() {
    try {
      if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return
      }

      const answer = this.lastCaptchaAnswer
      const pngBuffer = this.lastCaptchaPngBuffer

      if (!pngBuffer) {
        this.debug('Không có ảnh captcha để gửi lên Telegram.')
        return
      }

      const caption = answer ? answer : 'error'
      this.debug(`Gửi captcha lên Telegram: ${caption}`)

      // Dùng built-in FormData + Blob (Node.js v18+)
      const form = new FormData()
      form.append('chat_id', TELEGRAM_CHAT_ID)
      form.append('caption', caption)
      form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), `captcha_${Date.now()}.png`)

      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`
      const response = await axios.post(url, form, {
        timeout: 15000
      })

      if (response.data?.ok) {
        sendEvent(this.bot.username, 'chat', '[Map Captcha] Đã giải captcha thành công ✓')
      } else {
        this.debug('Telegram API trả về lỗi:', response.data)
        sendEvent(this.bot.username, 'chat', `[Map Captcha] Telegram lỗi: ${JSON.stringify(response.data)}`)
      }
    } catch (err) {
      this.debug('Lỗi gửi captcha lên Telegram:', { error: err.message })
      sendEvent(this.bot.username, 'chat', `[Map Captcha] Lỗi gửi Telegram: ${err.message}`)
    } finally {
      // Reset sau khi gửi
      this.lastCaptchaAnswer = null
      this.lastCaptchaPngBuffer = null
    }
  }

  extractColorData(packet) {
    if (!packet || typeof packet !== 'object') return null
    const direct = packet.data || packet.colors || packet.pixels || packet.colorData
    if (Buffer.isBuffer(direct)) return direct
    if (Array.isArray(direct)) return Buffer.from(direct)

    for (const value of Object.values(packet)) {
      if (!value || typeof value !== 'object') continue
      const nested = value.data || value.colors || value.pixels || value.colorData
      if (Buffer.isBuffer(nested)) return nested
      if (Array.isArray(nested)) return Buffer.from(nested)
    }

    return null
  }

  extractDimensions(packet) {
    const candidates = [
      packet,
      ...Object.values(packet || {}).filter((value) => value && typeof value === 'object')
    ]
    for (const candidate of candidates) {
      const width = Number(candidate.columns ?? candidate.width ?? candidate.scaleX ?? 0)
      const height = Number(candidate.rows ?? candidate.height ?? candidate.scaleY ?? 0)
      const x = Number(candidate.x ?? candidate.xOffset ?? candidate.startX ?? 0)
      const y = Number(candidate.y ?? candidate.yOffset ?? candidate.startY ?? 0)
      if (width > 0 && height > 0) return { width, height, x, y }
    }
    return { width: 0, height: 0, x: 0, y: 0 }
  }

  getMap(mapId) {
    const key = String(mapId)
    if (!this.maps.has(key)) this.maps.set(key, Buffer.alloc(128 * 128, 0))
    return this.maps.get(key)
  }

  debug(message, data = null) {
    console.log(`[MapCaptcha][${this.bot.username}] ${message}`, data || '')
  }
}

function mapColorToRGBA(colorId) {
  if (colorId === 0) return [20, 24, 38, 255] // background

  const baseColors = [
    [0, 0, 0],
    [127, 178, 56],
    [247, 233, 163],
    [199, 199, 199],
    [255, 0, 0],
    [160, 160, 255],
    [167, 167, 167],
    [0, 124, 0],
    [255, 255, 255],
    [164, 168, 184],
    [151, 109, 77],
    [112, 112, 112],
    [64, 64, 255],
    [143, 119, 72],
    [255, 252, 245],
    [216, 127, 51],
    [178, 76, 216],
    [102, 153, 216],
    [229, 229, 51],
    [127, 204, 25],
    [242, 127, 165],
    [76, 76, 76],
    [153, 153, 153],
    [76, 127, 153],
    [127, 63, 178],
    [51, 76, 178],
    [102, 76, 51],
    [102, 127, 51],
    [153, 51, 51],
    [25, 25, 25],
    [250, 238, 77],
    [92, 219, 213],
    [74, 128, 255],
    [0, 217, 58],
    [129, 86, 49],
    [112, 2, 0],
    [209, 177, 161],
    [159, 82, 36],
    [149, 87, 108],
    [112, 108, 138],
    [186, 133, 36],
    [103, 117, 53],
    [160, 77, 78],
    [57, 41, 35],
    [135, 107, 98],
    [87, 92, 92],
    [122, 73, 88],
    [76, 62, 92],
    [76, 50, 35],
    [76, 82, 42],
    [142, 60, 46],
    [37, 22, 16],
    [189, 48, 49],
    [148, 63, 97],
    [92, 25, 29],
    [22, 126, 134],
    [58, 142, 140],
    [86, 44, 62],
    [20, 180, 133],
    [100, 100, 100],
    [216, 175, 147],
    [127, 167, 150]
  ]

  const baseIndex = Math.floor(colorId / 4)
  const shade = colorId % 4
  const multipliers = [0.71, 0.86, 1, 0.53]
  const base = baseColors[baseIndex] || [255, 0, 255]
  const multiplier = multipliers[shade] || 1
  return [
    Math.max(0, Math.min(255, Math.round(base[0] * multiplier))),
    Math.max(0, Math.min(255, Math.round(base[1] * multiplier))),
    Math.max(0, Math.min(255, Math.round(base[2] * multiplier))),
    255
  ]
}
