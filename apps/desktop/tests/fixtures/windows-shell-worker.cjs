const path = require('node:path')
const appRoot = process.env.BOSI_SHELL_TEST_APP_ROOT || path.join(__dirname, '../../electron')
const { ShellEngine } = require(path.join(appRoot, 'shell/engine.cjs'))
process.once('message', ({ directory, settings, command }) => {
  const engine = new ShellEngine({ directory, settings, report() {} })
  engine.connect(command.connectionEpoch, Date.now() + 90000)
  engine.setGrants([{ id: command.grantId, argsHash: command.argsHash, expiresAt: Date.now() + 90000 }])
  engine.accept(command)
})
