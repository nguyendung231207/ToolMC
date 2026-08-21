import path from 'path'
import { BrowserWindow } from 'electron'
const mineflayer = require('mineflayer')

import { connection } from '../proxy/proxyhandler'
import { checkProxy } from '../proxy/proxycheck'
import { scrapeProxy } from '../proxy/proxyscrape'
import { delay, sendEvent, proxyEvent, notify, botMode } from '../misc/utils'

import { bots, activeEventHandlers, botApi, storeinfo, state, botProxies } from './botState'
import { setupBotHandlers, registerNewBotLauncher } from './botHandlers'

let isConnecting = false

export async function connectBot() {
  if (isConnecting) {
    console.log('[DEBUG connectBot] BLOCKED - already running')
    return
  }
  isConnecting = true
  console.log('[DEBUG connectBot] ===== CALLED =====')
  state.stopBot = false
  state.currentProxy = 0
  state.botCreationIndex = 0

  const proxyListValue = state.proxyFromLocal.proxyList || storeinfo().value.proxyList || ''
  if (storeinfo().boolean.randomizeOrder && proxyListValue) {
    const rawList = proxyListValue.split(/\r?\n/).filter((p) => p.trim().length > 0)
    for (let i = rawList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rawList[i], rawList[j]] = [rawList[j], rawList[i]]
    }
    state.shuffledProxyList = rawList
  } else {
    state.shuffledProxyList = null
  }

  const accountList = storeinfo().value.accountList
  if (!accountList) {
    isConnecting = false
    return notify('Error', 'Please enter accounts (user:pass)', 'error')
  }

  const lines = accountList.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    isConnecting = false
    return notify('Error', 'No accounts found', 'error')
  }

  BrowserWindow.getAllWindows()[0].webContents.send('showBottab')

  const isLinear = storeinfo().boolean.isLinear
  const joinDelay = parseInt(storeinfo().value.joinDelay) || 1000
  console.log(
    '[DEBUG connectBot] total accounts:',
    lines.length,
    'joinDelay:',
    joinDelay,
    'isLinear:',
    isLinear
  )

  for (const line of lines) {
    if (state.stopBot) {
      isConnecting = false
      break
    }

    let username = '',
      password = '',
      authType = 'offline'
    const parts = line.split(/[:|]/)
    username = parts[0] ? parts[0].trim() : ''
    password = parts[1] ? parts[1].trim() : ''

    if (parts[2]) {
      const typeStr = parts[2].trim().toLowerCase()
      if (typeStr === 'microsoft' || typeStr === 'premium') {
        authType = 'microsoft'
      } else if (typeStr === 'thealtening') {
        authType = 'thealtening'
      } else {
        authType = 'offline'
      }
    } else {
      if (username.includes('@')) {
        authType = 'microsoft'
      }
    }

    let useProxy = storeinfo().boolean.useProxy

    const botInfo = getBotInfo(username, password, useProxy, -1, authType)
    console.log(
      '[DEBUG connectBot] calling newBot for:',
      username.trim(),
      'bots.size BEFORE:',
      bots.size
    )
    newBot(botInfo)
    console.log(
      '[DEBUG connectBot] newBot returned for:',
      username.trim(),
      'bots.size AFTER:',
      bots.size
    )

    if (isLinear) {
      await delay(joinDelay)
    } else {
      await delay(100)
    }
  }
  isConnecting = false
}

export function getBotInfo(
  botName,
  password = '',
  useProxy = true,
  botIndex = -1,
  authType = 'offline'
) {
  const server = storeinfo().value.server || 'localhost:25565'
  const [serverHost, serverPort] = server.split(':')
  const parsedPort = parseInt(serverPort) || 25565

  const proxyType = state.proxyFromLocal.proxyType || storeinfo().value.proxyType || 'none'
  const effectiveIndex = botIndex >= 0 ? botIndex : state.botCreationIndex++
  const proxyConfig = useProxy ? getProxy(proxyType, effectiveIndex) : {}

  const options = {
    host: serverHost,
    port: parsedPort,
    username: botName,
    password: password,
    version: (() => {
      const selected = storeinfo().value.versionSelect || storeinfo().value.version || false
      return selected === 'auto' ? false : selected
    })(),
    auth: authType,
    hideErrors: true,
    checkTimeoutInterval: 60000,
    ...botMode(storeinfo().value.botMode),
    ...proxyConfig
  }

  if (authType === 'microsoft') {
    options.profilesFolder = path.join(process.cwd(), 'bot_sessions', botName)
    if (!password) {
      delete options.password
    } else {
      options.authTitle = '00000000402b5328'
    }
  } else if (authType === 'thealtening') {
    options.auth = 'mojang'
    options.authServer = 'https://authserver.thealtening.com'
    options.sessionServer = 'https://sessionserver.thealtening.com'
    options.password = password || 'dummy'
  }

  return options
}

