import { SocksClient } from 'socks'
import { Socket } from 'net'

export function connection(
  proxyType,
  proxyHost,
  proxyPort,
  proxyUsername,
  proxyPassword,
  dHost,
  dPort
) {
  return new Promise((resolve, reject) => {
    if (proxyType === 'socks5' || proxyType === 'socks4') {
      SocksClient.createConnection(
        {
          proxy: {
            host: proxyHost,
            port: parseInt(proxyPort),
            userId: proxyUsername,
            password: proxyPassword,
            type: proxyType === 'socks5' ? 5 : 4
          },
          command: 'connect',
          destination: {
            host: dHost,
            port: parseInt(dPort)
          }
        },
        (err, info) => {
          if (err) {
            return reject(err.message)
          }
          resolve(info.socket)
        }
      )
    } else if (proxyType === 'http') {
      const socket = new Socket()
      socket.connect(parseInt(proxyPort), proxyHost, () => {
        const auth = proxyUsername
          ? `Proxy-Authorization: Basic ${Buffer.from(proxyUsername + ':' + proxyPassword).toString('base64')}\r\n`
          : ''
        socket.write(`CONNECT ${dHost}:${dPort} HTTP/1.1\r\nHost: ${dHost}:${dPort}\r\n${auth}\r\n`)
      })
      socket.setTimeout(10000)
      socket.on('timeout', () => {
        socket.destroy()
        reject('HTTP Proxy wait timed out')
      })

      socket.once('data', (data) => {
        const response = data.toString()
        if (response.includes('200 Connection established') || response.includes('200 OK')) {
          socket.removeAllListeners('data')
          socket.removeAllListeners('error')
          resolve(socket)
        } else {
          socket.destroy()
          reject('Proxy connection failed: ' + response.split('\r\n')[0])
        }
      })

      socket.on('error', (err) => {
        reject(err.message)
      })
    } else {
      const socket = new Socket().connect({
        host: dHost,
        port: parseInt(dPort)
      })
      socket.setTimeout(10000)
      socket.on('connect', () => {
        resolve(socket)
      })
      socket.on('timeout', () => {
        socket.destroy()
        reject('Connection timed out')
      })
      socket.on('error', (err) => {
        return reject(err.message)
      })
    }
  })
}
