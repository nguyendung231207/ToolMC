window.addEventListener('DOMContentLoaded', () => {
  // Note: Tab navigation (clicking tabs) is handled by dashboard.js
  // DO NOT add tab click logic here - it would conflict with dashboard.js

  window.electron?.ipcRenderer.send('loaded')

  window.electron?.ipcRenderer.on('setConfig', (event, config, version) => {
    setConfigValues(config)
    document.getElementById('accountList')?.dispatchEvent(new Event('input'))
    fetch('https://raw.githubusercontent.com/RattlesHyper/TrafficerMC/main/VERSION', {
      method: 'GET'
    })
      .then((response) => response.text())
      .then((result) => {
        const liveVersion = parseFloat(result)
        const currentVersion = version.current
        if (currentVersion != liveVersion) {
          // notify('Warning', 'New version available. Please update your client', 'warning')
        }
      })
    document.getElementById('versionString').innerHTML = `v${version.current}`

    // Force sync proxy badge on startup
    let useProxyState = true
    if (config && config.boolean && config.boolean.useProxy !== undefined) {
      useProxyState = config.boolean.useProxy
    } else {
      // Default to true and save to config store
      window.electron?.ipcRenderer.send('setConfig', 'boolean', 'useProxy', true)
    }
    updateProxyStatusUI(useProxyState)

    // Force sync server display if store has it
    if (config.value && config.value.server) {
      const display = document.getElementById('currentServerDisplay')
      if (display) display.innerText = config.value.server
    }
  })

  window.electron?.ipcRenderer.on('showBottab', () => {
    document.querySelector('.tab-btn[data-tab="botting"]')?.click()
  })

  const valueElements = document.querySelectorAll(
    'input[type="text"], input[type="password"], input[type="number"], input[type="range"], select, textarea'
  )
  valueElements.forEach((select) => {
    select.addEventListener('change', valueChange)
  })

  const checkboxElements = document.querySelectorAll('input[type="checkbox"]')
  checkboxElements.forEach((check) => {
    check.addEventListener('click', checkboxClick)
  })

  const buttonElements = document.querySelectorAll('button, .button, .win-btn')
  buttonElements.forEach((button) => {
    button.addEventListener('click', buttonClick)
  })

  // Theme Toggle is handled by dashboard.js - no-op here to avoid conflict

  // Note: Navigation (tab switching) is handled by dashboard.js
  // DO NOT add nav-click listeners here - they would conflict with dashboard.js

  window.electron?.ipcRenderer.on('initConfig', () => {
    valueElements.forEach((select) => {
      if (!select.id) return
      window.electron?.ipcRenderer.send('setConfig', 'value', select.id, select.value)
    })
    checkboxElements.forEach((check) => {
      if (!check.id) return
      window.electron?.ipcRenderer.send('setConfig', 'boolean', check.id, check.checked)
    })
  })

  // Clear all bot outputs
  document.getElementById('clearChat')?.addEventListener('click', () => {
    const container = document.getElementById('botOutputsContainer')
    if (!container) return
    // Clear only the log content inside each card, keep the cards
    container.querySelectorAll('.bot-output-card-body').forEach((body) => {
      body.innerHTML = ''
    })
  })

  window.electron?.ipcRenderer.on('notify', (event, title, body, type, img, keep) => {
    notify(title, body, type, img, keep)
  })

  window.electron?.ipcRenderer.on('proxyEvent', (event, info) => {
    // Route proxy test results through ProxyManager
    if (info.event === 'progress') {
      window.ProxyManager?.updateProgress(info.message.current, info.message.total)
      const countEl = document.getElementById('proxyCheckStatusCount')
      if (countEl) countEl.textContent = `${info.message.current}/${info.message.total}`
    } else if (info.event === 'result') {
      window.ProxyManager?.addResult(
        info.proxy,
        info.message.success,
        info.message.latency,
        info.message.error
      )
    } else if (info.event === 'done' || info.event === 'finished') {
      window.ProxyManager?.finishTest()
      notify('Info', 'Proxy test finished', 'success')
    } else if (info.event === 'start') {
      notify('Info', 'Proxy test started', 'success')
    }

    // Handle scraped event separately (not a test event)
    if (info.event === 'scraped') {
      const textarea = document.getElementById('proxyList')
      if (textarea) {
        textarea.value += (textarea.value ? '\n' : '') + info.message
        updateProxyList()
        notify('Success', 'Proxies scraped successfully', 'success')
      }
    }
  })

  window.electron?.ipcRenderer.on('proxyIpCheckResult', (event, info) => {
    if (info.event === 'start') {
      window._proxyIpCheckTotal = info.total
      window._proxyIpCheckCount = 0
      const initialHtml = `
        <div class="proxy-ip-check-container" style="color: white; font-family: Inter, sans-serif; display: flex; flex-direction: column; gap: 12px; min-width: 500px;">
          <div style="font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.6);" id="proxyIpCheckProgress">Đang kiểm tra: 0/${info.total}</div>
          <div style="max-height: 300px; overflow-y: auto; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; background: rgba(0, 0, 0, 0.2);">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.02);">
                  <th style="padding: 10px 12px; color: rgba(255, 255, 255, 0.4); font-weight: 500;">Proxy</th>
                  <th style="padding: 10px 12px; color: rgba(255, 255, 255, 0.4); font-weight: 500;">IP Address</th>
                  <th style="padding: 10px 12px; color: rgba(255, 255, 255, 0.4); font-weight: 500;">Quốc gia & Nhà mạng</th>
                  <th style="padding: 10px 12px; color: rgba(255, 255, 255, 0.4); font-weight: 500; text-align: right;">Trạng thái</th>
                </tr>
              </thead>
              <tbody id="proxyIpCheckTableBody">
              </tbody>
            </table>
          </div>
        </div>
      `
      showModalHtml('Check IP Proxy', '', initialHtml)
    } else if (info.event === 'result') {
      const tbody = document.getElementById('proxyIpCheckTableBody')
      if (tbody) {
        const tr = document.createElement('tr')
        tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.04)'
        tr.style.transition = 'background 0.2s'
        tr.onmouseenter = () => tr.style.background = 'rgba(255, 255, 255, 0.02)'
        tr.onmouseleave = () => tr.style.background = ''

        const statusText = info.success 
          ? '<span style="color:#10b981; font-weight:600;">Active</span>' 
          : `<span style="color:#ef4444; cursor:help;" title="${info.error || 'Failed'}">Error</span>`
        
        const location = info.success 
          ? `<span style="color: #60a5fa; font-weight: 500;">${info.country}</span> <span style="color: rgba(255, 255, 255, 0.4); font-size: 11px;">(${info.city})</span><br><span style="color: rgba(255, 255, 255, 0.35); font-size: 10px;">${info.isp}</span>` 
          : `<span style="color: rgba(255, 255, 255, 0.25);">—</span>`

        tr.innerHTML = `
          <td style="padding: 10px 12px; font-family: monospace; color: rgba(255, 255, 255, 0.85);">${info.proxy}</td>
          <td style="padding: 10px 12px; font-family: monospace; font-weight: 600; color: #fff;">${info.ip || '--'}</td>
          <td style="padding: 10px 12px; line-height: 1.3;">${location}</td>
          <td style="padding: 10px 12px; text-align: right;">${statusText}</td>
        `
        tbody.appendChild(tr)
        
        const tableContainer = tbody.parentElement?.parentElement
        if (tableContainer) {
          tableContainer.scrollTop = tableContainer.scrollHeight
        }
      }

      window._proxyIpCheckCount = (window._proxyIpCheckCount || 0) + 1
      const progress = document.getElementById('proxyIpCheckProgress')
      if (progress) {
        progress.textContent = `Đang kiểm tra: ${window._proxyIpCheckCount}/${window._proxyIpCheckTotal}`
      }
    } else if (info.event === 'done') {
      const progress = document.getElementById('proxyIpCheckProgress')
      if (progress) {
        progress.innerHTML = `Hoàn tất kiểm tra! Đã check <strong style="color: #3b82f6;">${window._proxyIpCheckTotal}</strong> proxy.`
      }
    }
  })

  window.electron?.ipcRenderer.on('botEvent', (event, info) => {
    switch (info.event) {
      case 'authmsg':
        createBotOutputCard(info.id)
        const body = document.getElementById(`bot-output-body-${info.id}`)
        if (body) {
          const li = document.createElement('li')
          li.innerHTML = `
            <div class="msg-header">
              <span class="msg-prefix">[Auth]</span>
              <span class="msg-name">${info.id}:</span>
            </div>
            <div class="msg-content">
              First time signing in. Use a web browser to open <a href="https://www.microsoft.com/link" target="_blank" rel="noreferrer" class="text-sm link" style="color: #a78bfa; text-decoration: underline; font-weight: bold;">microsoft.com/link</a> and enter the code: 
              <strong style="border-bottom: 1px dashed #a78bfa; cursor: pointer; color: #a78bfa;" onclick="navigator.clipboard.writeText('${info.message}'); notify('Success', 'Copied code!', 'success')">${info.message}</strong> [click to copy]
            </div>
          `
          body.appendChild(li)
          body.scrollTop = body.scrollHeight
        }
        break
      case 'botInfoData':
        const d = info.message

        // Helper: Minecraft Color Parser
        const parseMcColors = (text) => {
          if (!text) return ''
          const colors = {
            0: '#000000',
            1: '#0000AA',
            2: '#00AA00',
            3: '#00AAAA',
            4: '#AA0000',
            5: '#AA00AA',
            6: '#FFAA00',
            7: '#AAAAAA',
            8: '#555555',
            9: '#5555FF',
            a: '#55FF55',
            b: '#55FFFF',
            c: '#FF5555',
            d: '#FF55FF',
            e: '#FFFF55',
            f: '#FFFFFF'
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

        // Helper: Render Hearts
        const renderHearts = (hp) => {
          let html = '<div class="heart-bar">'
          for (let i = 0; i < 10; i++) {
            const heartValue = hp - i * 2
            if (heartValue >= 2) html += '<span class="text-red-500">❤️</span>'
            else if (heartValue === 1) html += '<span class="text-red-500 opacity-70">💔</span>'
            else html += '<span class="opacity-20">🖤</span>'
          }
          html += '</div>'
          return html
        }

        // Helper: Render Hunger
        const renderHunger = (food) => {
          let html = '<div class="hunger-bar">'
          for (let i = 0; i < 10; i++) {
            const foodValue = food - i * 2
            if (foodValue >= 2) html += '<span class="text-orange-600">🍗</span>'
            else if (foodValue === 1) html += '<span class="text-orange-600 opacity-70">🍖</span>'
            else html += '<span class="opacity-20">🦴</span>'
          }
          html += '</div>'
          return html
        }

        let html = `
          <div class="mc-font space-y-6">
            <!-- Stats Bar (Hearts & Food) -->
            <div class="grid grid-cols-2 gap-4 bg-black/40 p-4 rounded-lg border border-white/10 shadow-xl">
              <div>
                <p class="text-sm text-muted-foreground uppercase mb-1">Health (${Math.round(d.health)}/20)</p>
                ${renderHearts(d.health)}
              </div>
              <div class="text-right">
                <p class="text-sm text-muted-foreground uppercase mb-1">Hunger (${Math.round(d.food)}/20)</p>
                ${renderHunger(d.food)}
              </div>
            </div>

            <!-- Position & World -->
            <div class="grid grid-cols-3 gap-2">
              <div class="bg-black/20 p-2 rounded border border-white/5 text-center">
                <span class="text-sm block text-muted-foreground">DIMENSION</span>
                <span class="text-primary font-bold uppercase">${d.dimension}</span>
              </div>
              <div class="bg-black/20 p-2 rounded border border-white/5 text-center">
                <span class="text-sm block text-muted-foreground">GAMEMODE</span>
                <span class="text-primary font-bold uppercase">${d.gameMode}</span>
              </div>
              <div class="bg-black/20 p-2 rounded border border-white/5 text-center">
                <span class="text-sm block text-muted-foreground">POSITION</span>
                <span class="text-white text-base">${d.position.x}, ${d.position.y}, ${d.position.z}</span>
              </div>
            </div>

            <!-- Scoreboard (Minecraft Style) -->
            ${
              d.scoreboard
                ? `
            <div>
              <p class="text-sm text-muted-foreground uppercase mb-1">Scoreboard</p>
              <div class="mc-scoreboard shadow-2xl">
                ${parseMcColors(d.scoreboard)}
              </div>
            </div>
            `
                : ''
            }

            <!-- Inventory (Main + Hotbar) -->
            <div>
              <p class="text-sm text-muted-foreground uppercase mb-1">Inventory Storage</p>
              <div class="mc-inventory-grid shadow-2xl">
                ${Array.from({ length: 36 })
                  .map((_, i) => {
                    const itemStr = d.inventory[i]
                    if (itemStr) {
                      const [name, count] = itemStr.split(' x')
                      const cleanName = name.trim()
                      const iconUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/item/${cleanName}.png`

                      return `
                    <div class="mc-slot" title="${cleanName.replace(/_/g, ' ')}">
                      <img src="${iconUrl}" 
                           class="mc-item-img"
                           onerror="this.src='https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/block/${cleanName}.png'; this.onerror=()=> { this.src='./assets/mc-assets/barrier.png'; this.style.opacity='0.5'; };" />
                      <span class="mc-item-count">${count || '1'}</span>
                    </div>`
                    }
                    return `<div class="mc-slot"></div>`
                  })
                  .join('')}
              </div>
            </div>
          </div>
        `

        showModalHtml(`Bot Profile: ${d.username}`, '', html)

        // Update global tabs too
        updateGlobalInventoryUI(d.inventory)
        break

      case 'scoreboardData':
        showModal('Scoreboard Data', `Latest captured data from ${info.id}:`, info.message)
        break
      case 'kicked': {
        let kickHtml = window.BotManager.escapeHtml(info.message)
        try {
          // If already parsed object, use it; otherwise parse JSON
          const parsed = typeof info.message === 'string' ? JSON.parse(info.message) : info.message
          let mcString = ''
          const recurseColor = (obj) => {
            if (!obj) return

            // If obj is a simple string, just append it
            if (typeof obj === 'string') {
              mcString += obj
              return
            }

            // If obj is an array, iterate over its elements
            if (Array.isArray(obj)) {
              obj.forEach(recurseColor)
              return
            }

            // Extract styling if present
            let colorVal = null
            let boldVal = false
            let italicVal = false
            let underlineVal = false
            let strikeVal = false

            // Styling can be in standard format (obj.color) or NBT format (obj.value.color)
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

            // Apply formatting code if any styling exists
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

            // Now extract text content recursively from fields
            // 1. Check obj.text (Standard JSON text)
            if (obj.text !== undefined && obj.text !== null) {
              recurseColor(obj.text)
            }

            // 2. Check obj.value (NBT text or nested value)
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

            // 3. Check obj.extra (Standard JSON extra array)
            if (obj.extra !== undefined && obj.extra !== null) {
              recurseColor(obj.extra)
            }
          }
          recurseColor(parsed)

          const parseMcColorsLocal = (text) => {
            if (!text) return ''
            const colors = {
              0: '#000000',
              1: '#0000AA',
              2: '#00AA00',
              3: '#00AAAA',
              4: '#AA0000',
              5: '#AA00AA',
              6: '#FFAA00',
              7: '#AAAAAA',
              8: '#555555',
              9: '#5555FF',
              a: '#55FF55',
              b: '#55FFFF',
              c: '#FF5555',
              d: '#FF55FF',
              e: '#FFFF55',
              f: '#FFFFFF'
            }
            let parts = text.split(/§([0-9a-f])/gi)
            if (parts.length === 1)
              return `<span>${text.replace(/\\n/g, '<br>').replace(/\n/g, '<br>')}</span>`

            let result = '<span>'
            if (parts[0]) result += parts[0].replace(/\\n/g, '<br>').replace(/\n/g, '<br>')

            for (let i = 1; i < parts.length; i += 2) {
              const colorCode = parts[i].toLowerCase()
              const content = parts[i + 1] || ''
              result += `</span><span style="color: ${colors[colorCode] || '#fff'}">${content.replace(/\\n/g, '<br>').replace(/\n/g, '<br>')}`
            }
            result += '</span>'
            return result.replace(/§[l-or]/gi, '')
          }

          kickHtml = parseMcColorsLocal(mcString)
        } catch (e) {}

        const modalHtml = `
          <div class="mc-font" style="background: rgba(0,0,0,0.8); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); line-height: 1.6; word-break: break-word; color: white;">
            ${kickHtml}
          </div>
        `
        showModalHtml(`Bot Bị Kicked: ${info.id}`, 'Vui lòng kiểm tra lý do dưới đây:', modalHtml)
        break
      }
      case 'mapCaptchaManual': {
        const botName = info.id
        const body = document.getElementById(`bot-output-body-${botName}`)
        if (!body) break

        // Remove any existing captcha overlay for this bot first
        const existing = document.getElementById(`captcha-overlay-${botName}`)
        if (existing) existing.remove()

        const overlayId = `captcha-overlay-${botName}`
        const inputId = `captcha-input-${botName}`
        const imgId = `captcha-img-${botName}`
        const btnId = `captcha-btn-${botName}`

        // info.message is a dataURL (data:image/png;base64,...) from nativeImage
        const imageSrc = info.message

        const overlay = document.createElement('div')
        overlay.id = overlayId
        overlay.style.cssText = `
          position: absolute;
          top: 0; left: 0; right: 0;
          background: rgba(10, 10, 20, 0.97);
          border: 1px solid rgba(99, 102, 241, 0.5);
          border-radius: 8px;
          padding: 12px;
          z-index: 50;
          box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        `

        overlay.innerHTML = `
          <div style="text-align:center; font-size:11px; font-weight:600; color:rgba(255,255,255,0.6); margin-bottom:8px; letter-spacing:0.5px;">
            MAP CAPTCHA — VUI LÒNG GIẢI
          </div>
          <div style="text-align:center; margin-bottom:8px;">
            <img id="${imgId}" src="${imageSrc}"
              style="max-width:100%; max-height:120px; border:2px solid rgba(99,102,241,0.4); border-radius:6px; image-rendering:pixelated;" />
          </div>
          <div style="display:flex; gap:6px;">
            <input id="${inputId}" type="text"
              style="flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; padding:6px 10px; color:#fff; font-size:13px; outline:none;"
              placeholder="Nhập mã captcha..." autocomplete="off" />
            <button id="${btnId}"
              style="background:rgba(99,102,241,0.8); border:none; border-radius:6px; padding:6px 14px; color:#fff; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap;">
              Gửi
            </button>
          </div>
        `

        body.style.position = 'relative'
        body.appendChild(overlay)
        overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

        setTimeout(() => {
          const input = document.getElementById(inputId)
          const btn = document.getElementById(btnId)
          if (input) input.focus()

          const submitCaptcha = () => {
            const val = input ? input.value.trim() : ''
            if (!val) return
            console.log(
              `[DEBUG Renderer] Submitting manual map captcha for bot: ${botName}, value: ${val}`
            )
            window.electron?.ipcRenderer?.send('controlBot', botName, 'chat', val)
            const el = document.getElementById(overlayId)
            if (el) {
              el.style.transition = 'opacity 0.3s, transform 0.3s'
              el.style.opacity = '0'
              el.style.transform = 'scale(0.95)'
              setTimeout(() => el.remove(), 300)
            }
          }

          if (btn) btn.addEventListener('click', submitCaptcha)
          if (input)
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') submitCaptcha()
            })
        }, 50)
        break
      }
    }
  })

  // Click listener for visual slots
  document.addEventListener('click', (e) => {
    const slot = e.target.closest('.mc-slot')
    if (slot) {
      const slotId =
        slot.dataset.absoluteSlot !== undefined ? slot.dataset.absoluteSlot : slot.dataset.slot
      if (slotId !== undefined) {
        const windowInput = document.getElementById('windowSlot')
        if (windowInput) {
          windowInput.value = slotId
          // Optional: flashy effect
          slot.style.borderColor = 'hsl(var(--primary))'
          setTimeout(() => (slot.style.borderColor = ''), 500)
        }
      }
    }
  })

  // Listen for active window/inventory state updates
  window.electron?.ipcRenderer.on('windowUpdate', (event, info) => {
    const container = document.getElementById('visualServerGUIContainer')
    const grid = document.getElementById('visualServerGUI')
    const header = document.getElementById('guiHeader')
    const activeStatus = document.getElementById('guiActiveStatus')

    if (!container || !grid) return

    // Update status indicators
    if (activeStatus) {
      if (info.containerSlots > 0) {
        const chestType =
          info.containerSlots === 54
            ? 'Rương lớn (9x6)'
            : info.containerSlots === 27
              ? 'Rương nhỏ (9x3)'
              : `Server GUI (${info.containerSlots} ô)`
        activeStatus.innerText = `${chestType}: ${info.windowTitle}`
        activeStatus.style.color = '#f59e0b'
      } else {
        activeStatus.innerText = 'Kho đồ cá nhân'
        activeStatus.style.color = ''
      }
    }

    if (info.containerSlots > 0) {
      // Show container
      container.classList.remove('hidden')
      if (header) {
        header.innerHTML = `<span>Server GUI: ${info.windowTitle} <span class="text-[10px] opacity-75 font-mono">(${info.windowType})</span></span>`
      }

      // Re-populate server GUI grid slots
      grid.innerHTML = ''
      grid.style.display = 'grid'
      grid.style.gridTemplateColumns = 'repeat(9, minmax(0, 1fr))'
      grid.style.gap = '4px'

      for (let i = 0; i < info.containerSlots; i++) {
        const item = info.slots[i]
        const slotEl = document.createElement('div')
        slotEl.className = 'mc-slot border border-amber-500/20 hover:border-amber-500/50'
        slotEl.dataset.slot = i

        if (item) {
          const cleanName = item.name.trim()
          const iconUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/item/${cleanName}.png`
          slotEl.title = item.displayName.replace(/_/g, ' ')
          slotEl.innerHTML = `
            <img src="${iconUrl}" 
                 class="mc-item-img"
                 onerror="this.src='https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/block/${cleanName}.png'; this.onerror=()=> { this.src='./assets/mc-assets/barrier.png'; this.style.opacity='0.5'; };" />
            <span class="mc-item-count">${item.count || '1'}</span>
          `
        } else {
          slotEl.title = 'Empty'
        }
        grid.appendChild(slotEl)
      }
    } else {
      // Hide container
      container.classList.add('hidden')
      grid.innerHTML = ''
    }

    // Populate player personal inventory slots:
    const mainOffset = info.containerSlots > 0 ? info.containerSlots : 9
    const hotbarOffset = info.containerSlots > 0 ? info.containerSlots + 27 : 36

    // Populate visualInventoryMain
    const mainGrid = document.getElementById('visualInventoryMain')
    if (mainGrid) {
      const slots = mainGrid.querySelectorAll('.mc-slot')
      slots.forEach((slot) => {
        const localIdx = parseInt(slot.dataset.slot)
        const slotsArrayIdx = localIdx - 9 + mainOffset
        const item = info.slots[slotsArrayIdx]

        slot.dataset.absoluteSlot = slotsArrayIdx
        slot.innerHTML = ''

        if (item) {
          const cleanName = item.name.trim()
          const iconUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/item/${cleanName}.png`
          slot.title = item.displayName.replace(/_/g, ' ')
          slot.innerHTML = `
            <img src="${iconUrl}" 
                 class="mc-item-img"
                 onerror="this.src='https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/block/${cleanName}.png'; this.onerror=()=> { this.src='./assets/mc-assets/barrier.png'; this.style.opacity='0.5'; };" />
            <span class="mc-item-count">${item.count || '1'}</span>
          `
        } else {
          slot.title = 'Empty'
        }
      })
    }

    // Populate visualInventoryHotbar
    const hotbarGrid = document.getElementById('visualInventoryHotbar')
    if (hotbarGrid) {
      const slots = hotbarGrid.querySelectorAll('.mc-slot')
      slots.forEach((slot) => {
        const localIdx = parseInt(slot.dataset.slot)
        const slotsArrayIdx = localIdx - 36 + hotbarOffset
        const item = info.slots[slotsArrayIdx]

        slot.dataset.absoluteSlot = slotsArrayIdx
        slot.innerHTML = ''

        if (item) {
          const cleanName = item.name.trim()
          const iconUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/item/${cleanName}.png`
          slot.title = item.displayName.replace(/_/g, ' ')
          slot.innerHTML = `
            <img src="${iconUrl}" 
                 class="mc-item-img"
                 onerror="this.src='https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/block/${cleanName}.png'; this.onerror=()=> { this.src='./assets/mc-assets/barrier.png'; this.style.opacity='0.5'; };" />
            <span class="mc-item-count">${item.count || '1'}</span>
          `
        } else {
          slot.title = 'Empty'
        }
      })
    }
  })
})