export function getProxy(proxyType, botIndex = 0) {
  const proxyListValue = state.proxyFromLocal.proxyList || storeinfo().value.proxyList || ''
  const effectiveProxyType =
    state.proxyFromLocal.proxyType !== 'none'
      ? state.proxyFromLocal.proxyType
      : proxyType || storeinfo().value.proxyType || 'none'

  if (effectiveProxyType === 'none' || !proxyListValue || proxyListValue.trim() === '') {
    console.log('[Proxy] No proxy type or empty list')
    return {}
  }

  let proxyList
  if (state.shuffledProxyList && state.shuffledProxyList.length > 0) {
    proxyList = state.shuffledProxyList
  } else {
    proxyList = proxyListValue.split(/\r?\n/).filter((p) => p.trim().length > 0)
  }

  if (proxyList.length === 0) {
    console.log('[Proxy] Proxy list is empty, skipping proxy')
    return {}
  }

  const proxyPerBot = parseInt(storeinfo().value.proxyPerBot) || 1
  const totalProxies = proxyList.length

  if (botIndex >= totalProxies * proxyPerBot) {
    console.log(`[Proxy] Bot ${botIndex} exceeds proxy capacity (${totalProxies} proxies * ${proxyPerBot} bots/proxy), using Direct connection.`)
    return {}
  }

  const proxyIndex = Math.floor(botIndex / proxyPerBot)

  const [host, port, username, password] = proxyList[proxyIndex].split(':')
  console.log(`[Proxy] Bot ${botIndex} using proxy ${proxyIndex} (proxyPerBot=${proxyPerBot}): ${host}:${port}`)
  return {
    protocol: effectiveProxyType,
    proxyHost: host,
    proxyPort: port,
    proxyUsername: username,
    proxyPassword: password
  }
}

export function newBot(options) {
  if (bots.has(options.username)) {
    console.log(`[newBot] Blocked duplicate instance for ${options.username}`)
    return
  }

  const oldHandler = activeEventHandlers.get(options.username)
  if (oldHandler) {
    botApi.removeListener('botEvent', oldHandler)
    activeEventHandlers.delete(options.username)
    console.log(
      `[newBot] Cleaned up dangling eventHandler for ${options.username} (via activeEventHandlers)`
    )
  }

  const listeners = botApi.listeners('botEvent')
  for (const listener of listeners) {
    if (listener.username === options.username) {
      botApi.removeListener('botEvent', listener)
      console.log(
        `[newBot] Cleaned up dangling eventHandler for ${options.username} (via property-matching)`
      )
    }
  }

  let bot
  console.log('[DEBUG newBot] ENTER username:', options.username, 'bots.size:', bots.size)

  const connectProxy = async (client) => {
    const proxyType = state.proxyFromLocal.proxyType || storeinfo().value.proxyType || 'none'
    console.log(
      `[Proxy] Starting proxy connection for ${options.username}: ${proxyType}://${options.proxyHost}:${options.proxyPort}`
    )
    try {
      const socket = await connection(
        proxyType,
        options.proxyHost,
        options.proxyPort,
        options.proxyUsername,
        options.proxyPassword,
        options.host,
        options.port
      )
      console.log(
        `[Proxy] Socket established for ${options.username}, connecting to ${options.host}:${options.port}`
      )
      client.setSocket(socket)
      client.emit('connect')
    } catch (error) {
      console.log(`[Proxy] Connection failed for ${options.username}:`, error)
      sendEvent(client.username, 'chat', `Proxy Error: ${error}`)
      return
    }
  }

  const proxyType = state.proxyFromLocal.proxyType || storeinfo().value.proxyType || 'none'
  if (proxyType !== 'none' && options.proxyHost) {
    options.connect = connectProxy
    const pStr = `${options.proxyHost}:${options.proxyPort}`
    botProxies.set(options.username, pStr)
  } else {
    botProxies.set(options.username, 'Direct')
  }

  sendEvent(options.username, 'connecting')
  sendEvent(options.username, 'chat', 'Initializing...')
  console.log(`[newBot] Creating bot: ${options.username}`)

  const connectionTimeout = setTimeout(() => {
    if (!bots.has(options.username)) return
    console.log(`[newBot] Connection timeout for ${options.username} - forcing disconnect`)
    sendEvent(options.username, 'chat', 'Kết nối quá hạn (Connection timeout) - Máy chủ hoặc Proxy không phản hồi')
    if (bot) {
      if (bot._client && bot._client.socket) {
        try {
          bot._client.socket.destroy()
        } catch (e) {}
      }
      if (typeof bot.quit === 'function') {
        try { bot.quit() } catch (e) {}
      } else if (typeof bot.end === 'function') {
        try { bot.end() } catch (e) {}
      }
      bot.emit('end', 'Connection Timeout')
    }
  }, 30000)

  bot = mineflayer.createBot({
    ...options,
    plugins: {
      anvil: false,
      book: false,
      boss_bar: false,
      breath: false,
      chest: false,
      command_block: false,
      craft: false,
      creative: false,
      enchantment_table: false,
      experience: false,
      explosion: false,
      fishing: false,
      furnace: false,
      generic_place: false,
      painting: false,
      particle: false,
      place_block: false,
      place_entity: false,
      rain: false,
      ray_trace: false,
      scoreboard: true,
      sound: false,
      spawn_point: false,
      tablist: true,
      team: true,
      time: false,
      title: false,
      villager: false
    },
    onMsaCode: (data) => {
      sendEvent(options.username, 'authmsg', data.user_code)
    }
  })



  bot._connectionTimeout = connectionTimeout

  bots.set(options.username, bot)

  setupBotHandlers(bot, options)
}

