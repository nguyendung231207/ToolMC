import fs from 'fs'
import crypto from 'crypto'
import net from 'net'

import { antiafk } from '../misc/antiafk'
import { salt, delay, sendEvent, notify, cleanText } from '../misc/utils'

import {
  bots,
  activeEventHandlers,
  botApi,
  storeinfo,
  state,
  viewerPorts,
  inventoryPorts,
  radarPorts,
  botProxies
} from './botState'
import { startScript } from './scriptRunner'

const mineflayerViewer = require('prismarine-viewer').mineflayer
const {
  pathfinder,
  Movements,
  goals: { GoalNear }
} = require('mineflayer-pathfinder')
const inventoryViewer = require('mineflayer-web-inventory')
const dashboard = require('mineflayer-dashboard')
const radarPlugin = require('mineflayer-radar')(require('mineflayer'))
const mcData = require('minecraft-data')

let newBotRef = null
export function registerNewBotLauncher(fn) {
  newBotRef = fn
}

function getAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(startPort, '127.0.0.1', () => {
      server.close(() => resolve(startPort))
    })
    server.on('error', () => {
      resolve(getAvailablePort(startPort + 1))
    })
  })
}

export function parseTextComponent(comp) {
  if (typeof comp === 'string') return comp
  if (comp === null || comp === undefined) return ''
  if (typeof comp !== 'object') return String(comp)

  if (comp.type === 'compound' && comp.value) {
    let text = ''
    if (comp.value.text) {
      text += parseTextComponent(comp.value.text)
    }
    if (comp.value.extra) {
      text += parseTextComponent(comp.value.extra)
    }
    return text
  }

  if (comp.type === 'list' && Array.isArray(comp.value)) {
    return comp.value.map((v) => parseTextComponent(v)).join('')
  }

  if (comp.type === 'string') {
    return String(comp.value || '')
  }

  let text = ''
  if (comp.text) text += typeof comp.text === 'string' ? comp.text : parseTextComponent(comp.text)
  if (comp.extra && Array.isArray(comp.extra)) {
    comp.extra.forEach((c) => (text += parseTextComponent(c)))
  }
  return text
}

export function sendActiveWindowState(bot, username) {
  if (!bot) return
  const activeWin = bot.currentWindow
  let titleText = 'Kho đồ cá nhân'
  let windowType = 'inventory'
  let containerSlots = 0
  let slotsArray = []

  if (activeWin) {
    const rawTitle = activeWin.title
    try {
      titleText = parseTextComponent(typeof rawTitle === 'string' ? JSON.parse(rawTitle) : rawTitle)
    } catch {
      titleText = typeof rawTitle === 'string' ? rawTitle : JSON.stringify(rawTitle)
    }
    titleText = String(titleText)
    windowType = activeWin.type || 'minecraft:chest'
    containerSlots =
      activeWin.inventoryStart !== undefined
        ? activeWin.inventoryStart
        : activeWin.slots.length - 36
    if (containerSlots < 0) containerSlots = 0

    slotsArray = activeWin.slots.map((item) => {
      if (!item) return null
      return {
        name: item.name,
        count: item.count,
        displayName: item.displayName || item.name
      }
    })
  } else {
    if (bot.inventory) {
      slotsArray = bot.inventory.slots.map((item) => {
        if (!item) return null
        return {
          name: item.name,
          count: item.count,
          displayName: item.displayName || item.name
        }
      })
    }
  }

  sendEvent(username, 'windowUpdate', {
    windowId: activeWin ? activeWin.id : 'inventory',
    windowTitle: titleText,
    windowType: windowType,
    containerSlots: containerSlots,
    slots: slotsArray
  })
}

