const { spawn } = require('node:child_process')
const { defaultSettings, shellEnvironment, windowsPowerShell } = require('../electron/shell/platform.cjs')
const settings = defaultSettings()
const base = shellEnvironment(settings)
const fields = ['SystemDrive', 'ALLUSERSPROFILE', 'PUBLIC', 'OS', 'COMPUTERNAME', 'ProgramW6432',
  'CommonProgramW6432', 'CommonProgramFiles(x86)', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
  'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION']
const osFields = Object.fromEntries(fields.flatMap((key) => {
  const name = Object.keys(process.env).find((name) => name.toLowerCase() === key.toLowerCase())
  return name ? [[key, process.env[name]]] : []
}))
const cases = [
  ['filtered', base],
  ['full', process.env],
  ['system-drive', { ...base, SystemDrive: process.env.SystemDrive }],
  ['os-fields', { ...base, ...osFields }],
  ['no-progress', base, "$ProgressPreference = 'SilentlyContinue'; "],
  ['system-path', { ...base, PATH: `${base.SystemRoot}\\System32;${base.SystemRoot}` }]
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
  const timer = setTimeout(() => child.kill(), 15000)
  child.once('close', (code) => {
    clearTimeout(timer)
    console.log(JSON.stringify({ name, code, ms: Date.now() - started, stdout: stdout.slice(-500), stderr: stderr.slice(-500) }))
    resolve(code)
  })
}))).then((codes) => { if (codes[0] !== 0) process.exitCode = 1 })
