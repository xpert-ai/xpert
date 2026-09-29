// Run explicitly in the installed extension directory. Never rebuild native code
// automatically in the API process or change the host's ignore-scripts policy.
const assert = require('node:assert/strict')
const { spawn } = require('node-pty')

const terminal = spawn('/bin/sh', [], {
  cwd: process.cwd(),
  cols: 80,
  rows: 24,
  env: { ...process.env, ENV: '' }
})
let output = ''
const timeout = setTimeout(() => {
  process.exitCode = 1
  terminal.kill()
}, 5000)
terminal.onData((data) => {
  output += data
})
terminal.onExit(({ exitCode }) => {
  clearTimeout(timeout)
  try {
    assert.notEqual(process.exitCode, 1, 'Terminal smoke test timed out')
    assert.equal(exitCode, 0)
    assert.match(output, /terminal-ready/)
    assert.match(output, /40\s+100/)
    console.log('PTY input, output, resize and exit passed')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
})
terminal.resize(100, 40)
terminal.write("printf 'terminal-ready\\n'; stty size; exit\r")