export function setupBotHandlers(bot, options) {
  bot.customScoreboard = {}
  let reconnectScheduled = false
  let hitTimer = 0

  const coerceGameDimensions = () => {
    if (bot.game) {
      if (typeof bot.game.minY === 'bigint') {
        bot.game.minY = Number(bot.game.minY)
      }
      if (typeof bot.game.height === 'bigint') {
        bot.game.height = Number(bot.game.height)
      }
    }
  }
  bot.on('login', coerceGameDimensions)
  bot.on('game', coerceGameDimensions)
  bot.on('spawn', coerceGameDimensions)

  const handleDisconnect = (reason, isKick = false) => {
    if (reconnectScheduled) return
    reconnectScheduled = true

    clearTimeout(bot._connectionTimeout)
    if (bot._inventorySyncInterval) {
      clearInterval(bot._inventorySyncInterval)
      bot._inventorySyncInterval = null
    }
    if (bot.viewer) {
      try {
        bot.viewer.close()
      } catch (e) { }
    }
    botApi.removeListener('botEvent', eventHandler)
    activeEventHandlers.delete(options.username)
    bots.delete(options.username)
    botProxies.delete(options.username)

    if (bot._mapCaptcha) {
      try {
        bot._mapCaptcha.detach()
      } catch (e) {
        console.error('Lỗi khi detach MapCaptcha:', e)
      }
      bot._mapCaptcha = null
    }

    if (bot._captchaOpenHandler) {
      bot.removeListener('windowOpen', bot._captchaOpenHandler)
      bot.removeListener('windowClose', bot._captchaCloseHandler)
      bot._captchaActive = false
    }

    if (state.stopBot) {
      sendEvent(options.username, 'kicked', reason)
      sendEvent(options.username, 'end', reason)
      return
    }

    let cleanReason = reason
    if (typeof reason === 'object') {
      try {
        cleanReason = cleanText(reason)
      } catch (e) {
        cleanReason = String(reason)
      }
    }

    const isAutoReconnect = storeinfo().boolean.autoReconnect && !bot._manualDisconnect
    const delayMs = parseInt(storeinfo().value.reconnectDelay) || 5000

    if (isAutoReconnect) {
      sendEvent(
        options.username,
        'chat',
        `Mất kết nối (${cleanReason}). Tự động kết nối lại sau ${Math.round(delayMs / 1000)} giây...`
      )
      sendEvent(options.username, 'kicked', reason, { reconnecting: true })
      sendEvent(options.username, 'end', reason, { reconnecting: true })

      setTimeout(() => {
        if (state.stopBot) return
        if (bots.has(options.username)) return
        if (newBotRef) {
          newBotRef(options)
        } else {
          console.error('[BotHandlers] newBotRef is not registered!')
        }
      }, delayMs)
    } else {
      sendEvent(options.username, 'chat', `Mất kết nối (${cleanReason}).`)
      sendEvent(options.username, 'kicked', reason, { reconnecting: false })
      sendEvent(options.username, 'end', reason, { reconnecting: false })
    }
  }

  bot.on('error', (err) => {
    clearTimeout(bot._connectionTimeout)
    console.log(`[Bot Error] ${options.username}:`, err)
    sendEvent(options.username, 'chat', `Error: ${err.message}`)

    if (err.message && err.message.includes('invalid_grant')) {
      sendEvent(
        options.username,
        'chat',
        'Lỗi xác thực (invalid_grant). Đang tự động xóa bộ nhớ cache session...'
      )
      if (options.profilesFolder) {
        try {
          fs.rmSync(options.profilesFolder, { recursive: true, force: true })
          sendEvent(
            options.username,
            'chat',
            'Đã xóa session cũ. Vui lòng xác thực lại Device Code ở lần kết nối tiếp theo.'
          )
        } catch (rmErr) {
          console.error(`Failed to delete profile folder for ${options.username}:`, rmErr)
        }
      }
    }
  })

  bot.once('end', (reason) => {
    console.log(`[Bot End] ${options.username}:`, reason)
    handleDisconnect(reason, false)
  })

  bot.once('kicked', (reason) => {
    console.log(`[Bot Kicked] ${options.username}:`, reason)
    handleDisconnect(reason, true)
  })

  bot.on('connect', () => {
    console.log(`[Connect] ${options.username} - TCP connection established`)
    sendEvent(options.username, 'chat', 'TCP connected, waiting for login...')
  })

  bot.once('login', () => {
    clearTimeout(bot._connectionTimeout)
    sendEvent(bot._client.username, 'login')
    if (options.proxyHost) {
      sendEvent(bot._client.username, 'proxy', `${options.proxyHost}:${options.proxyPort}`)
    }
    if (storeinfo().boolean.runOnConnect) {
      startScript(bot._client.username)
    }
    if (storeinfo().value.joinMessage) {
      bot.chat(storeinfo().value.joinMessage)
    }
  })

  bot.once('spawn', () => {
    bot.loadPlugin(antiafk)
    // Tắt Terminal Dashboard để terminal/cmd có thể cuộn, bôi đen và sao chép log bình thường.
    // Vì dự án đã chạy bằng giao diện Electron (GUI) nên Terminal Dashboard này là dư thừa.
    /*
    if (process.stdout.isTTY) {
      try {
        dashboard(bot)
      } catch (err) {
        console.error('Cannot initialize Terminal Dashboard:', err.message)
      }
    }
    */
  })

  bot.once('inject_allowed', () => {
    bot._client.on('packet', (data, meta) => {
      if (meta.name && /^map$|map_data|map_update|map_item_data$/i.test(meta.name)) {
        bot._latestMapData = { data, meta }
      }

      if (bot._onemcbypassActive) {
        console.log(
          `[DEBUG] onemcbypass active. Received packet: ${meta.name}`,
          meta.name === 'map' ? data : ''
        )
        if (meta.name.includes('map') || meta.name === 'set_slot' || meta.name === 'window_items') {
          // sendEvent(bot._client.username, 'chat', `[Debug] Có packet: ${meta.name} (Check Console)`)
        }
      }

      if (meta.name === 'scoreboard_objective') {
        const titleJSON = data.displayText
        try {
          const parsed = JSON.parse(titleJSON)
          const title = parseTextComponent(parsed)
          bot.customScoreboard['title'] = title
        } catch (e) {
          bot.customScoreboard['title'] = 'Scoreboard'
        }
      }

      if (meta.name === 'teams') {
        if (data.mode === 0 || data.mode === 2) {
          const teamName = data.team
          if (teamName.startsWith('TAB-Sidebar-') || teamName.startsWith('SB-')) {
            try {
              const prefix = data.prefix ? parseTextComponent(JSON.parse(data.prefix)) : ''
              const suffix = data.suffix ? parseTextComponent(JSON.parse(data.suffix)) : ''
              const fullText = (prefix + suffix).trim()
              if (fullText) {
                bot.customScoreboard[teamName] = fullText
              }
            } catch (e) { }
          }
        }
      }
    })
  })

  bot.on('spawn', () => {
    console.log(`[Spawn] ${bot._client.username} spawned.`)
    sendEvent(bot._client.username, 'chat', 'Connected to the server.')

    if (!bot.customScoreboard) bot.customScoreboard = {}
    bot.loadPlugin(pathfinder)

    const origWrite = bot._client.write.bind(bot._client)
    bot._client.write = (name, data) => {
      if (name.includes('chat') || name.includes('command') || name === 'chat_message') {
        console.log(
          `[DEBUG WRITE][${bot._client.username}] name=${name} data=`,
          JSON.stringify(data, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
        )
      }
      if (name === 'accept_teleportation') return
      return origWrite(name, data)
    }

    const autoCommands = storeinfo().value.autoCommands
    console.log(
      `[Spawn] ${bot._client.username} spawned. AutoCommands:`,
      autoCommands ? 'YES' : 'NO'
    )
    if (autoCommands && !bot._autoCommandsRan) {
      bot._autoCommandsRan = true
      startScript(bot._client.username, autoCommands)
    }

    sendActiveWindowState(bot, bot._client.username)
    if (bot._inventorySyncInterval) clearInterval(bot._inventorySyncInterval)
    bot._inventorySyncInterval = setInterval(() => {
      if (bots.has(options.username)) {
        sendActiveWindowState(bot, options.username)
      }
    }, 1000)
  })

  bot.on('death', () => {
    sendEvent(bot._client.username, 'chat', 'Bot died.')
    const isAutoRespawn =
      storeinfo().boolean.autoRespawn !== undefined
        ? storeinfo().boolean.autoRespawn
        : storeinfo().value.autoRespawn || false
    if (isAutoRespawn) {
      setTimeout(() => {
        bot.respawn()
        sendEvent(bot._client.username, 'chat', 'Auto respawning...')
      }, 2000)
    }
  })

  bot.on('messagestr', (msg) => {
    sendEvent(bot._client.username, 'chat', msg)
  })

  bot.on('windowOpen', (window) => {
    if (!window) return
    const rawTitle = window.title
    let titleText = ''
    try {
      titleText = parseTextComponent(typeof rawTitle === 'string' ? JSON.parse(rawTitle) : rawTitle)
    } catch {
      titleText = typeof rawTitle === 'string' ? rawTitle : JSON.stringify(rawTitle)
    }
    titleText = String(titleText)
    sendEvent(
      bot._client.username,
      'chat',
      `Window Opened: "${titleText}" | slots: ${window.slots?.length || 0}`
    )
    sendActiveWindowState(bot, bot._client.username)
  })

  bot.on('windowClose', (window) => {
    if (!window) return
    const rawTitle = window.title
    let titleText = ''
    try {
      titleText = parseTextComponent(typeof rawTitle === 'string' ? JSON.parse(rawTitle) : rawTitle)
    } catch {
      titleText = typeof rawTitle === 'string' ? rawTitle : JSON.stringify(rawTitle)
    }
    titleText = String(titleText)
    sendEvent(bot._client.username, 'chat', `Window Closed: "${titleText}"`)
    sendActiveWindowState(bot, bot._client.username)
  })

  bot.on('physicTick', () => {
    const config = storeinfo()
    if (config.boolean.toggleKillAura && state.playerList.includes(bot._client.username)) {
      killaura()
    }
  })

  function killaura() {
    if (hitTimer <= 0) {
      const config = storeinfo()
      const attacked = hit(
        config.boolean.kaPlayers,
        config.boolean.kaVehicles,
        config.boolean.kaMobs,
        config.boolean.kaAnimals,
        parseFloat(config.value.kaRange) || 3.5,
        true
      )
      if (attacked) {
        hitTimer = parseInt(config.value.kaDelay) || 12
      }
    } else {
      hitTimer--
    }
  }

  function hit(player, vehicle, mob, animal, maxDistance, rotate) {
    const config = storeinfo()
    const entities = Object.values(bot.entities)
    const target = entities
      .filter((entity) => {
        if (entity === bot.entity) return false
        const dist = bot.entity.position.distanceTo(entity.position)
        if (dist > maxDistance) return false

        if (entity.type === 'player' && entity.username !== bot.username && player) return true
        if (entity.kind === 'Vehicles' && vehicle) return true
        if (entity.kind === 'Hostile mobs' && mob) return true
        if (entity.kind === 'Passive mobs' && animal) return true
        return false
      })
      .sort(
        (a, b) =>
          bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position)
      )[0]

    if (target) {
      if (rotate) bot.lookAt(target.position.offset(0, target.height || 0, 0))

      if (config.boolean.kaAutoCrit) {
        if (bot.entity.onGround) {
          bot.setControlState('jump', true)
          bot.setControlState('jump', false)
        }
        if (bot.entity.velocity.y < 0) {
          bot.attack(target)
          return true
        }
        return false
      } else {
        bot.attack(target)
        return true
      }
    }
    return false
  }

  const eventHandler = (target, event, ...eventArgs) => {
    if (target !== options.username) return
    const optionsArray = eventArgs[0] || []
    switch (event) {
      case 'disconnect':
        console.log(
          `[DEBUG Main eventHandler] Disconnect triggered manually for bot: ${options.username}`
        )
        bot._manualDisconnect = true
        sendEvent(options.username, 'kicked', 'Manually disconnected')
        sendEvent(options.username, 'end', 'Manually disconnected')
        bots.delete(options.username)

        if (bot._client && bot._client.socket) {
          console.log(`[DEBUG Main eventHandler] Force destroying socket for ${options.username}`)
          try {
            bot._client.socket.destroy()
          } catch (e) {
            console.error(`[DEBUG Main eventHandler] Failed to destroy socket: ${e.message}`)
          }
        }

        if (typeof bot.quit === 'function') {
          try {
            bot.quit()
          } catch (e) { }
        } else if (typeof bot.end === 'function') {
          try {
            bot.end()
          } catch (e) { }
        }
        break
      case 'respawn':
        bot.respawn()
        sendEvent(bot._client.username, 'chat', 'Manual respawning...')
        break
      case 'chat':
        const bypass = storeinfo().boolean.bypassChat ? ' ' + salt(crypto.randomInt(2, 6)) : ''
        const chatMsg =
          optionsArray
            .join(' ')
            .replaceAll('{random}', salt(4))
            .replaceAll('{player}', bot._client.username)
            .replaceAll('{password}', options.password || '') + bypass
        console.log(`[DEBUG CHAT SEND][${options.username}] Passing message to bot.chat: "${chatMsg}"`)
        try {
          bot.chat(chatMsg)
          sendEvent(options.username, 'chat', `=> [Đã gửi] ${chatMsg}`)
        } catch (chatErr) {
          console.error(`[DEBUG CHAT SEND][${options.username}] bot.chat error:`, chatErr)
          sendEvent(options.username, 'chat', `Lỗi gửi chat: ${chatErr.message}`)
        }
        break
      case 'notify':
        notify(
          'Bot',
          bot._client.username +
          ': ' +
          optionsArray
            .join(' ')
            .replaceAll('{random}', salt(4))
            .replaceAll('{player}', bot._client.username)
            .replaceAll('{password}', options.password || ''),
          'success'
        )
        break
      case 'sethotbar':
        bot.setQuickBarSlot(parseInt(optionsArray[0] ? optionsArray[0] : 0))
        break
      case 'useheld':
        bot.activateItem()
        break
      case 'winclick':
        if (!bot.currentWindow) {
          sendEvent(bot.username, 'chat', `[WinClick] No window open. Cannot click.`)
          break
        }
        let rawSlotStr = optionsArray[0] || '0'
        let wcSlot = 0
        let isInvOffset = false

        if (rawSlotStr.startsWith('inv:') || rawSlotStr.startsWith('i:')) {
          const parsed = parseInt(rawSlotStr.split(':')[1]) || 0
          if (parsed >= 9 && parsed <= 44) {
            const containerSlots =
              bot.currentWindow.inventoryStart !== undefined
                ? bot.currentWindow.inventoryStart
                : bot.currentWindow.slots.length - 36
            if (containerSlots > 0) {
              wcSlot = parsed - 9 + containerSlots
              isInvOffset = true
            } else {
              wcSlot = parsed
            }
          } else {
            wcSlot = parsed
          }
        } else {
          wcSlot = parseInt(rawSlotStr)
        }

        const wcButton = parseInt(optionsArray[1] || '0')
        const wcMode = parseInt(optionsArray[2] || '0')

        const winSlotsCount =
          bot.currentWindow.inventoryStart !== undefined
            ? bot.currentWindow.inventoryStart
            : bot.currentWindow.slots.length - 36
        const chestType =
          winSlotsCount === 54
            ? 'Rương lớn (9x6)'
            : winSlotsCount === 27
              ? 'Rương nhỏ (9x3)'
              : `GUI (${winSlotsCount} ô)`

        sendEvent(
          bot.username,
          'chat',
          `[WinClick] Thiết bị: ${chestType}. Click absolute slot: ${wcSlot} (Button: ${wcButton}, Mode: ${wcMode})${isInvOffset ? ' [Tự động dịch chuyển ô kho đồ]' : ''}`
        )
          ; (async () => {
            try {
              await bot.clickWindow(wcSlot, wcButton, wcMode)
              sendEvent(
                bot.username,
                'chat',
                `[WinClick] Thành công ô ${wcSlot} button=${wcButton} ✓`
              )
            } catch (err) {
              sendEvent(bot.username, 'chat', `[WinClick] Lỗi: ${err.message}`)
            }
          })()
        break
      case 'drop':
        if (optionsArray.length > 0 && optionsArray[0] !== 'undefined') {
          bot.clickWindow(-999, 0, 0)
          bot.clickWindow(parseInt(optionsArray[0]), 0, 0)
          bot.clickWindow(-999, 0, 0)
        } else {
          bot.tossStack(bot.heldItem)
        }
        break
      case 'dropall':
        ; (async () => {
          const items = bot.inventory.items()
          for (const item of items) {
            try {
              await bot.tossStack(item)
            } catch (e) { }
            await delay(100)
          }
        })()
        break
      case 'closewindow':
        bot.closeWindow(bot.currentWindow || '')
        break
      case 'control':
        bot.setControlState(optionsArray[0], optionsArray[1] === 'true')
        break
      case 'look':
        bot.look(parseFloat(optionsArray[0]), parseFloat(optionsArray[1]))
        break
      case 'lookat':
        const lookTarget = bot.players[optionsArray[0]]?.entity
        if (lookTarget) bot.lookAt(lookTarget.position.offset(0, lookTarget.height, 0))
        break
      case 'startmove':
        bot.setControlState(optionsArray[0], true)
        break
      case 'stopmove':
        bot.setControlState(optionsArray[0], false)
        break
      case 'attack': {
        const range = parseFloat(storeinfo().value.interactRange) || 4.5
        const mob = bot.nearestEntity(
          (e) => e.kind === 'Hostile mobs' && bot.entity.position.distanceTo(e.position) <= range
        )
        if (mob) {
          bot.attack(mob)
          sendEvent(bot.username, 'chat', `[Combat] Đang tấn công: ${mob.displayName || mob.name}`)
        } else {
          sendEvent(
            bot.username,
            'chat',
            `[Combat] Không tìm thấy quái vật trong phạm vi ${range}m`
          )
        }
        break
      }
      case 'attack_target': {
        const targetEnt = bot.entityAtCursor(parseFloat(storeinfo().value.interactRange) || 4.5)
        if (targetEnt) {
          bot.attack(targetEnt)
          sendEvent(
            bot.username,
            'chat',
            `[Combat] Tấn công mục tiêu: ${targetEnt.displayName || targetEnt.name}`
          )
        } else {
          sendEvent(bot.username, 'chat', `[Combat] Không có mục tiêu trong tầm ngắm.`)
        }
        break
      }
      case 'pathfind':
        if (optionsArray.length === 3) {
          const x = parseFloat(optionsArray[0])
          const y = parseFloat(optionsArray[1])
          const z = parseFloat(optionsArray[2])
          const data = mcData(bot.version)
          if (!data)
            return sendEvent(
              bot._client.username,
              'chat',
              `Error: Version ${bot.version} not supported by pathfinder.`
            )
          const movements = new Movements(bot, data)
          bot.pathfinder.setMovements(movements)
          bot.pathfinder.setGoal(new GoalNear(x, y, z, 1))
        }
        break
      case 'nuker': {
        const conf = storeinfo().value
        const nukerEnabled = optionsArray[0] === 'true'
        const targetStr = conf.nukerBlock || 'stone'
        const range = parseInt(conf.nukerRange) || 5
        const delayMs = parseInt(conf.nukerDelay) || 100

        if (bot.nukerInterval) {
          clearInterval(bot.nukerInterval)
          bot.nukerInterval = null
        }

        if (nukerEnabled) {
          sendEvent(
            bot.username,
            'chat',
            `[Nuker] Bắt đầu tìm và phá: ${targetStr} (Range: ${range}, Delay: ${delayMs}ms)`
          )

          bot.nukerInterval = setInterval(async () => {
            if (bot.isDigging) return
            let matching = []
            if (isNaN(targetStr)) {
              const block = bot.registry.blocksByName[targetStr.toLowerCase()]
              if (block) matching = [block.id]
              else {
                sendEvent(bot.username, 'chat', `[Nuker] Lỗi: Không tìm thấy block '${targetStr}'`)
                clearInterval(bot.nukerInterval)
                return
              }
            } else {
              matching = [parseInt(targetStr)]
            }

            const blocks = bot.findBlocks({
              matching: matching,
              maxDistance: range,
              count: 1
            })

            if (blocks.length === 0) return

            const targetBlock = bot.blockAt(blocks[0])
            if (targetBlock && bot.canDigBlock(targetBlock)) {
              try {
                await bot.lookAt(targetBlock.position)
                await bot.dig(targetBlock)
              } catch (err) {
                if (err.name !== 'InterruptError') {
                  sendEvent(bot.username, 'chat', `[Nuker] Lỗi khi phá block: ${err.message}`)
                }
              }
            }
          }, delayMs)
          notify('Bot', `${bot._client.username}: Nuker Enabled`, 'success')
        } else {
          sendEvent(bot.username, 'chat', `[Nuker] Đã dừng.`)
          notify('Bot', `${bot._client.username}: Nuker Disabled`, 'success')
        }
        break
      }
      case 'interact': {
        const intRange = parseFloat(storeinfo().value.interactRange) || 4.5
        const ent = bot.entityAtCursor(intRange)
        if (ent) {
          bot.activateEntity(ent)
          sendEvent(
            bot.username,
            'chat',
            `[Interact] Tương tác với: ${ent.displayName || ent.name}`
          )
          break
        }
        const block = bot.blockAtCursor(intRange)
        if (block) {
          bot.activateBlock(block)
          sendEvent(bot.username, 'chat', `[Interact] Tương tác với block: ${block.name}`)
        } else {
          bot.activateItem()
          sendEvent(bot.username, 'chat', `[Interact] Sử dụng item đang cầm.`)
        }
        break
      }
      case 'interact_nearest': {
        const nearRange = parseFloat(storeinfo().value.interactRange) || 4.5
        const nearEnt = bot.nearestEntity(
          (e) => e.position.distanceTo(bot.entity.position) <= nearRange && e.type !== 'player'
        )
        if (nearEnt) {
          bot.activateEntity(nearEnt)
          sendEvent(
            bot.username,
            'chat',
            `[Interact] Tương tác với thực thể gần nhất: ${nearEnt.displayName || nearEnt.name}`
          )
        } else {
          sendEvent(bot.username, 'chat', `[Interact] Không tìm thấy thực thể nào gần đây.`)
        }
        break
      }
      case 'antiafk':
        if (optionsArray[0] === 'true') {
          bot.afk?.start()
        } else {
          bot.afk?.stop()
        }
        break
      case 'resetmove':
        bot.clearControlStates()
        break
      case 'look_old':
        bot.look(parseFloat(optionsArray[0]), 0, true)
        break
      case 'afkon':
        bot.afk.start()
        break
      case 'afkoff':
        bot.afk.stop()
        break
      case 'hit':
        const p = optionsArray[0]
        const v = optionsArray[1]
        const m = optionsArray[2]
        const a = optionsArray[3]
        const maxDist = parseFloat(optionsArray[4])
        const rot = optionsArray[5]
        hit(p, v, m, a, maxDist, rot)
        break
      case 'viewer':
        if (optionsArray[0] === 'start') {
          if (!bot.entity) {
            sendEvent(
              target,
              'chat',
              'Vui lòng đợi bot kết nối và vào game (Spawned) trước khi mở Monitor Viewer.'
            )
            return
          }
          if (bot.viewer) {
            const currentPort = viewerPorts.get(target)
            const proxyUsedStr = botProxies.get(target) || 'Direct'
            sendEvent(target, 'viewerReady', {
              url: `http://localhost:${currentPort}`,
              proxy: proxyUsedStr
            })
            return
          }

          getAvailablePort(state.nextViewerPort).then((port) => {
            state.nextViewerPort = port + 1
            try {
              mineflayerViewer(bot, { port: port, firstPerson: true })
              viewerPorts.set(target, port)
              const proxyUsedStr = botProxies.get(target) || 'Direct'
              sendEvent(target, 'viewerReady', {
                url: `http://localhost:${port}`,
                proxy: proxyUsedStr
              })
            } catch (e) {
              sendEvent(target, 'chat', 'Viewer Start Error: ' + e.message)
            }
          })
        } else if (optionsArray[0] === 'stop') {
          if (bot.viewer) {
            try {
              bot.viewer.close()
            } catch (e) { }
            bot.viewer = null
            viewerPorts.delete(target)
            sendEvent(target, 'chat', 'Viewer stopped.')
          }
        }
        break
      case 'inventory':
        if (optionsArray[0] === 'start') {
          if (!bot.entity) {
            sendEvent(
              target,
              'chat',
              'Vui lòng đợi bot kết nối và vào game (Spawned) trước khi mở Túi đồ.'
            )
            return
          }
          if (!bot.inventory) {
            sendEvent(
              target,
              'chat',
              'Lỗi: Tính năng Túi đồ bị tắt trên bot này (Chế độ Minimal đang kích hoạt).'
            )
            return
          }
          if (bot.webInventory && bot.webInventory.isRunning) {
            const currentPort = inventoryPorts.get(target)
            sendEvent(target, 'inventoryReady', `http://localhost:${currentPort}`)
            return
          }

          getAvailablePort(state.nextInventoryPort).then((port) => {
            state.nextInventoryPort = port + 1
            try {
              inventoryViewer(bot, { port: port, startOnLoad: true })
              inventoryPorts.set(target, port)
              sendEvent(target, 'inventoryReady', `http://localhost:${port}`)
            } catch (e) {
              sendEvent(target, 'chat', 'Inventory Start Error: ' + e.message)
            }
          })
        } else if (optionsArray[0] === 'stop') {
          if (bot.webInventory && bot.webInventory.isRunning) {
            bot.webInventory.stop().catch(() => { })
            inventoryPorts.delete(target)
            sendEvent(target, 'chat', 'Inventory Viewer stopped.')
          }
        }
        break
      case 'radar':
        if (optionsArray[0] === 'start') {
          if (!bot.entity) {
            sendEvent(
              target,
              'chat',
              'Vui lòng đợi bot kết nối và vào game (Spawned) trước khi mở Radar.'
            )
            return
          }
          if (bot.radarActive) {
            const currentPort = radarPorts.get(target)
            sendEvent(target, 'radarReady', `http://localhost:${currentPort}`)
            return
          }

          getAvailablePort(state.nextRadarPort).then((port) => {
            state.nextRadarPort = port + 1
            try {
              radarPlugin(bot, { port: port, host: 'localhost' })
              bot.radarActive = true
              radarPorts.set(target, port)

              if (bot.radarInterval) clearInterval(bot.radarInterval)
              bot.radarInterval = setInterval(() => {
                if (bot && bot.entity) {
                  bot.emit('move')
                }
              }, 1000)

              sendEvent(target, 'radarReady', `http://localhost:${port}`)
            } catch (e) {
              sendEvent(target, 'chat', 'Radar Start Error: ' + e.message)
            }
          })
        } else if (optionsArray[0] === 'stop') {
          if (bot.radarInterval) {
            clearInterval(bot.radarInterval)
            bot.radarInterval = null
          }
          sendEvent(target, 'chat', 'Radar view hidden.')
        }
        break
      case 'status':
        const pos = bot.entity?.position
        if (pos) {
          const statusMsg = `
             Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}
             Health: ${bot.health} | Food: ${bot.food}
             GameMode: ${bot.game.gameMode}
           `.trim()
          sendEvent(bot._client.username, 'chat', statusMsg)
        }
        break
      case 'scoreboard': {
        let sidebar = Object.values(bot.scoreboards).find(
          (sb) => sb.position === 'sidebar' || sb.position === 1 || sb.name === 'sidebar'
        )

        // Fallback: Tìm objective không chứa chữ 'TAB' trong tên và có chứa items
        if (!sidebar) {
          sidebar = Object.values(bot.scoreboards).find(
            (sb) => sb.name && !sb.name.toLowerCase().includes('tab') && Object.keys(sb.itemsMap || {}).length > 0
          )
        }

        // Fallback cuối cùng: Lấy bảng điểm có dòng items
        if (!sidebar) {
          sidebar = Object.values(bot.scoreboards).find(
            (sb) => Object.keys(sb.itemsMap || {}).length > 0
          )
        }

        const stripMcColors = (text) => {
          if (!text) return ''
          return text.replace(/§[0-9a-flmnor]/g, '')
        }

        const minecraftToHtml = (text) => {
          if (!text) return ''
          const colors = {
            '0': '#000000',
            '1': '#0000AA',
            '2': '#00AA00',
            '3': '#00AAAA',
            '4': '#AA0000',
            '5': '#AA00AA',
            '6': '#FFAA00',
            '7': '#AAAAAA',
            '8': '#555555',
            '9': '#5555FF',
            'a': '#55FF55',
            'b': '#55FFFF',
            'c': '#FF5555',
            'd': '#FF55FF',
            'e': '#FFFF55',
            'f': '#FFFFFF'
          }
          let parts = text.split(/§([0-9a-f])/gi)
          if (parts.length === 1) return `<span>${text}</span>`

          let result = '<span>'
          if (parts[0]) result += parts[0]

          for (let i = 1; i < parts.length; i += 2) {
            const colorCode = parts[i].toLowerCase()
            const content = parts[i + 1] || ''
            result += `</span><span style="color: ${colors[colorCode] || '#fff'}">${content}`
          }
          result += '</span>'
          return result.replace(/§[l-or]/gi, '')
        }

        // Hàm phân giải placeholder (§0, §1...) thành Prefix + Suffix của Team
        const getTeamText = (memberName) => {
          const team = Object.values(bot.teams || {}).find(
            (t) => t.members && t.members.includes(memberName)
          )
          if (!team) return memberName

          const getCompText = (comp) => {
            if (!comp) return ''
            if (typeof comp === 'string') return comp
            if (typeof comp.toString === 'function') return comp.toString()
            return JSON.stringify(comp)
          }

          const prefix = getCompText(team.prefix)
          const suffix = getCompText(team.suffix)
          return prefix + suffix
        }

        if (sidebar) {
          // 1. Phân giải các dòng Scoreboard bằng Team prefix + suffix
          const records = Object.values(sidebar.itemsMap || {}).sort((a, b) => b.value - a.value)
          const validLines = []

          records.forEach((item) => {
            const resolvedText = getTeamText(item.name)
            // Lọc bỏ dòng rác (chỉ chứa khoảng trắng hoặc mã màu mà không có chữ/ký tự hiển thị thực sự)
            if (stripMcColors(resolvedText).trim().length > 0) {
              validLines.push(resolvedText)
            }
          })

          // 2. Lưu log vào scoreboard_debug.txt sạch sẽ và đúng trọng tâm
          const rawTitle = (bot.customScoreboard && bot.customScoreboard['title'] && bot.customScoreboard['title'].length > 1)
            ? bot.customScoreboard['title']
            : (sidebar.title || sidebar.name || 'Board')

          let fileLog = `=== BẢNG ĐIỂM SIDEBAR ===\n`
          fileLog += `${stripMcColors(rawTitle)}\n`
          fileLog += `-------------------------\n`
          if (validLines.length === 0) {
            fileLog += `(Bảng điểm trống hoặc chưa tải dòng xong)\n`
          } else {
            validLines.forEach((line) => {
              fileLog += `${stripMcColors(line)}\n`
            })
          }
          fileLog += `=========================\n`

          try {
            // fs.writeFileSync('scoreboard_debug.txt', fileLog, 'utf8')
            // sendEvent(bot._client.username, 'chat', `[DEBUG] Đã lưu Scoreboard Sidebar vào scoreboard_debug.txt!`)
          } catch (err) {
            sendEvent(bot._client.username, 'chat', `[DEBUG] Lỗi ghi file: ${err.message}`)
          }

          // 3. Tạo giao diện HTML gửi lên GUI
          let uiMsg = `<div class="mc-scoreboard" style="font-family: monospace; background: rgba(0,0,0,0.85); padding: 15px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); line-height: 1.6;">`
          const titleHtml = minecraftToHtml(rawTitle)
          uiMsg += `<div style="font-weight: bold; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px; margin-bottom: 8px;">${titleHtml}</div>`

          validLines.forEach((line) => {
            uiMsg += `<div>${minecraftToHtml(line)}</div>`
          })
          uiMsg += '</div>'
          sendEvent(bot._client.username, 'scoreboardData', uiMsg)
        } else {
          try {
            let debugText = "=== KHÔNG TÌM THẤY SIDEBAR. CÁC OBJECTIVE HIỆN CÓ ===\n";
            for (const name in bot.scoreboards) {
              const sb = bot.scoreboards[name];
              debugText += `Name: ${sb.name} | Title: ${sb.title} | Position: ${sb.position}\n`;
              debugText += `Items count: ${Object.keys(sb.itemsMap || {}).length}\n`;
              debugText += `Items:\n`;
              Object.values(sb.itemsMap || {}).forEach(item => {
                debugText += `  - ${item.name}: ${item.value}\n`;
              });
              debugText += `-------------------\n`;
            }
            // fs.writeFileSync('scoreboard_debug.txt', debugText, 'utf8');
            sendEvent(bot._client.username, 'chat', 'Chưa tìm thấy Scoreboard Sidebar. Đã ghi các objective hiện có vào scoreboard_debug.txt!');
          } catch (e) {
            sendEvent(bot._client.username, 'chat', `Chưa tìm thấy Scoreboard Sidebar. (Lỗi ghi file debug: ${e.message})`);
          }
        }
        break
      }
      case 'status_full':
        try {
          const infoData = {
            username: bot._client.username,
            health: bot.health !== undefined ? bot.health : 20,
            food: bot.food !== undefined ? bot.food : 20,
            position: bot.entity?.position
              ? {
                x: Math.floor(bot.entity.position.x),
                y: Math.floor(bot.entity.position.y),
                z: Math.floor(bot.entity.position.z)
              }
              : { x: 0, y: 0, z: 0 },
            dimension: bot.game?.dimension || 'overworld',
            gameMode: bot.game?.gameMode || 'survival',
            inventory: bot.inventory
              ? bot.inventory.items().map((i) => `${i.name} x${i.count}`)
              : [],
            scoreboard: null
          }

          if (Object.keys(bot.customScoreboard).length > 0) {
            let sbBody = `**${bot.customScoreboard['title'] || 'Scoreboard'}**\n`
            const sorted = Object.keys(bot.customScoreboard)
              .filter((k) => k !== 'title')
              .sort()
            for (const k of sorted) sbBody += `${bot.customScoreboard[k]}\n`
            infoData.scoreboard = sbBody
          }

          sendEvent(bot._client.username, 'botInfoData', infoData)
        } catch (err) {
          console.error('Bot Info Error:', err)
        }
        break
    }
  }

  eventHandler.username = options.username
  activeEventHandlers.set(options.username, eventHandler)
  botApi.on('botEvent', eventHandler)
}
