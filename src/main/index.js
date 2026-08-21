/* eslint-disable no-case-declarations */
import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { machineIdSync } from 'node-machine-id'

import { proxyEvent, notify } from './js/misc/utils'
import { bots, botApi, store, state, storeinfo } from './js/bot/botState'
import { connectBot, testProxy, setProxy, exeAll, setMoveControl, runCheckProxyIp } from './js/bot/botManager'
import { startScript } from './js/bot/scriptRunner'
import { handleAuthVerify, handleVerifyAccount } from './js/auth/authHandler'
// Note: Avoid NODE_TLS_REJECT_UNAUTHORIZED = '0' in production to protect against MITM attacks.
if (is.dev && process.env.ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}
process.on('uncaughtException', (err) => {
  console.error('[FATAL uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL unhandledRejection]', reason)
})

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1110,
    height: 700,
    minWidth: 1110,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    maximizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: !app.isPackaged
    }
  })

  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
    mainWindow.removeMenu()
  }

  mainWindow.on('ready-to-show', () => {
    store.set('version', {
      current: state.clientVersion
    })
    mainWindow.webContents.send('setConfig', store.get('config'), store.get('version'))
    if (!storeinfo()) {
      mainWindow.webContents.send('initConfig')
    }
    if (store.get('config.namefile')) {
      mainWindow.webContents.send('fileSelected', 'nameFileLabel', store.get('config.namefile'))
    }
    mainWindow.show()
  })

  ipcMain.removeAllListeners('win:invoke')
  ipcMain.on('win:invoke', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    switch (action) {
      case 'min':
        win.minimize()
        break
      case 'max':
        if (win.isMaximized()) {
          win.unmaximize()
        } else {
          win.maximize()
        }
        break
      case 'close':
        win.close()
        break
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.bot.toolmc')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    optimizer.registerFramelessWindowIpc(window)
  })

  createMainWindow()
})

ipcMain.on('playerList', (event, list) => {
  state.playerList = list
  console.log('[DEBUG ipcMain playerList] RECEIVED list:', list, 'length:', list.length)
})

ipcMain.handle('get-hwid', async () => {
  try {
    const hwid = machineIdSync(true)
    return hwid
  } catch (error) {
    console.error('Failed to get HWID:', error)
    return null
  }
})

ipcMain.on('open', (event, id, name) => {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  dialog
    .showOpenDialog(mainWindow, {
      title: name,
      filters: [{ name: 'Text File', extensions: ['txt'] }],
      properties: ['openFile', 'multiSelections']
    })
    .then((result) => {
      if (!result.canceled) {
        store.set('config.namefile', result.filePaths[0])
        mainWindow.webContents.send('fileSelected', id, result.filePaths[0])
      }
    })
    .catch((error) => {
      console.log(error)
    })
})

ipcMain.on('setConfig', (event, type, id, value) => {
  store.set(`config.${type}.${id}`, value)
})

ipcMain.on('deleteConfig', () => {
  store.delete('config')
})

ipcMain.on('clearProxyList', () => {
  store.set('config.value.proxyList', '')
})

ipcMain.on('proxyConfig', (event, config) => {
  state.proxyFromLocal = config
  console.log('[ProxyConfig] Received from renderer:', config)
})

ipcMain.on('checkboxClick', (event, id, stateValue) => {
  if (
    [
      'controlForward',
      'controlBack',
      'controlLeft',
      'controlRight',
      'controlJump',
      'controlSprint',
      'controlSneak'
    ].includes(id)
  ) {
    const controlName = id.replace('control', '').toLowerCase()
    exeAll(`control ${controlName} ${stateValue}`)
    return
  }

  switch (id) {
    case 'toggleAntiAFK':
      exeAll(`antiafk ${stateValue}`)
      break
    case 'toggleKillAura':
      exeAll(`killaura ${stateValue}`)
      break
    case 'toggleNuker':
      exeAll(`nuker ${stateValue}`)
      break
    case 'test':
      console.log(stateValue)
      break
    default:
  }
})

ipcMain.on('controlBot', (event, username, action, ...args) => {
  console.log(
    `[DEBUG Main ipcMain controlBot] Received controlBot event from Renderer. username: ${username}, action: ${action}, args:`,
    args
  )
  botApi.emit('botEvent', username, action, args)
})

ipcMain.on('runManualScript', (event, scriptText, embeddedList) => {
  const list =
    Array.isArray(embeddedList) && embeddedList.length > 0 ? embeddedList : state.playerList
  console.log(
    '[DEBUG runManualScript] scriptText:',
    scriptText,
    'playerList:',
    list,
    'embedded:',
    embeddedList
  )
  if (list.length === 0) return notify('Error', 'No bots selected', 'error')
  list.forEach((username) => {
    console.log('[DEBUG runManualScript] starting script for:', username)
    startScript(username, scriptText)
  })
})