export async function exeAll(command) {
  if (!command) return
  const list = state.playerList
  const cmd = command.split(' ')
  if (list.length === 0) return notify('Error', 'No bots selected', 'error')
  for (let i = 0; i < list.length; i++) {
    botApi.emit('botEvent', list[i], cmd[0], cmd.slice(1))
    if (storeinfo().boolean.isLinear) {
      await delay(storeinfo().value.linearDelay || 100)
    }
  }
}

export function setMoveControl(type, stateValue) {
  bots.forEach((bot) => {
    const controlMap = {
      forward: 'forward',
      back: 'back',
      left: 'left',
      right: 'right',
      jump: 'jump',
      sprint: 'sprint',
      sneak: 'sneak'
    }
    const control = controlMap[type]
    if (control) {
      bot.setControlState(control, stateValue)
    }
  })
}

export function setProxy() {
  scrapeProxy(storeinfo().value.proxyType)
    .then((result) => {
      proxyEvent('', 'scraped', result, '')
    })
    .catch((err) => {
      console.log(err)
      notify('Error', 'Failed to scrape proxies', 'error')
    })
}

export async function testProxy(list) {
  state.stopProxyTest = false
  const config = storeinfo().value
  const server = config.server

  if (!server) return notify('Error', 'Server address not configured', 'error')

  const [serverHost, serverPort] = server.split(':')
  if (!serverHost) return notify('Error', 'Invalid server address', 'error')

  if (!list) return notify('Error', 'Please enter proxy list', 'error')
  if (config.proxyType === 'none') return notify('Error', 'Select proxy type', 'error')

  notify('Info', 'Testing proxies...', 'success')
  proxyEvent('', 'start', '', '')
  let successCount = 0
  let failCount = 0

  const lines = list.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return notify('Error', 'No valid proxies found', 'error')

  const timeout = parseInt(config.proxyCheckTimeout) || 5000
  const waitDelay = parseInt(config.proxyCheckDelay) || 100

  for (let i = 0; i < lines.length; i++) {
    if (state.stopProxyTest) break
    const count = `${i + 1}/${lines.length}`
    const parts = lines[i].split(':')
    const host = parts[0]
    const port = parts[1]
    const username = parts[2]
    const password = parts[3]

    if (!host || !port) {
      proxyEvent(lines[i], 'fail', 'Invalid Format', count)
      failCount++
      proxyEvent(
        lines[i],
        'result',
        { success: false, latency: null, error: 'Invalid Format' },
        count
      )
      proxyEvent(
        '',
        'progress',
        { current: i + 1, total: lines.length, success: successCount, fail: failCount },
        count
      )
      continue
    }

    try {
      await checkProxy(
        config.proxyType,
        host,
        port,
        username,
        password,
        serverHost,
        serverPort || 25565,
        timeout
      )
        .then((result) => {
          const msg = result.latency ? `OK (${result.latency}ms)` : 'Connected'
          proxyEvent(result.proxy, 'success', msg, count)
          successCount++
          proxyEvent(
            result.proxy,
            'result',
            { success: true, latency: result.latency, error: null },
            count
          )
        })
        .catch((error) => {
          proxyEvent(
            error.proxy || lines[i],
            'fail',
            error.reason === 'timeout' ? 'Timed Out' : error.error || 'Failed',
            count
          )
          failCount++
          proxyEvent(
            error.proxy || lines[i],
            'result',
            {
              success: false,
              latency: null,
              error: error.reason === 'timeout' ? 'Timed Out' : error.error || 'Failed'
            },
            count
          )
        })
    } catch (e) {
      proxyEvent(lines[i], 'fail', 'Internal Error', count)
      failCount++
      proxyEvent(
        lines[i],
        'result',
        { success: false, latency: null, error: 'Internal Error' },
        count
      )
    }

    proxyEvent(
      '',
      'progress',
      { current: i + 1, total: lines.length, success: successCount, fail: failCount },
      count
    )
    await delay(waitDelay)
  }

  proxyEvent('', 'done', { success: successCount, fail: failCount, total: lines.length }, '')
  proxyEvent('', 'stop', '', '')
}

