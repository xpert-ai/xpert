// Invariants: only the supervisor can report completion; the command never inherits its control channel.
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { randomUUID, randomBytes } = require('node:crypto')
const { PassThrough } = require('node:stream')
const { spawn } = require('node:child_process')
const { shellEnvironment, windowsPowerShell } = require('./platform.cjs')

function supervisorPath(directory = __dirname) {
  // spawn cannot execute inside ASAR. Use the helper shipped beside the app, never cwd/PATH.
  let appRoot = path.resolve(directory, '../..')
  if (path.basename(appRoot) === 'app.asar') appRoot += '.unpacked'
  return path.join(appRoot, 'resources/shell/windows-supervisor.exe')
}

function commandScript(commandPath) {
  return `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$global:LASTEXITCODE = 0
try {
  # Resolve standard cmdlets before auto-discovery scans unrelated installed modules on a cold cache.
  # Import only OS modules by absolute path; keep normal auto-loading available to the user command.
  Import-Module -Name "$PSHOME/Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1", "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1" -ErrorAction Stop
  & '${commandPath.replaceAll("'", "''")}'
  $ok = $?
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if (-not $ok) { exit 1 }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.ToString())
  exit 1
}
`
}

function spawnWindowsExecution(settings, command, directory) {
  if (settings.shell !== 'powershell.exe') throw new Error('INVALID_SETTINGS')
  const executable = windowsPowerShell()
  const supervisor = supervisorPath()
  if (!fs.statSync(executable).isFile() || !fs.statSync(command.cwd).isDirectory()) throw new Error('INVALID_SETTINGS')
  if (!fs.statSync(supervisor).isFile()) throw new Error('WINDOWS_SUPERVISOR_MISSING')
  const work = fs.mkdtempSync(path.join(directory, 'windows-'))
  const commandPath = path.join(work, 'command.ps1')
  const script = path.join(work, 'launch.ps1')
  // Windows PowerShell 5.1 requires a BOM to read non-ASCII script source as UTF-8.
  fs.writeFileSync(commandPath, '\ufeff' + command.command, { mode: 0o600 })
  fs.writeFileSync(script, '\ufeff' + commandScript(commandPath), { mode: 0o600 })
  const pipe = `bosi-shell-${randomUUID()}`
  const token = randomBytes(32).toString('hex')
  const receipt = new PassThrough()
  let control
  let child
  let ended = false
  let started = false
  let stopping = false
  let finishReceipt
  const receiptDone = new Promise((resolve) => {
    finishReceipt = resolve
  })
  const finish = () => {
    if (ended) return
    ended = true
    receipt.end()
    finishReceipt()
  }
  const connections = new Set()
  const server = net.createServer((socket) => {
    connections.add(socket)
    let pending = ''
    let authenticated = false
    socket.setEncoding('utf8')
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      connections.delete(socket)
      if (socket === control) finish()
    })
    socket.on('data', (data) => {
      if (!authenticated) {
        pending += data
        if (pending.length > 4096) return socket.destroy()
        const end = pending.indexOf('\n')
        if (end === -1) return
        if (control || pending.slice(0, end).trimEnd() !== token) return socket.destroy()
        authenticated = true
        control = socket
        data = pending.slice(end + 1)
        pending = ''
      }
      if (!ended) receipt.write(data)
    })
  })
  server.on('error', () => {
    child?.kill()
    finish()
  })
  server.listen(`\\\\.\\pipe\\${pipe}`)
  try {
    child = spawn(supervisor, [], {
      cwd: command.cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: shellEnvironment(settings, 'win32')
    })
    child.stdin.on('error', () => undefined)
    child.stdin.write(JSON.stringify({ executable, cwd: command.cwd, script, pipe, token }) + '\n')
  } catch (error) {
    server.close()
    fs.rmSync(work, { recursive: true, force: true })
    throw error
  }
  return {
    child,
    receipt,
    start() {
      if (started || stopping || child.stdin.destroyed) return
      started = true
      child.stdin.write('start\n')
    },
    stop(force = false) {
      stopping = true
      if (force) child.kill()
      else if (!child.stdin.destroyed) child.stdin.write('cancel\n')
    },
    async finish() {
      // ChildProcess.close does not wait for the separate receipt pipe. Drain it before interpreting the result.
      let timer
      await Promise.race([
        receiptDone,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 1000)
        })
      ])
      clearTimeout(timer)
      finish()
      for (const socket of connections) socket.destroy()
      server.close()
      try {
        fs.rmSync(work, { recursive: true, force: true })
      } catch {}
    }
  }
}

module.exports = { spawnWindowsExecution, commandScript, supervisorPath }