ipcMain.on('btnClick', (event, btn) => {
  const config = storeinfo().value
  switch (btn) {
    case 'btnStart':
      connectBot()
      break
    case 'btnStop':
      state.stopBot = true
      bots.forEach((bot, username) => {
        botApi.emit('botEvent', username, 'disconnect')
      })
      notify('Info', 'Stopped bots and joining process.', 'success')
      break
    case 'btnChat':
      exeAll('chat ' + config.chatMsg)
      break
    case 'btnDisconnect':
      exeAll('disconnect')
      break
    case 'btnReconnect':
      exeAll('disconnect')
      setTimeout(() => {
        connectBot()
      }, 2000)
      break

    // Hotbar
    case 'btnHotbarSelect':
      exeAll('sethotbar ' + config.hotbarSlot)
      break
    case 'btnUseItem':
      exeAll('useheld')
      break
    case 'btnDrop':
      exeAll('drop')
      break

    // Inventory
    case 'btnCloseWindow':
      exeAll('closewindow')
      break
    case 'btnDropAll':
      exeAll('dropall')
      break
    case 'btnWindowClick':
      exeAll('winclick ' + config.windowSlot + ' 0')
      break

    // Look
    case 'btnLook':
      exeAll('look ' + config.lookYaw + ' ' + config.lookPitch)
      break
    case 'btnLookAt':
      exeAll('lookat ' + config.lookPlayerName)
      break

    // Pathfinder
    case 'btnPathfind':
      exeAll('pathfind ' + config.pathX + ' ' + config.pathY + ' ' + config.pathZ)
      break

    // Interact
    case 'btnInteract':
      exeAll('interact')
      break
    case 'btnInteractNearest':
      exeAll('interact_nearest')
      break
    case 'btnAttackTarget':
      exeAll('attack_target')
      break
    case 'btnAttack':
      exeAll('attack')
      break
    case 'btnUseHeld':
      exeAll('useheld')
      break

    // Scoreboard
    case 'btnScoreboard':
      exeAll('scoreboard')
      break
    case 'btnRespawn':
      exeAll('respawn')
      break

    // Scripts
    case 'runScript':
      state.playerList.forEach((username) => {
        startScript(username)
      })
      break
    case 'stopScript':
      state.stopScript = true
      break

    // Proxy
    case 'proxyTestStart':
      testProxy(config.proxyList)
      break
    case 'proxyTestStop':
      state.stopProxyTest = true
      proxyEvent('', 'stop', '', '')
      break
    case 'btnCheckProxyIp':
      runCheckProxyIp(config.proxyList)
      break
    case 'proxyScrape':
      if (config.proxyType === 'none') return notify('Error', 'Select proxy type', 'error')
      notify('Info', 'Scraping proxies...', 'success')
      setProxy()
      break
    default:
      break
  }
})

ipcMain.on('botAction', (event, action) => {
  switch (action) {
    case 'startAll':
      connectBot()
      break
    case 'stopAll':
      state.stopBot = true
      bots.forEach((bot, username) => {
        botApi.emit('botEvent', username, 'disconnect')
      })
      notify('Info', 'Stopped all bots.', 'success')
      break
    case 'warmup':
      bots.forEach((bot, username) => {
        bot.setControlState('forward', true)
        setTimeout(() => bot.setControlState('forward', false), 1000)
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 500)
      })
      notify('Info', 'Warmup action sent to all bots.', 'success')
      break
    case 'reconnect':
      exeAll('disconnect')
      setTimeout(() => connectBot(), 2000)
      notify('Info', 'Reconnecting all bots...', 'info')
      break
  }
})

ipcMain.on('botControl', (event, data) => {
  console.log(
    `[DEBUG Main ipcMain botControl] Received action: ${data.action}, data:`,
    data,
    'playerList:',
    state.playerList
  )
  switch (data.action) {
    case 'disconnect':
      exeAll('disconnect')
      break
    case 'reconnect':
      exeAll('disconnect')
      setTimeout(() => connectBot(), 2000)
      break
    case 'respawn':
      exeAll('respawn')
      break
    case 'scoreboard':
      exeAll('scoreboard')
      break
    case 'chat':
      exeAll('chat ' + (data.message || ''))
      break
    case 'hotbar':
      exeAll('sethotbar ' + (data.slot || 0))
      break
    case 'useItem':
      exeAll('useheld')
      break
    case 'dropHeld':
      exeAll('drop')
      break
    case 'closeWindow':
      exeAll('closewindow')
      break
    case 'dropAll':
      exeAll('dropall')
      break
    case 'windowClick':
      const btn = data.button !== undefined ? data.button : 0
      const mode = data.mode !== undefined ? data.mode : 0
      exeAll(`winclick ${data.slot || 0} ${btn} ${mode}`)
      break
    case 'look':
      exeAll('look ' + (data.yaw || 0) + ' ' + (data.pitch || 0))
      break
    case 'lookAt':
      exeAll('lookat ' + (data.player || ''))
      break
    case 'runScript':
      bots.forEach((_, username) => {
        startScript(username, data.script || '')
      })
      break
    case 'stopScript':
      state.stopScript = true
      break
    case 'pathfind':
      exeAll('pathfind ' + (data.x || 0) + ' ' + (data.y || 0) + ' ' + (data.z || 0))
      break
    case 'move':
      setMoveControl(data.type, data.state)
      break
  }
})

ipcMain.on('proxyServiceStart', () => {
  notify('Info', `Starting proxy service`, 'info')
})

ipcMain.on('proxyServiceStop', () => {
  notify('Info', 'Proxy service stopped.', 'info')
})

ipcMain.on('proxyServiceRefreshKey', () => {
  notify('Info', 'API key refreshed.', 'success')
})

ipcMain.on('proxyTest', (event, action) => {
  const config = storeinfo().value
  if (action === 'start') {
    testProxy(config.proxyList)
  } else if (action === 'stop') {
    state.stopProxyTest = true
    proxyEvent('', 'stop', '', '')
  }
})

ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.minimize()
})

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.close()
})

ipcMain.on('resetConfig', () => {
  store.delete('config')
  notify('Info', 'Configuration reset. Please restart the app.', 'success')
})

ipcMain.on('switchUI', (event, uiName) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const isDev = process.env['ELECTRON_RENDERER_URL']
  if (uiName === 'dashboard') {
    if (isDev) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/dashboard.html`)
    } else {
      win.loadFile(join(__dirname, '../renderer/dashboard.html'))
    }
  } else {
    if (isDev) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }
})

ipcMain.handle('auth:verify', handleAuthVerify)
ipcMain.handle('verify-account', handleVerifyAccount)
