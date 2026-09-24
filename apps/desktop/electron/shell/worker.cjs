const { io } = require('socket.io-client')
const { NAMESPACE, VERSION, LIMITS } = require('@xpert-ai/desktop-protocol')
const { ShellEngine } = require('./engine.cjs')
const { ReportDelivery } = require('./delivery.cjs')
let socket
let engine
let heartbeat
let delivery
let closing = false
function notify(value) {
  if (process.connected) process.send(value)
}
async function close() {
  if (closing) return
  closing = true
  clearInterval(heartbeat)
  await engine?.close()
  await delivery?.flush()
  delivery?.reset()
  socket?.disconnect()
  process.exit(0)
}
process.on('message', (message) => {
  if (message.type === 'start' && !engine) {
    try {
      delivery = new ReportDelivery(
        (report) => socket?.emit('report', report),
        (report) => engine.acknowledge(report)
      )
      engine = new ShellEngine({
        directory: message.directory,
        settings: message.settings,
        report: (report) => delivery.enqueue(report)
      })
      socket = io(`${message.url}${NAMESPACE}`, {
        transports: ['websocket'],
        auth: { token: message.token, version: VERSION },
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        timeout: 10000
      })
      socket.on('ready', (welcome) => {
        delivery.connect()
        engine.connect(welcome.connectionEpoch, welcome.leaseUntil)
        notify({ type: 'status', connected: true, errorCode: null })
      })
      socket.on('lease', (message) => engine.renew(message.leaseUntil))
      socket.on('command', (command) => {
        try {
          engine.accept(command)
        } catch (error) {
          socket.emit('rejected', {
            operationId: command.operationId,
            connectionEpoch: engine.epoch,
            code: error.message
          })
        }
      })
      socket.on('disconnect', (reason) => {
        delivery.reset()
        notify({ type: 'status', connected: false })
        if (reason === 'io server disconnect')
          setTimeout(() => {
            if (!closing) socket.connect()
          }, 1000).unref()
      })
      socket.on('ack', (message) => delivery.ack(message))
      socket.on('connect_error', () => {
        notify({ type: 'status', connected: false, errorCode: 'DEVICE_OFFLINE' })
        notify({ type: 'refresh' })
      })
      socket.on('revoked', () => void close())
      socket.on('reconcile', (message) => {
        const record = engine.records.get(message?.operationId)
        if (record) {
          delivery.connect()
          engine.replay(record, true)
        }
      })
      heartbeat = setInterval(() => {
        if (socket.connected) socket.emit('heartbeat', { version: VERSION, connectionEpoch: engine.epoch })
      }, 15000)
    } catch {
      notify({ type: 'status', connected: false, errorCode: 'WORKER_FAILED' })
      void close()
    }
  } else if (message.type === 'grants') engine?.setGrants(message.grants)
  else if (message.type === 'token' && socket) {
    socket.auth = { token: message.token, version: VERSION }
    if (!socket.connected) socket.connect()
  } else if (message.type === 'stop') void close()
})
process.on('disconnect', () => void close())
process.on('SIGTERM', () => void close())
process.on('uncaughtException', () => {
  notify({ type: 'status', connected: false, errorCode: 'WORKER_FAILED' })
  void close()
})
