const { spawn } = require('node:child_process')
const { defaultSettings, shellEnvironment, windowsPowerShell } = require('../electron/shell/platform.cjs')
const settings = defaultSettings()
const base = shellEnvironment(settings)
const extra = Object.keys(process.env).filter((key) => !Object.keys(base).some((name) => name.toLowerCase() === key.toLowerCase()))
const groupSize = Math.ceil(extra.length / 6)
const groups = Array.from({ length: 6 }, (_, index) => extra.slice(index * groupSize, (index + 1) * groupSize))
const cases = [
  ['full', process.env],
  ['module-path', { ...base, PSModulePath: process.env.PSModulePath }],
  ...groups.map((names, index) => [`group-${index}: ${names.join(',')}`, { ...base, ...Object.fromEntries(names.map((key) => [key, process.env[key]])) }])
]
Promise.all(cases.map(([name, env, prefix = '']) => new Promise((resolve, reject) => {
  const started = Date.now()
  const script = prefix + "[Console]::WriteLine('started'); [Console]::WriteLine((Get-Location).Path); [Console]::WriteLine('done')"
  const child = spawn(windowsPowerShell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  })
  let stdout = '', stderr = ''
  child.stdout.on('data', (data) => { stdout += data.toString() })
  child.stderr.on('data', (data) => { stderr += data.toString() })
  child.once('error', reject)
  const timer = setTimeout(() => child.kill(), 30000)
  child.once('close', (code) => {
    clearTimeout(timer)
    console.log(JSON.stringify({ name, code, ms: Date.now() - started, stdout: stdout.slice(-500), stderr: stderr.slice(-500) }))
    resolve(code)
  })
}))).then((codes) => { if (codes.some((code) => code !== 0)) process.exitCode = 1 })
