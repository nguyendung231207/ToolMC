import EventEmitter from 'node:events'
const Store = require('electron-store')

export const botApi = new EventEmitter()
botApi.setMaxListeners(0)

export const store = new Store()

export const state = {
  stopBot: false,
  stopScript: false,
  stopProxyTest: false,
  currentProxy: 0,
  proxyUsed: 0,
  botCreationIndex: 0,
  nextViewerPort: 3007,
  nextInventoryPort: 4000,
  nextRadarPort: 5000,
  clientVersion: 1,
  playerList: [],
  proxyFromLocal: { proxyList: '', proxyType: 'none' }
}

export const bots = new Map()
export const activeEventHandlers = new Map()
export const viewerPorts = new Map()
export const inventoryPorts = new Map()
export const radarPorts = new Map()
export const botProxies = new Map()

export function storeinfo() {
  return store.get('config')
}
