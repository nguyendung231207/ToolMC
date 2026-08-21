import { connection } from './proxyhandler'

export function checkProxy(
  proxyType,
  proxyHost,
  proxyPort,
  proxyUsername,
  proxyPassword,
  dHost,
  dPort,
  timeout
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let isFinished = false

    const timeoutId = setTimeout(() => {
      if (isFinished) return
      isFinished = true
      reject({
        reason: 'timeout',
        proxy: `${proxyHost}:${proxyPort}`
      })
    }, timeout)

    connection(proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword, dHost, dPort)
      .then((socket) => {
        if (isFinished) {
          if (socket) socket.destroy()
          return
        }
        isFinished = true
        clearTimeout(timeoutId)

        const latency = Date.now() - startTime
        socket.destroy()

        resolve({
          reason: 'success',
          latency: latency,
          proxy: `${proxyHost}:${proxyPort}${proxyUsername ? `:${proxyUsername}` : ''}${proxyPassword ? `:${proxyPassword}` : ''}`
        })
      })
      .catch((error) => {
        if (isFinished) return
        isFinished = true
        clearTimeout(timeoutId)

        reject({
          reason: 'bad',
          error: typeof error === 'string' ? error : error.message,
          proxy: `${proxyHost}:${proxyPort}`
        })
      })
  })
}
