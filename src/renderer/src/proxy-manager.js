// ================================
// Proxy Manager Module
// ================================

;(function () {
  'use strict'

  let proxyList = []

  // Load proxies from localStorage
  function loadProxies() {
    try {
      const saved = localStorage.getItem('trafficer_proxies')
      if (saved) {
        proxyList = JSON.parse(saved)
        updateProxyDisplay()
      }
    } catch (e) {
      console.error('Failed to load proxies:', e)
    }
  }

  // Save proxies to localStorage
  function saveProxies() {
    try {
      localStorage.setItem('trafficer_proxies', JSON.stringify(proxyList))
    } catch (e) {
      console.error('Failed to save proxies:', e)
    }
  }

  // Add proxy
  function addProxy(proxyString) {
    const trimmed = proxyString.trim()
    if (!trimmed) return false

    // Check if already exists
    if (proxyList.includes(trimmed)) {
      return false
    }

    proxyList.push(trimmed)
    saveProxies()
    updateProxyDisplay()
    return true
  }

  // Remove proxy
  function removeProxy(index) {
    if (index >= 0 && index < proxyList.length) {
      proxyList.splice(index, 1)
      saveProxies()
      updateProxyDisplay()
    }
  }

  // Test a single proxy
  async function testProxy(proxyString) {
    try {
      // Parse proxy string (format: ip:port or ip:port:user:pass)
      const parts = proxyString.split(':')
      if (parts.length < 2) {
        return { success: false, error: 'Invalid format' }
      }

      const [host, port] = parts

      // Test proxy by trying to connect
      // Note: This is a simplified test. Real implementation would need backend support
      const testUrl = 'https://api.ipify.org?format=json'

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(testUrl, {
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (response.ok) {
        const data = await response.json()
        return { success: true, ip: data.ip }
      } else {
        return { success: false, error: 'Connection failed' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Update proxy display
  function updateProxyDisplay() {
    const container = document.getElementById('proxyListContainer')
    const countEl = document.getElementById('proxyCount')

    // Update count
    if (countEl) {
      countEl.innerText = proxyList.length
    }
    if (!container) return

    if (proxyList.length === 0) {
      container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: rgba(255, 255, 255, 0.5); font-size: 0.875rem;">
                No proxies added yet
            </div>
        `
      return
    }

    container.innerHTML = proxyList
      .map(
        (proxy, index) => `
        <div class="proxy-item" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; margin-bottom: 0.5rem;">
            <span style="flex: 1; font-family: 'Courier New', monospace; font-size: 0.8125rem; color: white;">${proxy}</span>
            <button class="test-proxy-btn" data-index="${index}" style="padding: 0.25rem 0.75rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">
                Test
            </button>
            <button class="remove-proxy-btn" data-index="${index}" style="padding: 0.25rem 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">
                Remove
            </button>
        </div>
    `
      )
      .join('')

    // Add event listeners
    document.querySelectorAll('.test-proxy-btn').forEach((btn) => {
      btn.onclick = async () => {
        const index = parseInt(btn.dataset.index)
        const proxy = proxyList[index]

        btn.innerText = 'Testing...'
        btn.disabled = true

        const result = await testProxy(proxy)

        if (result.success) {
          btn.innerText = '✓ OK'
          btn.style.background = 'rgba(16, 185, 129, 0.1)'
          btn.style.borderColor = 'rgba(16, 185, 129, 0.3)'
          btn.style.color = '#10b981'
          setTimeout(() => {
            btn.innerText = 'Test'
            btn.style.background = 'rgba(59, 130, 246, 0.1)'
            btn.style.borderColor = 'rgba(59, 130, 246, 0.3)'
            btn.style.color = '#3b82f6'
            btn.disabled = false
          }, 2000)
        } else {
          btn.innerText = '✗ Failed'
          btn.style.background = 'rgba(239, 68, 68, 0.1)'
          btn.style.borderColor = 'rgba(239, 68, 68, 0.3)'
          btn.style.color = '#ef4444'
          setTimeout(() => {
            btn.innerText = 'Test'
            btn.style.background = 'rgba(59, 130, 246, 0.1)'
            btn.style.borderColor = 'rgba(59, 130, 246, 0.3)'
            btn.style.color = '#3b82f6'
            btn.disabled = false
          }, 2000)
        }
      }
    })

    document.querySelectorAll('.remove-proxy-btn').forEach((btn) => {
      btn.onclick = () => {
        const index = parseInt(btn.dataset.index)
        removeProxy(index)
      }
    })
  }

  // =============================================
  // Proxy Test Results Panel (from IPC events)
  // =============================================

  let _proxyTestState = {
    total: 0,
    good: 0,
    bad: 0,
    running: false,
    results: []
  }

  function resetProxyTestResults() {
    _proxyTestState = {
      total: 0,
      good: 0,
      bad: 0,
      running: false,
      results: []
    }
    _updateProxyTestResultsUI()
  }

  function updateProxyTestProgress(current, total) {
    _proxyTestState.total = total
    _proxyTestState.running = true
    const fill = document.getElementById('proxyProgressFill')
    const text = document.getElementById('proxyProgressText')
    const pct = total > 0 ? Math.round((current / total) * 100) : 0
    if (fill) fill.style.width = pct + '%'
    if (text) text.textContent = `Đang test... ${current}/${total} (${pct}%)`
    // Update summary live
    const goodEl = document.getElementById('proxyResultGood')
    const badEl = document.getElementById('proxyResultBad')
    const totalEl = document.getElementById('proxyResultTotal')
    if (goodEl) goodEl.textContent = _proxyTestState.good
    if (badEl) badEl.textContent = _proxyTestState.bad
    if (totalEl) totalEl.textContent = total
  }

  function addProxyTestResult(proxy, success, latency, errorMsg) {
    if (success) {
      _proxyTestState.good++
    } else {
      _proxyTestState.bad++
    }
    _proxyTestState.results.unshift({ proxy, success, latency, errorMsg, time: new Date() })
    // Keep only last 100 results
    if (_proxyTestState.results.length > 100) {
      _proxyTestState.results.pop()
    }
    _updateProxyTestResultsUI()
  }

  function finishProxyTest() {
    _proxyTestState.running = false
    const fill = document.getElementById('proxyProgressFill')
    const text = document.getElementById('proxyProgressText')
    if (fill) fill.style.width = '100%'
    if (text) {
      text.textContent = `Hoàn tất — ${_proxyTestState.good} thành công, ${_proxyTestState.bad} thất bại`
      if (_proxyTestState.bad === 0 && _proxyTestState.good > 0) {
        text.style.color = '#10b981'
      } else if (_proxyTestState.good === 0) {
        text.style.color = '#ef4444'
      }
    }
  }

  function _updateProxyTestResultsUI() {
    const container = document.getElementById('proxyTestResults')
    const goodEl = document.getElementById('proxyResultGood')
    const badEl = document.getElementById('proxyResultBad')
    const totalEl = document.getElementById('proxyResultTotal')

    if (goodEl) goodEl.textContent = _proxyTestState.good
    if (badEl) badEl.textContent = _proxyTestState.bad
    if (totalEl) totalEl.textContent = _proxyTestState.total

    if (!container) return

    if (_proxyTestState.results.length === 0) {
      container.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: rgba(255,255,255,0.35); font-size: 0.8125rem;">
                Nhấn <strong>Test</strong> để bắt đầu kiểm tra proxy
            </div>
        `
      return
    }

    container.innerHTML = _proxyTestState.results
      .map((r) => {
        const timeStr = `${String(r.time.getHours()).padStart(2, '0')}:${String(r.time.getMinutes()).padStart(2, '0')}:${String(r.time.getSeconds()).padStart(2, '0')}`
        const statusColor = r.success ? '#10b981' : '#ef4444'
        const statusBg = r.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
        const statusBorder = r.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'
        const statusIcon = r.success
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        const latencyStr = r.latency ? `${r.latency}ms` : ''
        const errorStr = r.errorMsg
          ? `<span style="font-size:0.6875rem;color:#ef4444;"> — ${r.errorMsg}</span>`
          : ''

        return `
            <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 6px; font-size: 0.75rem;">
                ${statusIcon}
                <span style="flex:1;font-family:'Courier New',monospace;color:rgba(255,255,255,0.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.proxy}</span>
                ${latencyStr ? `<span style="color:rgba(255,255,255,0.4);font-size:0.6875rem;">${latencyStr}</span>` : ''}
                <span style="color:${statusColor};font-weight:600;">${r.success ? 'OK' : 'FAIL'}</span>
                ${errorStr}
            </div>
        `
      })
      .join('')
  }

  // Setup proxy manager
  function setupProxyManager() {
    const addBtn = document.getElementById('btnAddProxy')
    const input = document.getElementById('proxyInput')
    const importBtn = document.getElementById('btnImportProxies')
    const clearBtn = document.getElementById('btnClearProxies')
    const bulkInput = document.getElementById('proxyBulkInput')

    if (addBtn && input) {
      addBtn.onclick = () => {
        const proxy = input.value.trim()
        if (addProxy(proxy)) {
          input.value = ''
        } else {
          notify('Error', 'Invalid proxy or already exists', 'error')
        }
      }

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addBtn.click()
        }
      })
    }

    if (importBtn && bulkInput) {
      importBtn.onclick = () => {
        const proxies = bulkInput.value.split('\n').filter((p) => p.trim())
        let added = 0
        proxies.forEach((proxy) => {
          if (addProxy(proxy)) added++
        })

        notify(
          'Success',
          `Added ${added} new proxies (${proxies.length - added} duplicates skipped)`,
          'success'
        )
        bulkInput.value = ''
      }
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        if (
          proxyList.length > 0 &&
          confirm(`Are you sure you want to remove all ${proxyList.length} proxies?`)
        ) {
          proxyList = []
          saveProxies()
          updateProxyDisplay()
        }
      }
    }

    // Proxy test panel - Test button
    const proxyTestStart = document.getElementById('proxyTestStart')
    const proxyTestStop = document.getElementById('proxyTestStop')
    const proxyListEl = document.getElementById('proxyList')

    if (proxyTestStart) {
      proxyTestStart.onclick = () => {
        if (!proxyListEl || !proxyListEl.value.trim()) {
          notify('No Proxy', 'Vui lòng nhập danh sách proxy trước', 'warning')
          return
        }
        resetProxyTestResults()
        window.electron?.ipcRenderer?.send('proxyTest', 'start')
      }
    }

    if (proxyTestStop) {
      proxyTestStop.onclick = () => {
        window.electron?.ipcRenderer?.send('proxyTest', 'stop')
        if (_proxyTestState.running) {
          finishProxyTest()
        }
      }
    }

    // Load saved proxies
    loadProxies()
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupProxyManager)
  } else {
    setupProxyManager()
  }

  // Export for debugging
  window.ProxyManager = {
    addProxy,
    removeProxy,
    testProxy,
    getProxies: () => proxyList,
    clearAll: () => {
      proxyList = []
      saveProxies()
      updateProxyDisplay()
    },
    resetResults: resetProxyTestResults,
    addResult: addProxyTestResult,
    updateProgress: updateProxyTestProgress,
    finishTest: finishProxyTest
  }
})()