export async function runCheckProxyIp(list) {
  const config = storeinfo().value
  const proxyType = config.proxyType || 'none'
  const win = BrowserWindow.getAllWindows()[0]

  if (!list) return notify('Error', 'Please enter proxy list', 'error')
  if (proxyType === 'none') return notify('Error', 'Select proxy type', 'error')

  const lines = list.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return notify('Error', 'No valid proxies found', 'error')

  win.webContents.send('proxyIpCheckResult', { event: 'start', total: lines.length })

  const timeout = parseInt(config.proxyCheckTimeout) || 5000
  const waitDelay = parseInt(config.proxyCheckDelay) || 100

  for (let i = 0; i < lines.length; i++) {
    const proxyString = lines[i]
    try {
      const result = await checkProxyIp(proxyType, proxyString, timeout)
      win.webContents.send('proxyIpCheckResult', {
        event: 'result',
        proxy: proxyString,
        success: result.success,
        ip: result.ip,
        country: result.country,
        city: result.city,
        isp: result.isp,
        error: result.error
      })
    } catch (e) {
      win.webContents.send('proxyIpCheckResult', {
        event: 'result',
        proxy: proxyString,
        success: false,
        error: e.message
      })
    }
    await delay(waitDelay)
  }

  win.webContents.send('proxyIpCheckResult', { event: 'done' })
}

export function checkProxyIp(proxyType, proxyString, timeout = 10000) {
  return new Promise((resolve) => {
    const parts = proxyString.split(':')
    const host = parts[0]
    const port = parts[1]
    const username = parts[2]
    const password = parts[3]

    if (!host || !port) {
      return resolve({ proxy: proxyString, success: false, error: 'Invalid Format' })
    }

    let isFinished = false
    const timeoutId = setTimeout(() => {
      if (isFinished) return
      isFinished = true
      resolve({ proxy: proxyString, success: false, error: 'Timed Out' })
    }, timeout)

    connection(proxyType, host, port, username, password, 'ip-api.com', 80)
      .then((socket) => {
        if (isFinished) {
          if (socket) socket.destroy()
          return
        }

        socket.write("GET /json/?fields=status,message,query,country,city,isp HTTP/1.1\r\nHost: ip-api.com\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n");

        let responseData = ''
        socket.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        socket.on('end', () => {
          if (isFinished) return
          isFinished = true
          clearTimeout(timeoutId)
          socket.destroy()

          try {
            const bodyIndex = responseData.indexOf('\r\n\r\n')
            if (bodyIndex === -1) {
              return resolve({ proxy: proxyString, success: false, error: 'Invalid Response' })
            }
            const body = responseData.substring(bodyIndex + 4).trim()
            const info = JSON.parse(body)
            if (info.status === 'success') {
              resolve({
                proxy: proxyString,
                success: true,
                ip: info.query,
                country: info.country,
                city: info.city,
                isp: info.isp
              })
            } else {
              resolve({ proxy: proxyString, success: false, error: info.message || 'API Error' })
            }
          } catch (e) {
            resolve({ proxy: proxyString, success: false, error: 'Parse Error' })
          }
        })

        socket.on('error', (err) => {
          if (isFinished) return
          isFinished = true
          clearTimeout(timeoutId)
          socket.destroy()
          resolve({ proxy: proxyString, success: false, error: err.message })
        })
      })
      .catch((err) => {
        if (isFinished) return
        isFinished = true
        clearTimeout(timeoutId)
        resolve({ proxy: proxyString, success: false, error: typeof err === 'string' ? err : err.message })
      })
  })
}

registerNewBotLauncher(newBot)

