// ================================
// Server Config Manager
// ================================

;(function () {
  'use strict'

  // Storage keys
  const STORAGE_SERVERS = 'trafficer_servers'
  const STORAGE_CURRENT_SERVER = 'trafficer_current_server'
  const STORAGE_CONFIG_PREFIX = 'trafficer_config_'

  // Current state
  let currentServerId = null
  let servers = []

  // Server config structure
  const createDefaultConfig = () => ({
    accounts: '',
    scripts: '',
    joinDelay: '1000',
    isLinear: false,
    version: 'auto',
    autoRespawn: true
  })

  // Load servers from localStorage
  function loadServers() {
    try {
      const saved = localStorage.getItem(STORAGE_SERVERS)
      servers = saved ? JSON.parse(saved) : []

      // Load current server
      currentServerId = localStorage.getItem(STORAGE_CURRENT_SERVER)

      updateServerSelector()

      if (currentServerId && servers.includes(currentServerId)) {
        loadServerConfig(currentServerId)
      }
    } catch (e) {
      console.error('Failed to load servers:', e)
      servers = []
    }
  }

  // Save servers list
  function saveServers() {
    try {
      localStorage.setItem(STORAGE_SERVERS, JSON.stringify(servers))
    } catch (e) {
      console.error('Failed to save servers:', e)
    }
  }

  // Set current server
  function setCurrentServer(serverId) {
    currentServerId = serverId
    localStorage.setItem(STORAGE_CURRENT_SERVER, serverId)
    updateCurrentServerDisplay()

    // Sync with main process so bots know where to connect
    if (serverId) {
      window.electron?.ipcRenderer.send('setConfig', 'value', 'server', serverId)
    }
  }

  // Get config for a server
  function getServerConfig(serverId) {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_PREFIX + serverId)
      return saved ? JSON.parse(saved) : createDefaultConfig()
    } catch (e) {
      console.error('Failed to load config:', e)
      return createDefaultConfig()
    }
  }

  // Save config for a server
  function saveServerConfig(serverId, config) {
    try {
      localStorage.setItem(STORAGE_CONFIG_PREFIX + serverId, JSON.stringify(config))
    } catch (e) {
      console.error('Failed to save config:', e)
    }
  }

  // Add new server
  function addServer(serverIP) {
    const trimmed = serverIP.trim()
    if (!trimmed) return false

    if (servers.includes(trimmed)) {
      notify('Error', 'Server already exists', 'error')
      return false
    }

    servers.push(trimmed)
    saveServers()

    // Create default config for this server
    saveServerConfig(trimmed, createDefaultConfig())

    updateServerSelector()

    // Auto-select new server
    selectServer(trimmed)

    return true
  }

  // Remove server
  function removeServer(serverId) {
    if (!serverId) {
      notify('Error', 'Please select a server first', 'error')
      return
    }

    // Direct remove without confirmation (no focus issues)
    const index = servers.indexOf(serverId)
    if (index > -1) {
      servers.splice(index, 1)
      saveServers()

      // Remove config
      localStorage.removeItem(STORAGE_CONFIG_PREFIX + serverId)

      updateServerSelector()

      // If removed current server, clear selection
      if (currentServerId === serverId) {
        currentServerId = null
        localStorage.removeItem(STORAGE_CURRENT_SERVER)
        updateCurrentServerDisplay()
        loadServerConfig(null)
      }
    }
  }

  // Duplicate function removed - not needed

  // Select server
  function selectServer(serverId) {
    if (!serverId) {
      currentServerId = null
      localStorage.removeItem(STORAGE_CURRENT_SERVER)
      updateCurrentServerDisplay()
      loadServerConfig(null)
      return
    }

    setCurrentServer(serverId)
    loadServerConfig(serverId)

    // Update selector
    const selector = document.getElementById('serverSelector')
    if (selector) {
      selector.value = serverId
    }
  }

  // Load config into UI
  function loadServerConfig(serverId) {
    const config = serverId ? getServerConfig(serverId) : createDefaultConfig()

    // Update UI elements
    const accountList = document.getElementById('accountList')
    const scripts = document.getElementById('autoCommands')
    const joinDelay = document.getElementById('joinDelay')
    const isLinear = document.getElementById('isLinear')
    const version = document.getElementById('versionSelect')

    if (accountList) {
      accountList.value = config.accounts
      accountList.dispatchEvent(new Event('input'))
    }
    if (scripts) {
      scripts.value = config.scripts
      scripts.dispatchEvent(new Event('input'))
    }
    if (joinDelay) {
      joinDelay.value = config.joinDelay
      joinDelay.dispatchEvent(new Event('input'))
    }
    if (isLinear) {
      isLinear.checked = config.isLinear
      isLinear.dispatchEvent(new Event('change'))
    }
    if (version) {
      version.value = config.version
      version.dispatchEvent(new Event('change'))
    }
    const autoRespawn = document.getElementById('autoRespawn')
    if (autoRespawn) {
      autoRespawn.checked = config.autoRespawn !== undefined ? config.autoRespawn : true
      autoRespawn.dispatchEvent(new Event('change'))
    }
  }

  // Save current config
  function saveCurrentConfig() {
    if (!currentServerId) return

    const accountList = document.getElementById('accountList')
    const scripts = document.getElementById('autoCommands')
    const joinDelay = document.getElementById('joinDelay')
    const isLinear = document.getElementById('isLinear')
    const version = document.getElementById('versionSelect')

    const config = {
      accounts: accountList?.value || '',
      scripts: scripts?.value || '',
      joinDelay: joinDelay?.value || '1000',
      isLinear: isLinear?.checked || false,
      version: version?.value || '1.21.4',
      autoRespawn: document.getElementById('autoRespawn')?.checked || false
    }

    saveServerConfig(currentServerId, config)
  }

  // Update server selector dropdown
  function updateServerSelector() {
    const selector = document.getElementById('serverSelector')
    if (!selector) return

    // Clear options except first
    selector.innerHTML = '<option value="">-- Select or Add Server --</option>'

    // Add servers
    servers.forEach((server) => {
      const option = document.createElement('option')
      option.value = server
      option.innerText = server
      selector.appendChild(option)
    })

    // Set current selection
    if (currentServerId) {
      selector.value = currentServerId
    }
  }

  // Update current server display
  function updateCurrentServerDisplay() {
    const display = document.getElementById('currentServerDisplay')
    if (display) {
      display.innerText = currentServerId || 'None selected'
    }
  }

  // Setup server manager
  function setupServerManager() {
    const addBtn = document.getElementById('btnAddServer')
    const removeBtn = document.getElementById('btnRemoveServer')
    const selector = document.getElementById('serverSelector')
    const newServerInput = document.getElementById('newServerIP')

    // Add server
    if (addBtn && newServerInput) {
      addBtn.onclick = () => {
        const serverIP = newServerInput.value.trim()
        if (addServer(serverIP)) {
          newServerInput.value = ''
        }
      }

      newServerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addBtn.click()
        }
      })
    }

    // Remove server
    if (removeBtn) {
      removeBtn.onclick = () => {
        removeServer(currentServerId)
      }
    }

    // Selector change
    if (selector) {
      selector.onchange = () => {
        selectServer(selector.value)
      }
    }

    // Auto-save on config change
    const watchElements = [
      'accountList',
      'autoCommands',
      'joinDelay',
      'isLinear',
      'versionSelect',
      'autoRespawn'
    ]
    watchElements.forEach((id) => {
      const el = document.getElementById(id)
      if (el) {
        // Use 'change' for checkboxes and selects, 'input' for textareas/inputs
        const eventType = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input'
        el.addEventListener(eventType, saveCurrentConfig)
      }
    })

    // Load servers
    loadServers()
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupServerManager)
  } else {
    setupServerManager()
  }

  // Export for debugging
  window.ServerManager = {
    addServer,
    removeServer,
    selectServer,
    getServers: () => servers,
    getCurrentServer: () => currentServerId,
    getCurrentConfig: () => (currentServerId ? getServerConfig(currentServerId) : null),
    clearAll: () => {
      servers = []
      saveServers()
      currentServerId = null
      localStorage.removeItem(STORAGE_CURRENT_SERVER)
      updateServerSelector()
      updateCurrentServerDisplay()
    }
  }
})()
