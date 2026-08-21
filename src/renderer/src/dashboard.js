/**
 * ToolMC - Dashboard JS
 * New modern UI entry point
 *
 * This module handles all interactions for the dashboard.html UI:
 * - Tab navigation (main + control sub-tabs)
 * - Language switching (i18n)
 * - Theme toggle (dark/light)
 * - Proxy service controls
 * - Bot management
 * - IPC bridge to main process
 */

; (function () {
  'use strict'

  // ============================================================
  // 1. IPC BRIDGE (same pattern as original index.js)
  // ============================================================

  // window.electron = window.electron || {};

  let _config = {}
  let _selectedBots = new Set()
  let _uptimeStart = Date.now()
  let _uptimeInterval = null

  // ---- LocalStorage Keys for Proxy ----
  const PROXY_LIST_KEY = 'trafficermc_proxyList'
  const PROXY_TYPE_KEY = 'trafficermc_proxyType'

  // ---- Proxy LocalStorage Functions ----
  function saveProxyToLocal() {
    const proxyList = document.getElementById('proxyList')?.value || ''
    const proxyType = document.getElementById('proxyType')?.value || 'none'
    localStorage.setItem(PROXY_LIST_KEY, proxyList)
    localStorage.setItem(PROXY_TYPE_KEY, proxyType)

    // Also send to main process via IPC
    window.electron?.ipcRenderer?.send('proxyConfig', { proxyList, proxyType })

    console.log('[LocalStorage] Proxy saved:', {
      proxyList: proxyList.substring(0, 50) + '...',
      proxyType
    })
  }

  function loadProxyFromLocal() {
    const proxyList = localStorage.getItem(PROXY_LIST_KEY)
    const proxyType = localStorage.getItem(PROXY_TYPE_KEY)

    if (proxyList !== null) {
      const el = document.getElementById('proxyList')
      if (el) el.value = proxyList
    }
    if (proxyType !== null) {
      const el = document.getElementById('proxyType')
      if (el) el.value = proxyType
    }

    // Send to main process
    window.electron?.ipcRenderer?.send('proxyConfig', {
      proxyList: proxyList || '',
      proxyType: proxyType || 'none'
    })

    console.log('[LocalStorage] Proxy loaded:', {
      proxyType: proxyType || 'none',
      hasList: !!proxyList
    })
  }

  // ---- Notification System ----
  function notify(title, body, type = 'info', img = null, keep = false) {
    const container = document.getElementById('notifications')
    if (!container) return

    const toast = document.createElement('div')
    toast.className = `toast ${type}`

    const icons = {
      info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1f6feb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
      success:
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ea44f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      warning:
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d29922" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
      error:
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
    }

    toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${body ? `<div class="toast-body">${body}</div>` : ''}
    </div>
  `

    container.appendChild(toast)

    if (!keep) {
      setTimeout(() => {
        toast.style.opacity = '0'
        toast.style.transform = 'translateX(100%)'
        toast.style.transition = 'all 0.3s ease'
        setTimeout(() => toast.remove(), 300)
      }, 4000)
    }
  }

  // ---- Toast Message ----
  function showToast(text, duration = 2000) {
    const toast = document.getElementById('toast')
    const toastText = document.getElementById('toastText')
    if (!toast || !toastText) return

    toastText.textContent = text
    toast.style.display = 'block'
    setTimeout(() => {
      toast.style.display = 'none'
    }, duration)
  }

  // ---- Copy to Clipboard ----
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Đã sao chép thành công')
      return true
    } catch {
      showToast('Sao chép thất bại')
      return false
    }
  }

  // ============================================================
  // 2. TAB NAVIGATION
  // ============================================================

  function initNavigation() {
    // Main tab navigation
    const tabBtns = document.querySelectorAll('.tab-btn[data-group="main"]')
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab

        // Update active button
        tabBtns.forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')

        // Show target tab content
        document.querySelectorAll('.tab-content').forEach((content) => {
          content.classList.remove('active')
        })
        const targetTab = document.getElementById(`tab-${tabId}`)
        if (targetTab) targetTab.classList.add('active')
      })
    })

    // Control sub-tab navigation (botting panel)
    const controlBtns = document.querySelectorAll('.control-tab-btn')
    controlBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab

        controlBtns.forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')

        document.querySelectorAll('.control-panel').forEach((panel) => {
          panel.classList.remove('active')
        })
        const targetPanel = document.getElementById(tabId)
        if (targetPanel) targetPanel.classList.add('active')
      })
    })
  }

  // ============================================================
  // 3. THEME TOGGLE
  // ============================================================

  function initTheme() {
    const htmlEl = document.documentElement
    const themeBtn = document.getElementById('themeToggleBtn')
    const iconSun = document.getElementById('iconSun')
    const iconMoon = document.getElementById('iconMoon')

    // Read stored preference
    const storedTheme = localStorage.getItem('theme') || 'dark'
    if (storedTheme === 'light') {
      htmlEl.classList.remove('dark')
      htmlEl.classList.add('light')
      iconSun.style.display = 'none'
      iconMoon.style.display = 'block'
    } else {
      htmlEl.classList.add('dark')
      htmlEl.classList.remove('light')
      iconSun.style.display = 'block'
      iconMoon.style.display = 'none'
    }

    themeBtn?.addEventListener('click', () => {
      const isLight = htmlEl.classList.contains('light')

      if (isLight) {
        htmlEl.classList.remove('light')
        htmlEl.classList.add('dark')
        iconSun.style.display = 'block'
        iconMoon.style.display = 'none'
        localStorage.setItem('theme', 'dark')
      } else {
        htmlEl.classList.remove('dark')
        htmlEl.classList.add('light')
        iconSun.style.display = 'none'
        iconMoon.style.display = 'block'
        localStorage.setItem('theme', 'light')
      }

      // Notify main process
      window.electron?.ipcRenderer?.send(
        'setConfig',
        'value',
        'theme',
        htmlEl.classList.contains('light') ? 'light' : 'dark'
      )
    })
  }

  // ============================================================
  // 4. LANGUAGE SWITCHING
  // ============================================================

  const translations = {
    vi: {
      greeting: 'Xin chào, bạn yêu 👋',
      welcome: 'Cảm ơn bạn đã sử dụng tool của tớ Telegram @dungdzvclxx ^^',
      overview: 'Tổng quan',
      accounts: 'Tài khoản',
      botting: 'Botting',
      proxy: 'API Proxy',
      logs: 'Nhật ký',
      stats: 'Thống kê',
      settings: 'Cài đặt',
      botsRunning: 'Bot đang chạy',
      accountsAdded: 'Tài khoản đã thêm',
      proxyUsed: 'Proxy đang dùng',
      server: 'Server',
      uptime: 'Thời gian chạy',
      currentAccount: 'Tài khoản Hiện tại',
      bestAccount: 'Tài khoản Tốt nhất',
      quickActions: 'Thao tác Nhanh',
      startAll: 'Bắt đầu Tất cả',
      stopAll: 'Dừng Tất cả',
      warmup: 'Làm nóng Tất cả',
      reconnect: 'Kết nối lại',
      copied: 'Đã sao chép thành công',
      copyFailed: 'Sao chép thất bại',
      serviceRunning: 'Dịch vụ Đang chạy',
      serviceStopped: 'Dịch vụ Đã dừng',
      startService: 'Bắt đầu Dịch vụ',
      stopService: 'Dừng Dịch vụ',
      notLoggedIn: 'Chưa đăng nhập',
      noData: 'Chưa có dữ liệu',
      good: 'Tốt',
      low: 'Thấp',
      critical: 'Nguy hiểm',
      apiLimit: 'Hạn mức API',
      botLimit: 'Tài khoản Bot'
    },
    en: {
      greeting: 'Hello, User 👋',
      welcome: 'Welcome back to ToolMC',
      overview: 'Overview',
      accounts: 'Accounts',
      botting: 'Botting',
      proxy: 'API Proxy',
      logs: 'Logs',
      stats: 'Stats',
      settings: 'Settings',
      botsRunning: 'Bots Running',
      accountsAdded: 'Accounts Added',
      proxyUsed: 'Proxy Used',
      server: 'Server',
      uptime: 'Uptime',
      currentAccount: 'Current Account',
      bestAccount: 'Best Account',
      quickActions: 'Quick Actions',
      startAll: 'Start All',
      stopAll: 'Stop All',
      warmup: 'Warmup All',
      reconnect: 'Reconnect',
      copied: 'Copied successfully',
      copyFailed: 'Copy failed',
      serviceRunning: 'Service Running',
      serviceStopped: 'Service Stopped',
      startService: 'Start Service',
      stopService: 'Stop Service',
      notLoggedIn: 'Not logged in',
      noData: 'No data',
      good: 'Good',
      low: 'Low',
      critical: 'Critical',
      apiLimit: 'API Limit',
      botLimit: 'Bot Account'
    },
    zh: {
      greeting: '你好，用户 👋',
      welcome: '欢迎回到 ToolMC',
      overview: '总览',
      accounts: '账户',
      botting: '机器人',
      proxy: 'API代理',
      logs: '日志',
      stats: '统计',
      settings: '设置',
      botsRunning: '运行中的机器人',
      accountsAdded: '已添加账户',
      proxyUsed: '使用的代理',
      server: '服务器',
      uptime: '运行时间',
      currentAccount: '当前账户',
      bestAccount: '最佳账户',
      quickActions: '快速操作',
      startAll: '全部启动',
      stopAll: '全部停止',
      warmup: '全部预热',
      reconnect: '重新连接',
      copied: '复制成功',
      copyFailed: '复制失败',
      serviceRunning: '服务运行中',
      serviceStopped: '服务已停止',
      startService: '启动服务',
      stopService: '停止服务',
      notLoggedIn: '未登录',
      noData: '无数据',
      good: '良好',
      low: '低',
      critical: '危险',
      apiLimit: 'API限额',
      botLimit: '机器人账户'
    },
    ko: {
      greeting: '안녕하세요, 사용자 👋',
      welcome: 'ToolMC에 다시 오신 것을 환영합니다',
      overview: '개요',
      accounts: '계정',
      botting: '봇',
      proxy: 'API 프록시',
      logs: '로그',
      stats: '통계',
      settings: '설정',
      botsRunning: '실행 중인 봇',
      accountsAdded: '추가된 계정',
      proxyUsed: '사용 중인 프록시',
      server: '서버',
      uptime: '가동 시간',
      currentAccount: '현재 계정',
      bestAccount: '최고 계정',
      quickActions: '빠른 작업',
      startAll: '모두 시작',
      stopAll: '모두 중지',
      warmup: '모두 예열',
      reconnect: '재연결',
      copied: '복사 완료',
      copyFailed: '복사 실패',
      serviceRunning: '서비스 실행 중',
      serviceStopped: '서비스 중지됨',
      startService: '서비스 시작',
      stopService: '서비스 중지',
      notLoggedIn: '로그인되지 않음',
      noData: '데이터 없음',
      good: '양호',
      low: '낮음',
      critical: '위험',
      apiLimit: 'API 한도',
      botLimit: '봇 계정'
    },
    ja: {
      greeting: 'こんにちは、ユーザー 👋',
      welcome: 'ToolMCへようこそ',
      overview: '概要',
      accounts: 'アカウント',
      botting: 'ボット',
      proxy: 'APIプロキシ',
      logs: 'ログ',
      stats: '統計',
      settings: '設定',
      botsRunning: '実行中のボット',
      accountsAdded: '追加されたアカウント',
      proxyUsed: '使用中のプロキシ',
      server: 'サーバー',
      uptime: '稼働時間',
      currentAccount: '現在のアカウント',
      bestAccount: '最適なアカウント',
      quickActions: 'クイックアクション',
      startAll: 'すべて開始',
      stopAll: 'すべて停止',
      warmup: 'すべてウォームアップ',
      reconnect: '再接続',
      copied: 'コピー完了',
      copyFailed: 'コピーに失敗',
      serviceRunning: 'サービス実行中',
      serviceStopped: 'サービス停止',
      startService: 'サービス開始',
      stopService: 'サービス停止',
      notLoggedIn: '未ログイン',
      noData: 'データなし',
      good: '良好',
      low: '低',
      critical: '危険',
      apiLimit: 'API制限',
      botLimit: 'ボットアカウント'
    }
  }

  let currentLang = localStorage.getItem('lang') || 'vi'

  function applyTranslations(lang) {
    const t = translations[lang] || translations.vi
    // Greeting
    const greetingEl = document.querySelector('#tab-overview .greeting h1')
    const welcomeEl = document.querySelector('#tab-overview .greeting .subtitle')
    if (greetingEl) greetingEl.textContent = t.greeting
    if (welcomeEl) welcomeEl.textContent = t.welcome

    // Stats labels
    const statLabels = document.querySelectorAll('.stat-label')
    if (statLabels[0]) statLabels[0].textContent = t.botsRunning
    if (statLabels[1]) statLabels[1].textContent = t.accountsAdded
    if (statLabels[2]) statLabels[2].textContent = t.proxyUsed
    if (statLabels[3]) statLabels[3].textContent = t.server
    if (statLabels[4]) statLabels[4].textContent = t.uptime

    // Account info
    const accountEmail = document.getElementById('currentAccountEmail')
    if (accountEmail && accountEmail.textContent === 'Chưa đăng nhập') {
      accountEmail.textContent = t.notLoggedIn
    }

    const bestName = document.querySelector('.best-account-name')
    if (bestName && bestName.textContent === '--') {
      bestName.textContent = '--'
      const bestDetail = document.querySelector('.best-account-detail')
      if (bestDetail) bestDetail.textContent = t.noData
    }

    // Progress status
    const apiStatus = document.getElementById('apiLimitStatus')
    const botStatus = document.getElementById('botLimitStatus')
    if (apiStatus && apiStatus.textContent === 'Tốt') apiStatus.textContent = t.good
    if (botStatus && botStatus.textContent === 'Tốt') botStatus.textContent = t.good

    // Quick actions
    const qBtns = document.querySelectorAll('.action-btn')
    if (qBtns[0])
      qBtns[0].innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${t.startAll}`
    if (qBtns[1])
      qBtns[1].innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> ${t.stopAll}`
    if (qBtns[2])
      qBtns[2].innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> ${t.reconnect}`

    // Service status
    const serviceStatus = document.getElementById('proxyServiceStatus')
    if (serviceStatus) serviceStatus.textContent = t.serviceStopped
  }

  function initLanguage() {
    const langBtn = document.getElementById('langBtn')
    const langMenu = document.getElementById('langMenu')
    const langItems = document.querySelectorAll('.lang-item')
    const currentLangSpan = document.getElementById('currentLang')

    // Apply saved language
    applyTranslations(currentLang)
    if (currentLangSpan) {
      currentLangSpan.textContent = currentLang.toUpperCase()
    }
    langItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.lang === currentLang)
    })

    // Toggle dropdown
    langBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      langMenu?.classList.toggle('show')
    })

    // Close on outside click
    document.addEventListener('click', () => {
      langMenu?.classList.remove('show')
    })

    // Select language
    langItems.forEach((item) => {
      item.addEventListener('click', () => {
        const lang = item.dataset.lang
        currentLang = lang
        localStorage.setItem('lang', lang)
        if (currentLangSpan) currentLangSpan.textContent = lang.toUpperCase()
        langItems.forEach((i) => i.classList.toggle('active', i.dataset.lang === lang))
        applyTranslations(lang)
        langMenu?.classList.remove('show')
      })
    })
  }

  // ============================================================
  // 5. FULLSCREEN TOGGLE
  // ============================================================

  function initFullscreen() {
    const btn = document.getElementById('btnFullscreen')
    btn?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.()
      } else {
        document.exitFullscreen?.()
      }
    })
  }

  // ============================================================
  // 6. PROXY SERVICE TOGGLE
  // ============================================================

  function initProxyService() {
    const toggleBtn = document.getElementById('btnToggleProxyService')

    toggleBtn?.addEventListener('click', () => {
      const isCurrentlyActive = toggleBtn.getAttribute('data-active') === 'true'
      const newActive = !isCurrentlyActive

      window.electron?.ipcRenderer?.send('setConfig', 'boolean', 'useProxy', newActive)
      window.updateProxyStatusUI?.(newActive)
    })

    // Authorization toggle - show/hide auth mode section
    const enableAuth = document.getElementById('enableAuth')
    const authSection = document.getElementById('authModeSection')
    enableAuth?.addEventListener('change', () => {
      if (enableAuth.checked) {
        authSection?.classList.remove('hidden')
      } else {
        authSection?.classList.add('hidden')
      }
    })

    // Copy API Key
    document.getElementById('btnCopyApiKey')?.addEventListener('click', () => {
      const apiKeyInput = document.getElementById('proxyApiKey')
      const realKey = apiKeyInput?.dataset.realKey || apiKeyInput?.value || ''
      if (realKey && realKey !== '••••••••••••••••') {
        copyToClipboard(realKey)
      } else {
        showToast('Không có API key để sao chép')
      }
    })

    // Refresh API Key
    document.getElementById('btnRefreshApiKey')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('proxyServiceRefreshKey')
    })

    // Edit API Key
    document.getElementById('btnEditApiKey')?.addEventListener('click', () => {
      const input = document.getElementById('proxyApiKey')
      if (input) {
        input.disabled = false
        input.value = input.dataset.realKey || ''
        input.focus()
        input.addEventListener(
          'blur',
          function handler() {
            input.disabled = true
            input.dataset.realKey = input.value
            input.value = '••••••••••••••••'
            this.removeEventListener('blur', handler)
          },
          { once: true }
        )
      }
    })
  }

  // ============================================================
  // 7. MOVE CONTROLS (WASD)
  // ============================================================

  function initMoveControls() {
    const moveBtns = document.querySelectorAll('.move-btn')

    moveBtns.forEach((btn) => {
      btn.addEventListener('mousedown', () => {
        const moveType = btn.dataset.move
        btn.classList.add('active')

        const checkbox = btn.querySelector('input[type="checkbox"]')
        if (checkbox) checkbox.checked = true

        window.electron?.ipcRenderer?.send('botControl', {
          action: 'move',
          type: moveType,
          state: true
        })
      })

      btn.addEventListener('mouseup', () => {
        const moveType = btn.dataset.move
        btn.classList.remove('active')

        const checkbox = btn.querySelector('input[type="checkbox"]')
        if (checkbox) checkbox.checked = false

        window.electron?.ipcRenderer?.send('botControl', {
          action: 'move',
          type: moveType,
          state: false
        })
      })

      btn.addEventListener('mouseleave', () => {
        if (btn.classList.contains('active')) {
          const moveType = btn.dataset.move
          btn.classList.remove('active')

          const checkbox = btn.querySelector('input[type="checkbox"]')
          if (checkbox) checkbox.checked = false

          window.electron?.ipcRenderer?.send('botControl', {
            action: 'move',
            type: moveType,
            state: false
          })
        }
      })
    })
  }

  // ============================================================
  // 8. QUICK ACTIONS
  // ============================================================

  function initQuickActions() {
    document.getElementById('quickStartAll')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botAction', 'startAll')
      notify('Info', 'Starting all bots...', 'info')
    })

    document.getElementById('quickStopAll')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botAction', 'stopAll')
      notify('Info', 'Stopping all bots...', 'info')
    })

    document.getElementById('quickWarmup')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botAction', 'warmup')
      notify('Warning', 'Warming up all bots...', 'warning')
    })

    document.getElementById('quickReconnect')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botAction', 'reconnect')
      notify('Info', 'Reconnecting all bots...', 'info')
    })
  }

  // ============================================================
  // 9. BOTTING BUTTONS
  // ============================================================

  function initBottingControls() {
    // Controls
    document.getElementById('btnDisconnect')?.addEventListener('click', () => {
      console.log('[DEBUG Renderer] Clicked btnDisconnect (Ngắt kết nối)')
      window.electron?.ipcRenderer?.send('botControl', { action: 'disconnect' })
    })
    document.getElementById('btnReconnect')?.addEventListener('click', () => {
      console.log('[DEBUG Renderer] Clicked btnReconnect (Kết nối lại)')
      window.electron?.ipcRenderer?.send('botControl', { action: 'reconnect' })
    })
    document.getElementById('btnRespawn')?.addEventListener('click', () => {
      console.log('[DEBUG Renderer] Clicked btnRespawn (Hồi sinh)')
      window.electron?.ipcRenderer?.send('botControl', { action: 'respawn' })
    })
    document.getElementById('btnScoreboard')?.addEventListener('click', () => {
      console.log('[DEBUG Renderer] Clicked btnScoreboard (Bảng điểm)')
      window.electron?.ipcRenderer?.send('botControl', { action: 'scoreboard' })
    })

    // Chat
    const sendChat = () => {
      const msg = document.getElementById('chatMsg')?.value
      if (msg) {
        window.electron?.ipcRenderer?.send('botControl', { action: 'chat', message: msg })
        document.getElementById('chatMsg').value = ''
      }
    }

    document.getElementById('btnChat')?.addEventListener('click', sendChat)
    document.getElementById('chatMsg')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChat()
      }
    })

    // Hotbar
    document.getElementById('btnHotbarSelect')?.addEventListener('click', () => {
      const slot = document.getElementById('hotbarSlot')?.value
      window.electron?.ipcRenderer?.send('botControl', { action: 'hotbar', slot: parseInt(slot) })
    })
    document.getElementById('btnUseItem')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botControl', { action: 'useItem' })
    })
    document.getElementById('btnDrop')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botControl', { action: 'dropHeld' })
    })

    // Inventory
    document.getElementById('btnCloseWindow')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botControl', { action: 'closeWindow' })
    })
    document.getElementById('btnDropAll')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('botControl', { action: 'dropAll' })
    })
    document.getElementById('btnWindowClick')?.addEventListener('click', () => {
      const slot = document.getElementById('windowSlot')?.value
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'windowClick',
        slot: parseInt(slot),
        button: 0,
        mode: 0
      })
    })
    document.getElementById('btnWindowRightClick')?.addEventListener('click', () => {
      const slot = document.getElementById('windowSlot')?.value
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'windowClick',
        slot: parseInt(slot),
        button: 1,
        mode: 0
      })
    })
    document.getElementById('btnWindowShiftClick')?.addEventListener('click', () => {
      const slot = document.getElementById('windowSlot')?.value
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'windowClick',
        slot: parseInt(slot),
        button: 0,
        mode: 1
      })
    })

    // Look
    document.getElementById('btnLook')?.addEventListener('click', () => {
      const yaw = document.getElementById('lookYaw')?.value
      const pitch = document.getElementById('lookPitch')?.value
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'look',
        yaw: parseFloat(yaw),
        pitch: parseFloat(pitch)
      })
    })
    document.getElementById('btnLookAt')?.addEventListener('click', () => {
      const name = document.getElementById('lookPlayerName')?.value
      window.electron?.ipcRenderer?.send('botControl', { action: 'lookAt', player: name })
    })

    // Pathfinder
    document.getElementById('btnPathfind')?.addEventListener('click', () => {
      const x = document.getElementById('pathX')?.value
      const y = document.getElementById('pathY')?.value
      const z = document.getElementById('pathZ')?.value
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'pathfind',
        x: parseFloat(x),
        y: parseFloat(y),
        z: parseFloat(z)
      })
    })

    // KillAura Toggle
    document.getElementById('toggleKillAura')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        enabled: e.target.checked
      })
    })
    document.getElementById('kaRange')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'range',
        value: parseFloat(e.target.value)
      })
    })
    document.getElementById('kaDelay')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'delay',
        value: parseInt(e.target.value)
      })
    })
    document.getElementById('kaAnimals')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'animals',
        value: e.target.checked
      })
    })
    document.getElementById('kaMobs')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'mobs',
        value: e.target.checked
      })
    })
    document.getElementById('kaPlayers')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'players',
        value: e.target.checked
      })
    })
    document.getElementById('kaVehicles')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'vehicles',
        value: e.target.checked
      })
    })
    document.getElementById('kaAutoCrit')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'killaura',
        param: 'autocrit',
        value: e.target.checked
      })
    })

    // AntiAFK Toggle
    document.getElementById('toggleAntiAFK')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'antiafk',
        enabled: e.target.checked
      })
    })
    document.getElementById('afkInterval')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'antiafk',
        param: 'interval',
        value: parseInt(e.target.value)
      })
    })

    // Nuker Toggle
    document.getElementById('toggleNuker')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'nuker',
        enabled: e.target.checked
      })
    })
    document.getElementById('nukerBlock')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'nuker',
        param: 'block',
        value: e.target.value
      })
    })
    document.getElementById('nukerRange')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'nuker',
        param: 'range',
        value: parseInt(e.target.value)
      })
    })
    document.getElementById('nukerDelay')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'nuker',
        param: 'delay',
        value: parseInt(e.target.value)
      })
    })

    // Spammer Toggle
    document.getElementById('checkSpam')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'spammer',
        enabled: e.target.checked
      })
    })
    document.getElementById('spamDelay')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'spammer',
        param: 'delay',
        value: parseInt(e.target.value)
      })
    })
    document.getElementById('bypassChat')?.addEventListener('change', (e) => {
      window.electron?.ipcRenderer?.send('botControl', {
        action: 'spammer',
        param: 'bypass',
        value: e.target.checked
      })
    })

    // Bot list select all
    document.getElementById('selectAllBots')?.addEventListener('click', () => {
      const botItems = document.querySelectorAll('.bot-list-item')
      const allSelected = Array.from(botItems).every((item) => item.classList.contains('selected'))
      if (allSelected) {
        botItems.forEach((item) => {
          item.classList.remove('selected')
          _selectedBots.delete(item.dataset.name)
        })
      } else {
        botItems.forEach((item) => {
          item.classList.add('selected')
          _selectedBots.add(item.dataset.name)
        })
      }
      window.BotManager?.updateSelected()
    })
  }

  // ============================================================
  // 10. ACCOUNT MANAGEMENT
  // ============================================================

  function initAccountManagement() {
    const accountList = document.getElementById('accountList')
    const accountCount = document.getElementById('accountCount')
    const visualBody = document.getElementById('visualAccountListBody')

    function renderVisualAccountList() {
      if (!visualBody) return
      visualBody.innerHTML = ''

      const val = accountList ? accountList.value : ''
      const lines = val.split(/\r?\n/).filter((l) => l.trim().length > 0)

      if (accountCount) accountCount.textContent = `${lines.length} tài khoản`

      lines.forEach((line, index) => {
        let username,
          password,
          type = 'Crack'
        const parts = line.split(/[:|]/)
        username = parts[0] ? parts[0].trim() : ''
        password = parts[1] ? parts[1].trim() : ''

        if (parts[2]) {
          const typeStr = parts[2].trim().toLowerCase()
          if (typeStr === 'microsoft' || typeStr === 'premium') {
            type = password ? 'Premium (Pass)' : 'Premium'
          } else if (typeStr === 'thealtening') {
            type = 'TheAltening'
          }
        } else if (username.includes('@')) {
          type = password ? 'Premium (Pass)' : 'Premium'
        }

        const tr = document.createElement('tr')
        const badgeClass =
          type === 'Premium' || type === 'Premium (Pass)' || type === 'TheAltening'
            ? 'badge-premium'
            : 'badge-crack'

        tr.innerHTML = `
          <td style="padding: 10px 12px; font-weight: 500; font-family: monospace; word-break: break-all;">${username}</td>
          <td style="padding: 10px 12px;"><span class="${badgeClass}">${type}</span></td>
          <td style="padding: 10px 12px; text-align: right;">
            <button class="btn btn-xs btn-destructive btn-delete-account" data-index="${index}" style="padding: 2px 6px; font-size: 11px;">Xóa</button>
          </td>
        `
        visualBody.appendChild(tr)
      })

      // Add delete listeners
      visualBody.querySelectorAll('.btn-delete-account').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(btn.dataset.index)
          const currentVal = accountList ? accountList.value : ''
          const currentLines = currentVal.split(/\r?\n/).filter((l) => l.trim().length > 0)
          if (idx >= 0 && idx < currentLines.length) {
            currentLines.splice(idx, 1)
            if (accountList) {
              accountList.value = currentLines.join('\n')
              accountList.dispatchEvent(new Event('input'))
            }
          }
        })
      })
    }

    // Set initial render
    setTimeout(renderVisualAccountList, 100)

    accountList?.addEventListener('input', () => {
      renderVisualAccountList()
      window.electron?.ipcRenderer?.send('setConfig', 'value', 'accountList', accountList.value)
    })

    // Listeners for single account inputs
    const btnAddSingle = document.getElementById('btnAddSingleAccount')
    const inputUser = document.getElementById('singleAccountUser')
    const inputPass = document.getElementById('singleAccountPass')
    const selectType = document.getElementById('singleAccountType')

    btnAddSingle?.addEventListener('click', async () => {
      const user = inputUser ? inputUser.value.trim() : ''
      const pass = inputPass ? inputPass.value.trim() : ''
      const type = selectType ? selectType.value : 'offline'

      if (!user) {
        notify('Error', 'Vui lòng nhập tên tài khoản hoặc email', 'error')
        return
      }

      if (type === 'microsoft') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(user)) {
          notify(
            'Lỗi nhập liệu',
            'Vui lòng nhập đúng định dạng Email Microsoft (ví dụ: user@outlook.com)',
            'error'
          )
          return
        }
      }

      const originalText = btnAddSingle.innerHTML
      btnAddSingle.disabled = true
      btnAddSingle.innerHTML = 'Đang kiểm tra...'

      try {
        const result = await window.electron.ipcRenderer.invoke('verify-account', {
          username: user,
          password: pass,
          type: type
        })

        if (!result.success) {
          notify('Lỗi xác thực', result.error || 'Thông tin tài khoản không chính xác.', 'error')
          return
        }

        let line = user
        if (type === 'microsoft_password') {
          line += `:${pass}:microsoft`
        } else if (type === 'microsoft') {
          line += `::microsoft`
        } else if (type === 'thealtening') {
          const finalPass = pass || 'dummy'
          line += `:${finalPass}:thealtening`
        } else {
          if (pass) {
            line += `:${pass}`
          }
        }

        if (accountList) {
          const currentVal = accountList.value.trim()
          accountList.value = currentVal ? `${currentVal}\n${line}` : line
          accountList.dispatchEvent(new Event('input'))
        }

        // Reset inputs
        if (inputUser) inputUser.value = ''
        if (inputPass) inputPass.value = ''
        notify('Success', `Đã thêm tài khoản: ${user}`, 'success')
      } catch (err) {
        console.error('Account verification error:', err)
        notify('Error', 'Không thể kết nối đến dịch vụ xác thực.', 'error')
      } finally {
        btnAddSingle.disabled = false
        btnAddSingle.innerHTML = originalText
      }
    })

    document.getElementById('btnImportAccounts')?.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.txt,.json'
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (file) {
          const text = await file.text()
          if (accountList) {
            accountList.value = text
            accountList.dispatchEvent(new Event('input'))
          }
        }
      }
      input.click()
    })

    document.getElementById('btnExportAccounts')?.addEventListener('click', () => {
      const text = accountList?.value || ''
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'accounts.txt'
      a.click()
      URL.revokeObjectURL(url)
    })

    document.getElementById('btnClearAccounts')?.addEventListener('click', () => {
      if (accountList) {
        accountList.value = ''
        accountList.dispatchEvent(new Event('input'))
      }
    })
  }

  // ============================================================
  // 11. INPUT VALUE CHANGE
  // ============================================================

  function initInputListeners() {
    // Proxy fields - save to localStorage instead of electron-store
    const proxyListEl = document.getElementById('proxyList')
    const proxyTypeEl = document.getElementById('proxyType')

    if (proxyListEl) {
      proxyListEl.addEventListener('input', saveProxyToLocal)
      proxyListEl.addEventListener('change', saveProxyToLocal)
    }
    if (proxyTypeEl) {
      proxyTypeEl.addEventListener('change', saveProxyToLocal)
    }

    // Other config fields - save to electron-store
    const valueElements = document.querySelectorAll(
      'input[type="text"], input[type="number"], select:not(#proxyType), textarea:not(#proxyList)'
    )
    valueElements.forEach((el) => {
      el.addEventListener('change', () => {
        if (el.id) {
          window.electron?.ipcRenderer?.send('setConfig', 'value', el.id, el.value)
        }
      })
    })

    const checkboxElements = document.querySelectorAll('input[type="checkbox"]')
    checkboxElements.forEach((el) => {
      el.addEventListener('change', () => {
        if (el.id) {
          window.electron?.ipcRenderer?.send('setConfig', 'boolean', el.id, el.checked)
        }
      })
    })

    const buttons = document.querySelectorAll('button')
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (btn.id) {
          window.electron?.ipcRenderer?.send('buttonClick', btn.id)
        }
      })
    })
  }

  // ============================================================
  // 12. PROXY TEST CONTROLS
  // ============================================================

  function initProxyTest() {
    document.getElementById('proxyResultClear')?.addEventListener('click', () => {
      const container = document.getElementById('proxyTestResults')
      if (container) {
        container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: rgba(255,255,255,0.25); font-size: 0.8125rem; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px;">Nhấn <strong>Test</strong> để bắt đầu kiểm tra proxy</div>`
      }
      const goodEl = document.getElementById('proxyResultGood')
      const badEl = document.getElementById('proxyResultBad')
      const totalEl = document.getElementById('proxyResultTotal')
      const progressFill = document.getElementById('proxyProgressFill')
      const progressText = document.getElementById('proxyProgressText')
      if (goodEl) goodEl.textContent = '0'
      if (badEl) badEl.textContent = '0'
      if (totalEl) totalEl.textContent = '0'
      if (progressFill) progressFill.style.width = '0%'
      if (progressText) progressText.textContent = 'Chưa test'
    })
  }

  // ============================================================
  // 13. LOGS TAB
  // ============================================================

  function initLogs() {
    document.getElementById('logClear')?.addEventListener('click', () => {
      const logBox = document.getElementById('logBox')
      if (logBox) logBox.innerHTML = ''
    })

    document.getElementById('logExport')?.addEventListener('click', () => {
      const logBox = document.getElementById('logBox')
      if (logBox) {
        const text = Array.from(logBox.querySelectorAll('.log-entry'))
          .map((entry) => {
            return `${entry.querySelector('.log-time')?.textContent || ''} [${entry.querySelector('.log-tag')?.textContent || ''}] ${entry.querySelector('.log-msg')?.textContent || ''}`
          })
          .join('\n')
        const blob = new Blob([text], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `trafficer-logs-${Date.now()}.txt`
        a.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  function addLogEntry(message, type = 'info') {
    const logBox = document.getElementById('logBox')
    if (!logBox) return

    const filterId = `logShow${type.charAt(0).toUpperCase() + type.slice(1)}`
    const filter = document.getElementById(filterId)
    if (filter && !filter.checked) return

    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    const entry = document.createElement('li')
    entry.className = `log-entry log-${type}`
    entry.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-tag">${type.toUpperCase()}</span>
    <span class="log-msg">${message}</span>
  `
    logBox.appendChild(entry)
    logBox.scrollTop = logBox.scrollHeight
  }

  // ============================================================
  // 14. CHAT BOX + GAME OUTPUT
  // ============================================================

  window.addEventListener('keyup', (e) => {
    const isBotting = document.getElementById('tab-botting')?.classList.contains('active')
    if (!isBotting) return

    // Check if any viewer is currently open in any card
    let targets = []
    const viewerOpen = document.querySelector(
      '[id^="bot-viewer-container-"][style*="display: block"]'
    )
    if (viewerOpen) {
      const name = viewerOpen.id.replace('bot-viewer-container-', '')
      targets = [name]
    } else {
      const selected = document.querySelectorAll('#botList .bot-list-item.selected')
      selected.forEach((card) => targets.push(card.dataset.bot))
    }

    if (targets.length === 0) return

    const key = e.key.toLowerCase()
    let action = null

    if (key === 'w') action = 'forward'
    if (key === 's') action = 'back'
    if (key === 'a') action = 'left'
    if (key === 'd') action = 'right'
    if (key === ' ') action = 'jump'
    if (key === 'shift') action = 'sneak'
    if (key === 'control') action = 'sprint'

    if (action) {
      targets.forEach((botName) => {
        window.electron?.ipcRenderer?.send('controlBot', botName, 'control', action, 'false')
      })
    }
  })

  // Initialize everything after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Titlebar controls
    document.getElementById('btnMinimize')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('win:invoke', 'min')
    })
    document.getElementById('btnMaximize')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('win:invoke', 'max')
    })
    document.getElementById('btnClose')?.addEventListener('click', () => {
      window.electron?.ipcRenderer?.send('win:invoke', 'close')
    })

    // Call all initialization functions
    if (typeof initNavigation === 'function') initNavigation()
    if (typeof initTheme === 'function') initTheme()
    if (typeof initLanguage === 'function') initLanguage()
    if (typeof initFullscreen === 'function') initFullscreen()
    if (typeof initProxyService === 'function') initProxyService()
    if (typeof initMoveControls === 'function') initMoveControls()
    if (typeof initQuickActions === 'function') initQuickActions()
    if (typeof initBottingControls === 'function') initBottingControls()
    if (typeof initAccountManagement === 'function') initAccountManagement()
    if (typeof initInputListeners === 'function') initInputListeners()
    if (typeof initProxyTest === 'function') initProxyTest()
    if (typeof initLogs === 'function') initLogs()

    // Load proxy from localStorage
    loadProxyFromLocal()

    // Update UI initially
    if (typeof updateBotCount === 'function') updateBotCount()
  })

  // ============================================================
  // CHAT BOX + GAME OUTPUT & VIEWER INLINE
  // Delegated to BotManager
  // ============================================================

  function addPlayer(name) {
    window.BotManager.addPlayer(name)
  }
  function removePlayer(name) {
    window.BotManager.removePlayer(name)
  }
  function updateSelected() {
    window.BotManager.updateSelected()
  }
  function updateBotCount() {
    window.BotManager.updateBotCount()
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

  // Note: BotManager already handles botEvent via setupBotEventHandler()
  // Duplicate functions removed — see BotManager
})()