function updateGlobalInventoryUI(inventory) {
  // Update all visual grids (Hotbar tab, Inventory tab)
  const grids = ['visualHotbar', 'visualInventoryMain', 'visualInventoryHotbar']

  grids.forEach((gridId) => {
    const container = document.getElementById(gridId)
    if (!container) return

    const slots = container.querySelectorAll('.mc-slot')
    slots.forEach((slot) => {
      const idx = parseInt(slot.dataset.slot)
      // d.inventory usually has 36 or more items.
      // Slot mapping: 5-8 armor, 9-35 main, 36-44 hotbar (hotbar is 0-8 in mc but 36-44 in window)
      const itemStr = inventory[idx]
      slot.innerHTML = ''

      if (itemStr) {
        const [name, count] = itemStr.split(' x')
        const cleanName = name.trim()
        const iconUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/item/${cleanName}.png`

        slot.title = cleanName.replace(/_/g, ' ')
        slot.innerHTML = `
          <img src="${iconUrl}" 
               class="mc-item-img"
               onerror="this.src='https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/textures/block/${cleanName}.png'; this.onerror=()=> { this.src='./assets/mc-assets/barrier.png'; this.style.opacity='0.5'; };" />
          <span class="mc-item-count">${count || '1'}</span>
        `
      } else {
        slot.title = 'Empty'
      }
    })
  })
}

function valueChange(event) {
  const selectedValue = event.target.value
  const selectId = event.target.id
  window.electron?.ipcRenderer.send('setConfig', 'value', selectId, selectedValue)
}

function buttonClick(event) {
  const buttonId = event.target.id

  // Exclude botting control buttons that are handled separately to prevent duplicate IPC requests
  const ignoredButtons = [
    'btnDisconnect',
    'btnReconnect',
    'btnRespawn',
    'btnScoreboard',
    'btnChat',
    'btnHotbarSelect',
    'btnUseItem',
    'btnDrop',
    'btnCloseWindow',
    'btnDropAll',
    'btnWindowClick',
    'btnWindowRightClick',
    'btnWindowShiftClick',
    'btnLook',
    'btnLookAt',
    'btnPathfind',
    'btnRunManualScript',
    'btnStopManualScript'
  ]
  if (ignoredButtons.includes(buttonId)) {
    return
  }

  switch (buttonId) {
    case 'minimize':
      window.electron?.ipcRenderer.send('win:invoke', 'min')
      break
    case 'maximize':
      window.electron?.ipcRenderer.send('win:invoke', 'max')
      break
    case 'close':
      window.electron?.ipcRenderer.send('win:invoke', 'close')
      break
    case 'resetConfig':
      window.electron?.ipcRenderer.send('deleteConfig')
      notify('Info', 'Config has been reset. Please restart the app', 'success')
      break
    case 'switchToDashboard':
      window.electron?.ipcRenderer.send('switchUI', 'dashboard')
      break
    case 'btnScoreboard':
      window.electron?.ipcRenderer.send('btnClick', 'btnScoreboard')
      break
    case 'selectAll':
      selectAll()
      break
    case 'proxyClearDupe':
      clearDupe()
      notify('Info', 'Cleared duplicate proxies', 'success')
      break
    case 'btnStart':
      // Force sync critical fields
      const accVal = document.getElementById('accountList')?.value
      if (accVal) window.electron?.ipcRenderer.send('setConfig', 'value', 'accountList', accVal)

      const cmdVal = document.getElementById('autoCommands')?.value
      if (cmdVal) window.electron?.ipcRenderer.send('setConfig', 'value', 'autoCommands', cmdVal)

      const proxyPerBotVal = document.getElementById('proxyPerBot')?.value
      if (proxyPerBotVal) window.electron?.ipcRenderer.send('setConfig', 'value', 'proxyPerBot', proxyPerBotVal)

      const reconnectDelayVal = document.getElementById('reconnectDelay')?.value
      if (reconnectDelayVal) window.electron?.ipcRenderer.send('setConfig', 'value', 'reconnectDelay', reconnectDelayVal)

      const joinDelayVal = document.getElementById('joinDelay')?.value
      if (joinDelayVal) window.electron?.ipcRenderer.send('setConfig', 'value', 'joinDelay', joinDelayVal)

      const server = document.getElementById('serverSelector')?.value
      if (!server) {
        notify('Error', 'Vui lòng chọn hoặc thêm server trước', 'error')
        return
      }

      window.electron?.ipcRenderer.send('btnClick', 'btnStart')
      break
    case 'proxyListClear':
      document.getElementById('proxyList').value = ''
      updateProxyList()
      break
    default:
      window.electron?.ipcRenderer.send('btnClick', buttonId)
      break
  }
}

function checkboxClick(event) {
  const checkId = event.target.id
  const state = event.target.checked
  window.electron?.ipcRenderer.send('setConfig', 'boolean', checkId, state)
  window.electron?.ipcRenderer.send('checkboxClick', checkId, state)

  if (checkId === 'useProxy') {
    updateProxyStatusUI(state)
  }
}

function updateProxyStatusUI(state) {
  const navProxy = document.getElementById('navProxy')
  if (!navProxy) return

  let statusBadge = navProxy.querySelector('.proxy-status-badge')
  if (!statusBadge) {
    statusBadge = document.createElement('span')
    statusBadge.className = 'proxy-status-badge'
    statusBadge.style.marginLeft = 'auto'
    statusBadge.style.fontSize = '12px'
    statusBadge.style.padding = '2px 6px'
    statusBadge.style.borderRadius = '4px'
    statusBadge.style.fontWeight = 'bold'
    navProxy.appendChild(statusBadge)
  }

  const toggleBtn = document.getElementById('btnToggleProxyService')

  if (state) {
    statusBadge.innerText = 'ON'
    statusBadge.style.backgroundColor = 'rgba(34, 197, 94, 0.2)'
    statusBadge.style.color = '#22c55e'
    if (toggleBtn) {
      toggleBtn.setAttribute('data-active', 'true')
      toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Proxy`
      toggleBtn.style.background = 'rgba(248, 81, 73, 0.1)'
      toggleBtn.style.color = '#f85149'
      toggleBtn.style.borderColor = 'rgba(248, 81, 73, 0.2)'
    }
  } else {
    statusBadge.innerText = 'OFF'
    statusBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'
    statusBadge.style.color = '#ef4444'
    if (toggleBtn) {
      toggleBtn.setAttribute('data-active', 'false')
      toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Proxy`
      toggleBtn.style.background = ''
      toggleBtn.style.color = ''
      toggleBtn.style.borderColor = ''
    }
  }
}
window.updateProxyStatusUI = updateProxyStatusUI

// Navigation is handled by dashboard.js - this function is kept for compatibility only
function navClick(event) {
  // Do nothing - navigation is handled by dashboard.js
  return
}

// This was the old navClick implementation that used sidebar-style navigation:
// function navClick(event) {
//   const target = event.currentTarget
//   const targetId = target.dataset.target
//   const groupClass = target.dataset.group
//   if (!targetId || !groupClass) return
//   const elements = document.getElementsByClassName(groupClass)
//   Array.from(elements).forEach(el => { ... })
//   ...
// }

// Update Listeners
// We need to wait for DOM or ensure this runs after new HTML is ready.
// Since we are rewriting HTML, we can assume index.js runs after body load.
// But we need to update where listeners are attached.

function setConfigValues(obj) {
  for (const keyType in obj) {
    const keys = Object.keys(obj[keyType])
    for (const key of keys) {
      // Handle special cases that might not have a direct element ID matching the key
      if (key === 'server' && keyType === 'value') {
        const display = document.getElementById('currentServerDisplay')
        if (display) display.innerText = obj.value[key] || 'None selected'
        // Also update serverSelector if it exists
        const selector = document.getElementById('serverSelector')
        if (selector) selector.value = obj.value[key] || ''
      }

      if (key === 'useProxy' && keyType === 'boolean') {
        updateProxyStatusUI(obj.boolean[key])
      }

      const element = document.getElementById(key)
      if (element) {
        if (keyType === 'value') {
          element.value = obj.value[key]
        } else if (keyType === 'boolean') {
          element.checked = obj.boolean[key]
        }
      }
    }
  }
}

window.notify = notify
function notify(title, body, type, img, keep) {
  const container = document.getElementById('notifications')
  const notification = document.createElement('div') // Changed from li to div
  notification.className = 'toast'
  if (type) notification.classList.add(type) // 'success', 'warning', 'error'

  const header = document.createElement('div')
  header.className = 'flex-between mb-1'

  const titleEl = document.createElement('h4')
  titleEl.className = 'font-bold text-sm'
  titleEl.innerText = title
  header.appendChild(titleEl)

  const closeBtn = document.createElement('span')
  closeBtn.className =
    'cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground'
  closeBtn.innerText = '✕'
  closeBtn.onclick = () => {
    notification.style.opacity = '0'
    setTimeout(() => notification.remove(), 300)
  }
  header.appendChild(closeBtn)

  const bodyEl = document.createElement('div')
  bodyEl.className = 'text-sm text-muted-foreground'
  bodyEl.innerText = body

  notification.appendChild(header)
  notification.appendChild(bodyEl)

  if (img) {
    const imgEl = document.createElement('img')
    imgEl.src = img
    imgEl.className = 'mt-2 rounded max-w-full'
    notification.appendChild(imgEl)
  }

  // Progress Bar if not persistent
  if (!keep) {
    const progress = document.createElement('div')
    progress.className = 'h-1 bg-primary mt-2 rounded'
    progress.style.width = '100%'
    progress.style.transition = 'width 3s linear'
    notification.appendChild(progress)

    // Animate and remove
    setTimeout(() => {
      progress.style.width = '0%'
    }, 100)

    setTimeout(() => {
      notification.style.opacity = '0'
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  container.appendChild(notification)
}

// ============================================================
// BOT LIST & OUTPUT — delegated to BotManager (bot-manager.js)
// ============================================================
function addPlayer(name) {
  window.BotManager.addPlayer(name)
}
function removePlayer(name) {
  window.BotManager.removePlayer(name)
}
function updateBotCount() {
  window.BotManager.updateBotCount()
}
function selectAll(auto) {
  window.BotManager.selectAll(auto)
}
function updateSelected() {
  window.BotManager.updateSelected()
}
function createBotOutputCard(botName) {
  window.BotManager.createBotOutputCard(botName)
}
function removeBotOutputCard(botName) {
  window.BotManager.removeBotOutputCard(botName)
}
function clearBotOutput(botName) {
  window.BotManager.clearBotOutput(botName)
}
function toggleBotOutput(botName) {
  window.BotManager.toggleBotOutput(botName)
}
function logChat(prefix, name, text) {
  window.BotManager.logChat(prefix, name, text)
}
function escapeHtml(text) {
  return window.BotManager.escapeHtml(text)
}
function directChat(string) {
  window.BotManager.directChat(string)
}
window.toggleViewerInOutput = function (name) {
  window.BotManager.toggleViewerInOutput(name)
}
function addViewerFrame(name, url, proxy) {
  window.BotManager.addViewerFrame(name, url, proxy)
}
function addMonitorBot(name) {
  /* stub */
}
function removeMonitorBot(name) {
  /* stub */
}

// Remaining functions unique to index.js

function logProxy(proxy, type, message) {
  const scroll = document.getElementById('autoScrollProxy').checked
  const logBox = document.getElementById('proxyLogbox')
  const li = document.createElement('li')
  li.className = type
  const updiv = document.createElement('div')
  updiv.className = 'space-h'

  const ddiv = document.createElement('div')
  const msg = document.createElement('p')
  msg.className = 'text-sm-2 mu-1'
  msg.style = 'user-select: text;'
  msg.innerHTML = message
  ddiv.appendChild(msg)

  const pl = document.createElement('p')
  pl.style = 'user-select: text;'
  pl.className = 'text-sm'
  pl.innerHTML = proxy
  updiv.appendChild(pl)

  const pr = document.createElement('p')
  pr.className = 'text-sm'
  pr.innerHTML = type

  updiv.appendChild(pr)

  li.appendChild(updiv)
  li.appendChild(ddiv)

  logBox.appendChild(li)
  if (scroll) {
    logBox.scrollTop = logBox.scrollHeight
  }
}

function clearProxyEmpty() {
  const textarea = document.getElementById('proxyList')
  const lines = textarea.value.split('\n')
  const nonEmptyLines = lines.filter(function (line) {
    return line.trim() !== ''
  })
  textarea.value = nonEmptyLines.join('\n')
}

function clearDupe() {
  const textarea = document.getElementById('proxyList')
  const lines = textarea.value.split('\n')
  const uniqueLines = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    uniqueLines[line] = true
  }
  const uniqueLinesArray = Object.keys(uniqueLines)
  const result = uniqueLinesArray.join('\n')
  textarea.value = result
}

function updateProxyList() {
  window.electron?.ipcRenderer.send(
    'setConfig',
    'value',
    'proxyList',
    document.getElementById('proxyList').value
  )
}

// Modal logic
function showModalHtml(title, description, htmlContent) {
  const modal = document.getElementById('genericModal')
  const titleEl = document.getElementById('modalTitle')
  const descEl = document.getElementById('modalDescription')
  const contentEl = document.getElementById('modalContent')

  if (modal && titleEl && contentEl) {
    titleEl.innerText = title
    if (descEl) descEl.innerText = description || ''
    contentEl.innerHTML = htmlContent
    modal.classList.add('show')
  }
}

function showModal(title, description, content) {
  showModalHtml(title, description, content.replace(/\n/g, '<br>'))
}

// Global request bot info
window.requestBotInfo = function (event, name) {
  event.stopPropagation()
  window.electron?.ipcRenderer.send('controlBot', name, 'requestInfo')
}

// Global Refresh Helper
document.getElementById('modalClose')?.addEventListener('click', () => {
  const modal = document.getElementById('genericModal')
  if (modal) modal.classList.remove('show')
})
document.getElementById('modalCloseX')?.addEventListener('click', () => {
  const modal = document.getElementById('genericModal')
  if (modal) modal.classList.remove('show')
})

// ================================
// Proxy Test Functionality
// ================================

let isTestingProxies = false

// Start proxy test
function startProxyTest() {
  const proxyList = document.getElementById('proxyList').value
  const proxyType = document.getElementById('proxyType').value

  if (proxyType === 'none') {
    return notify('Error', 'Please select a proxy type', 'error')
  }

  if (!proxyList.trim()) {
    return notify('Error', 'Please enter some proxies to test', 'error')
  }

  isTestingProxies = true
  document.getElementById('proxyLogbox').innerHTML = ''

  window.electron?.ipcRenderer.send('btnClick', 'proxyTestStart')
}

// Stop proxy test
function stopProxyTest() {
  window.electron?.ipcRenderer.send('btnClick', 'proxyTestStop')
  isTestingProxies = false
}

// Clear proxy list
function clearProxyList() {
  if (confirm('Are you sure you want to clear the proxy list?')) {
    const textarea = document.getElementById('proxyList')
    if (textarea) {
      textarea.value = ''
      updateProxyList()
    }
  }
}

// Event Listeners for Proxy Buttons
document.getElementById('proxyTestStart')?.addEventListener('click', startProxyTest)
document.getElementById('proxyTestStop')?.addEventListener('click', stopProxyTest)
document.getElementById('proxyListClear')?.addEventListener('click', clearProxyList)

// Respawn Controls
document.getElementById('autoRespawn')?.addEventListener('change', (e) => {
  window.electron?.ipcRenderer.send('setConfig', 'boolean', 'autoRespawn', e.target.checked)
})

document.getElementById('btnRespawn')?.addEventListener('click', () => {
  window.electron?.ipcRenderer.send('btnClick', 'btnRespawn')
})
// Manual Script Controls
document.getElementById('btnRunManualScript')?.addEventListener('click', () => {
  const scriptText = document.getElementById('manualScriptText').value
  if (!scriptText) return notify('Error', 'Please enter a script', 'error')
  // Send current selected bots alongside script to avoid IPC race condition
  const list = document.getElementById('botList')
  const selectedBots = Array.from(list.children)
    .filter((bot) => bot.classList.contains('selected'))
    .map((bot) => bot.dataset.name)
  window.electron?.ipcRenderer.send('runManualScript', scriptText, selectedBots)
})

document.getElementById('btnStopManualScript')?.addEventListener('click', () => {
  window.electron?.ipcRenderer.send('btnClick', 'stopScript')
})
