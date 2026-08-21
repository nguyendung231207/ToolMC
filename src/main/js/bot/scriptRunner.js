import { sendEvent } from '../misc/utils'
import { bots, botApi, state, storeinfo } from './botState'
import { MapCaptcha } from './mapCaptcha'

export async function startScript(username, customScript = null) {
  console.log(
    '[DEBUG startScript] ENTER username:',
    username,
    'customScript:',
    customScript ? customScript.substring(0, 50) : 'null'
  )
  state.stopScript = false
  const scriptText = customScript || storeinfo().value.scriptText
  console.log(
    '[DEBUG startScript] scriptText:',
    scriptText ? scriptText.substring(0, 100) : 'EMPTY'
  )
  if (!scriptText) {
    console.log('[DEBUG startScript] EARLY RETURN - no scriptText')
    return
  }
  const scriptLines = scriptText.split(/\r?\n/)
  console.log(
    '[DEBUG startScript] scriptLines count:',
    scriptLines.length,
    'lines:',
    JSON.stringify(scriptLines)
  )
  console.log(
    '[DEBUG startScript] bots Map state:',
    'size:',
    bots.size,
    'keys:',
    [...bots.keys()],
    'has username?',
    bots.has(username)
  )

  const botInstance = bots.get(username)
  console.log(
    '[DEBUG startScript] botInstance:',
    botInstance ? 'EXISTS' : 'NULL/UNDEFINED',
    'bots.size:',
    bots.size
  )
  if (!botInstance) {
    console.log('[DEBUG startScript] EARLY RETURN - no botInstance')
    return
  }

  // Assign a unique run ID so old scripts stop if a new one starts
  const currentRunId = Date.now() + Math.random()
  botInstance._scriptRunId = currentRunId

  // Helper to check if script should stop
  const shouldStop = () => {
    return (
      state.stopScript || !bots.has(username) || bots.get(username)._scriptRunId !== currentRunId
    )
  }

  // Helper for interruptible wait
  const wait = async (ms) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (shouldStop()) return true // true means stopped
      await new Promise((r) => setTimeout(r, Math.min(100, end - Date.now())))
    }
    return false // false means completed normally
  }

  // Notify start
  sendEvent(username, 'chat', `[Script] Running ${scriptLines.length} lines.`)

  for (let i = 0; i < scriptLines.length; i++) {
    if (shouldStop()) {
      console.log(`[Script] Stopped for ${username}`)
      break
    }
    const line = scriptLines[i].trim()
    if (!line) continue

    console.log(`[Script] Executing: ${line}`)

    const args = line.split(' ')
    const command = args.shift().toLowerCase()

    console.log(
      `[Script] Emitting botEvent: username=${username}, command=${command}, args=${JSON.stringify(args)}`
    )
    botApi.emit('botEvent', username, command, args)
    switch (command) {
      case 'getplayers':
        if (botInstance && botInstance.players) {
          const allPlayers = Object.keys(botInstance.players)
          const otherPlayers = allPlayers.filter((p) => p !== username)

          if (otherPlayers.length === 0) {
            sendEvent(
              username,
              'chat',
              `[Start] Found 0 other players. Total keys: ${allPlayers.length}. Keys: ${allPlayers.join(', ')}`
            )
          } else {
            sendEvent(
              username,
              'chat',
              `Online Players (${otherPlayers.length}): ${otherPlayers.join(', ')}`
            )
          }
        } else {
          sendEvent(
            username,
            'chat',
            'Error: Only found ' + (botInstance ? 'no player list' : 'no bot instance')
          )
        }
        break
      case 'delay':
        if (await wait(parseInt(args[0]) || 0)) break
        break
      case 'kingmcbypass': {
        // Wait up to 3 seconds for window to open
        for (let j = 0; j < 30; j++) {
          if (botInstance.currentWindow) break
          if (await wait(100)) break
        }

        if (shouldStop()) break

        const win = botInstance.currentWindow

        // Detect if there is a captcha
        let isCaptcha = false
        if (win && win.slots) {
          isCaptcha = win.slots.some((item) => item && item.name === 'lime_stained_glass_pane')
        }

        if (!isCaptcha) {
          sendEvent(username, 'chat', '[KingmcBypass] Không có captcha, bỏ qua.')
          break
        }

        sendEvent(username, 'chat', '[KingmcBypass] Phát hiện captcha, bắt đầu giải...')

        let solvedCount = 0
        let attempts = 0
        const maxAttempts = 30 // Stop after ~45s

        while (solvedCount < 3 && attempts < maxAttempts) {
          if (shouldStop()) {
            sendEvent(username, 'chat', '[KingmcBypass] Đã dừng script.')
            break
          }

          attempts++
          const currentWin = botInstance.currentWindow

          if (!currentWin || !currentWin.slots) {
            if (await wait(500)) break
            continue
          }

          const limeSlot = currentWin.slots.findIndex(
            (item) => item && item.name === 'lime_stained_glass_pane'
          )

          if (limeSlot !== -1) {
            sendEvent(
              username,
              'chat',
              `[KingmcBypass] Click slot ${limeSlot} (Lần ${solvedCount + 1}/3)`
            )
            botInstance.clickWindow(limeSlot, 1, 0).catch(() => {})

            solvedCount++
            // Chờ 1.5s để server tải cửa sổ tiếp theo
            if (await wait(1500)) break
          } else {
            // Lime pane not found yet in this window
            if (await wait(500)) break
          }
        }

        if (shouldStop()) break

        if (solvedCount >= 3) {
          sendEvent(username, 'chat', '[KingmcBypass] Đã giải xong 3 captcha!')
        } else {
          sendEvent(username, 'chat', '[KingmcBypass] Timeout giải captcha.')
        }

        break
      }
      case 'onemcbypass': {
        const botInstance = bots.get(username)
        if (!botInstance) break

        sendEvent(
          username,
          'chat',
          '[OneMcBypass] Bắt đầu xử lý Map Captcha. Đang lấy dữ liệu bản đồ mới nhất...'
        )

        // Attach MapCaptcha dynamically if not already attached
        if (!botInstance._mapCaptcha) {
          botInstance._mapCaptcha = new MapCaptcha(botInstance)
          botInstance._mapCaptcha.attach()
        }

        botInstance._onemcbypassActive = true

        // Check if we already received the map packet recently
        if (botInstance._latestMapData) {
          sendEvent(
            username,
            'chat',
            '[OneMcBypass] Đã tìm thấy Map data lưu sẵn, tiến hành giải ngay lập tức!'
          )
          const { data, meta } = botInstance._latestMapData
          botInstance._mapCaptcha.handleMapPacket(meta.name, data)
        } else {
          sendEvent(
            username,
            'chat',
            '[OneMcBypass] Chưa thấy gói tin Bản đồ, đang chờ Server gửi xuống...'
          )
        }
        break
      }
      case 'viewer':
        if (args[0] === 'start') {
          botApi.emit('botEvent', username, 'viewer', ['start'])
        } else if (args[0] === 'stop') {
          botApi.emit('botEvent', username, 'viewer', ['stop'])
        }
        break
      case 'status':
        botApi.emit('botEvent', username, 'status', [])
        break
      case '':
        break
      default:
        botApi.emit('botEvent', username, command, args)
    }
  }
}
