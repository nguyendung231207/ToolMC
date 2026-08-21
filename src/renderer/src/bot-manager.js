/**
 * ToolMC - Bot Manager Module
 * Shared bot management functions used by both index.js and dashboard.js
 *
 * This module handles:
 * - Player/bot list management
 * - Bot output cards
 * - Chat logging
 * - Viewer frame management
 */

; (function () {
  'use strict'

  // ============================================================
  // BOT LIST MANAGEMENT
  // ============================================================

  function isPlayerInList(name) {
    const list = document.getElementById('botList')
    if (!list) return false
    return Array.from(list.children).some((li) => li.dataset.name === name)
  }

  function addPlayer(name) {
    const list = document.getElementById('botList')
    if (!list) {
      console.warn('[BotManager] botList not found in DOM — addPlayer aborted for', name)
      return
    }

    const auto = document.getElementById('autoSelect')?.checked

    if (isPlayerInList(name)) return

    const b = document.createElement('li')
    b.className = 'bot-list-item flex items-center justify-between p-2 rounded cursor-pointer mb-1'
    b.dataset.name = name

    b.innerHTML = `
      <div class="flex items-center gap-2 pointer-events-none" style="min-width: 0; flex: 1;">
        <div class="bot-avatar" style="width:20px;height:20px;border-radius:4px;background:var(--primary);flex-shrink: 0;"></div>
        <span class="bot-name font-medium text-sm" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">${name}</span>
      </div>
      <div class="flex items-center gap-2" style="flex-shrink: 0; margin-left: 8px;">
        <div class="bot-status online" style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>
      </div>
    `

    b.onclick = () => {
      b.classList.toggle('selected')
      updateSelected()
    }
    list.appendChild(b)
    list.scrollTop = list.scrollHeight
    updateBotCount()
    if (auto) {
      b.classList.add('selected')
    }
    updateSelected()

    createBotOutputCard(name)
  }

  function removePlayer(name) {
    const list = document.querySelectorAll('.bot-list-item')
    list.forEach((bot) => {
      if (bot.dataset.name === name) {
        bot.remove()
        updateSelected()
      }
    })
    updateBotCount()
    removeBotOutputCard(name)
  }

  function updateSelected() {
    const list = document.getElementById('botList')
    if (!list) return
    const selectedBots = Array.from(list.children).filter((bot) =>
      bot.classList.contains('selected')
    )
    const listToSend = selectedBots.map((bot) => bot.dataset.name)
    window.electron?.ipcRenderer?.send('playerList', listToSend)
  }

  function updateBotCount() {
    const list = document.getElementById('botList')
    if (!list) return
    const count = document.getElementById('statBotsRunning')
    if (count) count.textContent = list.children.length
    const totalAccounts = document.getElementById('statAccountsAdded')
    if (totalAccounts) {
      const accountList = document.getElementById('accountList')
      if (accountList) {
        const lines = accountList.value.split('\n').filter((l) => l.trim())
        totalAccounts.textContent = lines.length
      }
    }
  }

  function selectAll(auto) {
    const list = document.getElementById('botList')
    if (!list) return
    const allSelected = Array.from(list.children).every((li) => li.classList.contains('selected'))
    Array.from(list.children).forEach((bot) => {
      if (auto) {
        bot.classList.toggle('selected', true)
      } else {
        bot.classList.toggle('selected', !allSelected)
      }
    })
    updateSelected()
  }

  // ============================================================
  // BOT OUTPUT CARDS
  // ============================================================

  function createBotOutputCard(botName) {
    const container = document.getElementById('botOutputsContainer')
    if (!container) return

    const existing = document.getElementById(`bot-output-${botName}`)
    if (existing) return

    const card = document.createElement('div')
    card.className =
      'bot-output-card flex flex-col mb-4 bg-black/40 border border-white/5 rounded-lg overflow-hidden'
    card.id = `bot-output-${botName}`

    card.innerHTML = `
      <div class="bot-output-card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div class="bot-output-card-title flex items-center gap-2">
          <span class="bot-output-card-status" id="bot-status-dot-${botName}" style="width:8px;height:8px;border-radius:50%;background:#eab308;display:inline-block;" title="Đang kết nối..."></span>
          <span class="font-bold text-sm">${botName}</span>
          <span class="bot-proxy-badge" id="proxy-badge-${botName}" style="display:none;font-size:10px;padding:3px 6px;background:#3b82f6;color:white;border-radius:4px;margin-left:6px;cursor:help;align-items:center;justify-content:center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </span>
        </div>
        <div class="bot-output-card-actions flex gap-2 items-center">
          <button class="btn-viewer-icon hover:text-primary transition-colors" data-action="toggleViewer" data-bot="${botName}" title="Toggle Monitor Viewer" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn-inventory-icon hover:text-primary transition-colors" data-action="toggleInventory" data-bot="${botName}" title="Toggle Inventory Viewer" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.9a2 2 0 0 1-1.6-.8L14.3 3.5a2 2 0 0 0-1.6-.8H11.3a2 2 0 0 0-1.6.8L8.1 5.2a2 2 0 0 1-1.6.8H2.6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h17.4z"/></svg>
          </button>
          <button class="btn-radar-icon hover:text-primary transition-colors" data-action="toggleRadar" data-bot="${botName}" title="Toggle Radar Minimap" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2 2.8c-.3.4-.8.6-1.3.4l-3-.9c-.5-.2-1 .1-1.2.6l-.9 3c-.1.5.1 1 .5 1.3l2.8 2c.4.3.9.1 1.2-.2l2-2.8c.3-.4.3-.9.1-1.3l-.9-3c-.2-.5-.7-.8-1.2-.6z"/></svg>
          </button>
          <button data-action="clearBotOutput" data-bot="${botName}" class="btn-viewer-icon hover:text-primary transition-colors mx-1" title="Clear Chat Log" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
      <div class="bot-output-body-wrapper" style="position: relative; width: 100%; flex: 1; height: 280px;">
        <ul class="bot-output-card-body" id="bot-output-body-${botName}" style="width: 100%; height: 280px; overflow-y: auto;"></ul>
        <div id="bot-viewer-container-${botName}" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000;"></div>
      </div>
    `
    container.appendChild(card)

    card
      .querySelector('[data-action="clearBotOutput"]')
      .addEventListener('click', () => clearBotOutput(botName))
    card.querySelector('[data-action="toggleViewer"]').addEventListener('click', (e) => {
      e.stopPropagation()
      showFrameView(botName, 'viewer')
    })
    card.querySelector('[data-action="toggleInventory"]').addEventListener('click', (e) => {
      e.stopPropagation()
      showFrameView(botName, 'inventory')
    })
    card.querySelector('[data-action="toggleRadar"]').addEventListener('click', (e) => {
      e.stopPropagation()
      showFrameView(botName, 'radar')
    })
  }

  function removeBotOutputCard(botName) {
    const card = document.getElementById(`bot-output-${botName}`)
    if (card) card.remove()
    // Clean up any captcha overlay that might be dangling
    const overlay = document.getElementById(`captcha-overlay-${botName}`)
    if (overlay) overlay.remove()
  }

  function clearBotOutput(botName) {
    const body = document.getElementById(`bot-output-body-${botName}`)
    if (body) body.innerHTML = ''
  }

  function toggleBotOutput(botName) {
    const card = document.getElementById(`bot-output-${botName}`)
    if (!card) return
    const bodyWrapper = card.querySelector('.bot-output-body-wrapper')
    const btn = card.querySelector('.toggle-btn')
    const currentMaxHeight = bodyWrapper.style.maxHeight
    const isCollapsed = currentMaxHeight === '0px' || card.dataset.collapsed === 'true'

    if (isCollapsed) {
      bodyWrapper.style.maxHeight = bodyWrapper.dataset.origHeight || '280px'
      bodyWrapper.style.overflow = ''
      if (btn) btn.textContent = '-'
      card.dataset.collapsed = 'false'
    } else {
      bodyWrapper.dataset.origHeight = bodyWrapper.style.maxHeight || '280px'
      bodyWrapper.style.maxHeight = '0px'
      bodyWrapper.style.overflow = 'hidden'
      if (btn) btn.textContent = '+'
      card.dataset.collapsed = 'true'
    }
  }

  // ============================================================
  // CHAT & LOGGING
  // ============================================================

  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function logChat(prefix, name, text) {
    const enable = document.getElementById('enableChat')?.checked
    if (enable === false) return

    const body = document.getElementById(`bot-output-body-${name}`)
    if (!body) return

    const li = document.createElement('li')
    li.innerHTML = `
      <div class="msg-header">
        <span class="msg-prefix">[${prefix}]</span>
        <span class="msg-name">${name}:</span>
      </div>
      <div class="msg-content">${escapeHtml(text)}</div>
    `
    body.appendChild(li)

    const scroll = document.getElementById('autoScrollChat')?.checked
    if (scroll !== false) {
      body.scrollTop = body.scrollHeight
    }
  }

  function directChat(string) {
    const container = document.getElementById('botOutputsContainer')
    if (!container || container.children.length === 0) return
    const firstBody = container.querySelector('[id^="bot-output-body-"]')
    if (!firstBody) return
    const li = document.createElement('li')
    li.innerHTML = string
    firstBody.appendChild(li)
    firstBody.scrollTop = firstBody.scrollHeight
  }

  // ============================================================
  // VIEWER, INVENTORY & RADAR IN CARD
  // ============================================================

  const activeViews = new Map() // botName -> 'none' | 'viewer' | 'inventory' | 'radar'

  function showFrameView(name, type) {
    const logBody = document.getElementById(`bot-output-body-${name}`)
    const viewerContainer = document.getElementById(`bot-viewer-container-${name}`)
    if (!logBody || !viewerContainer) return

    const currentView = activeViews.get(name) || 'none'

    // If clicking the same active view, close it and show logs
    if (currentView === type) {
      viewerContainer.style.display = 'none'
      logBody.style.display = ''
      viewerContainer.innerHTML = ''

      // Stop the server/service on main process
      window.electron?.ipcRenderer?.send('controlBot', name, type, 'stop')
      activeViews.set(name, 'none')
      return
    }

    // If a different view is active, stop it first
    if (currentView !== 'none') {
      window.electron?.ipcRenderer?.send('controlBot', name, currentView, 'stop')
    }

    // Switch to the new view
    logBody.style.display = 'none'
    viewerContainer.style.display = 'block'
    viewerContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">Loading ${type}...</div>`

    // Start the server/service on main process
    window.electron?.ipcRenderer?.send('controlBot', name, type, 'start')
    activeViews.set(name, type)
  }

  function addViewerFrame(name, url, proxy) {
    const viewerContainer = document.getElementById(`bot-viewer-container-${name}`)
    if (!viewerContainer || viewerContainer.style.display === 'none') return

    viewerContainer.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%; background: #000;">
        ${proxy
        ? `
        <div style="position: absolute; top: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; padding: 4px 10px; font-size: 11px; z-index: 10; display: flex; justify-content: space-between;">
          <span>Proxy: ${proxy}</span>
        </div>
        `
        : ''
      }
        <iframe src="${url}" style="width: 100%; height: 100%; border: none;"></iframe>
      </div>
    `
  }

  // ============================================================
  // IPC EVENT HANDLER
  // ============================================================

  let botEventHandlerSetup = false

  function setupBotEventHandler() {
    if (botEventHandlerSetup) return
    botEventHandlerSetup = true

    window.electron?.ipcRenderer?.on('botEvent', (event, info) => {
      // console.log('[BotManager] botEvent received:', JSON.stringify(info))
      switch (info.event) {
        case 'connecting':
          if (!isPlayerInList(info.id)) addPlayer(info.id)
          const connDot = document.getElementById(`bot-status-dot-${info.id}`)
          if (connDot) {
            connDot.style.background = '#eab308'
            connDot.title = 'Đang kết nối...'
          }
          break
        case 'login':
          if (!isPlayerInList(info.id)) addPlayer(info.id)
          logChat('Bot', info.id, 'Connected to the server.')
          const loginDot = document.getElementById(`bot-status-dot-${info.id}`)
          if (loginDot) {
            loginDot.style.background = '#22c55e'
            loginDot.title = 'Online'
          }
          break
        case 'spawn':
          if (!isPlayerInList(info.id)) addPlayer(info.id)
          const spawnDot = document.getElementById(`bot-status-dot-${info.id}`)
          if (spawnDot) {
            spawnDot.style.background = '#22c55e'
            spawnDot.title = 'Online'
          }
          logChat('Bot', info.id, 'Đã vào map (Spawned).')
          break
        case 'viewerReady': {
          let url = info.message
          let proxy = ''
          if (typeof info.message === 'object') {
            url = info.message.url
            proxy = info.message.proxy
          }
          addViewerFrame(info.id, url, proxy)
          break
        }
        case 'inventoryReady': {
          let url = info.message
          addViewerFrame(info.id, url, '')
          break
        }
        case 'radarReady': {
          let url = info.message
          addViewerFrame(info.id, url, '')
          break
        }
        case 'chat':
          if (!isPlayerInList(info.id)) addPlayer(info.id)
          logChat('Bot', info.id, info.message)
          break
        case 'proxy':
          // Show proxy badge in bot card header
          const badge = document.getElementById(`proxy-badge-${info.id}`)
          if (badge) {
            badge.title = `Proxy: ${info.message}`
            badge.style.display = 'inline-flex'
          }
          break
        case 'kicked': {
          let kickMessage = info.message
          try {
            const parsed =
              typeof info.message === 'string' ? JSON.parse(info.message) : info.message
            let mcString = ''
            const recurseColor = (obj) => {
              if (!obj) return
              if (typeof obj === 'string') {
                mcString += obj
                return
              }
              if (Array.isArray(obj)) {
                obj.forEach(recurseColor)
                return
              }
              let colorVal = null
              let boldVal = false
              let italicVal = false
              let underlineVal = false
              let strikeVal = false

              if (obj.color) colorVal = obj.color
              if (obj.bold) boldVal = obj.bold
              if (obj.italic) italicVal = obj.italic
              if (obj.underlined) underlineVal = obj.underlined
              if (obj.strikethrough) strikeVal = obj.strikethrough

              if (obj.type === 'compound' && obj.value) {
                const val = obj.value
                if (val.color && val.color.type === 'string') colorVal = val.color.value
                if (val.bold && val.bold.value === true) boldVal = true
                if (val.italic && val.italic.value === true) italicVal = true
                if (val.underlined && val.underlined.value === true) underlineVal = true
                if (val.strikethrough && val.strikethrough.value === true) strikeVal = true
              }

              let prefix = ''
              const colorCodeMap = {
                black: '0',
                dark_blue: '1',
                dark_green: '2',
                dark_aqua: '3',
                dark_red: '4',
                dark_purple: '5',
                gold: '6',
                gray: '7',
                dark_gray: '8',
                blue: '9',
                green: 'a',
                aqua: 'b',
                red: 'c',
                light_purple: 'd',
                yellow: 'e',
                white: 'f'
              }
              if (colorVal && colorCodeMap[colorVal]) prefix += '§' + colorCodeMap[colorVal]
              if (boldVal) prefix += '§l'
              if (italicVal) prefix += '§o'
              if (underlineVal) prefix += '§n'
              if (strikeVal) prefix += '§m'

              if (prefix) {
                mcString += prefix
              }

              if (obj.text !== undefined && obj.text !== null) {
                recurseColor(obj.text)
              }

              if (obj.value !== undefined && obj.value !== null) {
                const val = obj.value
                if (obj.type === 'string') {
                  if (Array.isArray(val)) {
                    val.forEach(recurseColor)
                  } else {
                    mcString += String(val)
                  }
                } else if (obj.type === 'compound') {
                  if (Array.isArray(val)) {
                    val.forEach(recurseColor)
                  } else {
                    if (val.text !== undefined) recurseColor(val.text)
                    if (val.translate !== undefined) recurseColor(val.translate)
                    if (val.with !== undefined) recurseColor(val.with)
                    if (val.extra !== undefined) recurseColor(val.extra)
                  }
                } else if (obj.type === 'list') {
                  if (Array.isArray(val)) {
                    val.forEach(recurseColor)
                  } else {
                    recurseColor(val)
                  }
                } else {
                  recurseColor(val)
                }
              }

              if (obj.extra !== undefined && obj.extra !== null) {
                recurseColor(obj.extra)
              }
            }
            recurseColor(parsed)
            let cleanKickText = mcString
              .replace(/§[0-9a-fk-or]/gi, '')
              .replace(/\\n/g, ' ')
              .replace(/\n/g, ' ')
              .replaceAll('  ', ' ')
              .trim()
            if (cleanKickText) {
              kickMessage = cleanKickText
            } else if (typeof info.message === 'object') {
              kickMessage = JSON.stringify(info.message)
            }
          } catch (e) { }
          logChat('Bot', info.id, 'Kicked: ' + kickMessage)
          if (info.reconnecting) {
            const dot = document.getElementById(`bot-status-dot-${info.id}`)
            if (dot) {
              dot.style.background = '#ef4444'
              dot.title = 'Offline (Đang kết nối lại...)'
            }
          } else {
            removePlayer(info.id)
          }
          break
        }
        case 'end':
          logChat('Bot', info.id, 'Connection: ' + info.message)
          if (info.reconnecting) {
            const dot = document.getElementById(`bot-status-dot-${info.id}`)
            if (dot) {
              dot.style.background = '#ef4444'
              dot.title = 'Offline (Đang kết nối lại...)'
            }
          } else {
            removePlayer(info.id)
          }
          break
      }
    })
  }

  // ============================================================
  // INIT
  // ============================================================

  function initBotManager() {
    setupBotEventHandler()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBotManager)
  } else {
    initBotManager()
  }

  // Export to window
  window.BotManager = {
    addPlayer,
    removePlayer,
    updateSelected,
    updateBotCount,
    selectAll,
    createBotOutputCard,
    removeBotOutputCard,
    clearBotOutput,
    toggleBotOutput,
    logChat,
    directChat,
    showFrameView,
    toggleViewerInOutput: (name) => showFrameView(name, 'viewer'),
    addViewerFrame,
    escapeHtml
  }
})()
