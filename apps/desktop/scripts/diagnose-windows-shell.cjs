const { spawn } = require('node:child_process')
const { defaultSettings, shellEnvironment, windowsPowerShell } = require('../electron/shell/platform.cjs')
const settings = defaultSettings()
const base = shellEnvironment(settings)
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const fresh = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bosi-cache-')), 'ModuleAnalysisCache')
const cases = [
  ['cache-inherited', { ...base, PSModuleAnalysisCachePath: process.env.PSModuleAnalysisCachePath }],
  ['cache-disabled', { ...base, PSModuleAnalysisCachePath: 'NUL' }],
  ['cache-fresh', { ...base, PSModuleAnalysisCachePath: fresh }],
  ['preload-core', base, "Import-Module Microsoft.PowerShell.Management; "]
]
console.log(JSON.stringify({ cache: process.env.PSModuleAnalysisCachePath, fresh }))
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
  const timer = setTimeout(() => child.kill(), 60000)
  child.once('close', (code) => {
    clearTimeout(timer)
    console.log(JSON.stringify({ name, code, ms: Date.now() - started, stdout: stdout.slice(-500), stderr: stderr.slice(-500) }))
    resolve(code)
  })
}))).then((codes) => { if (codes.some((code) => code !== 0)) process.exitCode = 1 })
