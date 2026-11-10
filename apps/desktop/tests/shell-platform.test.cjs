const { test } = require('node:test')
const assert = require('node:assert/strict')
const { defaultSettings, shellEnvironment, windowsPowerShell } = require('../electron/shell/platform.cjs')
const { commandScript, bootstrap } = require('../electron/shell/windows-execution.cjs')

test('Windows uses built-in PowerShell and preserves the installed Windows PATH', () => {
  const settings = defaultSettings('win32', { Path: 'C:\\Tools;C:\\Windows' })
  assert.equal(settings.shell, 'powershell.exe')
  assert.equal(settings.path, 'C:\\Tools;C:\\Windows')
  assert.equal(
    windowsPowerShell({ SYSTEMROOT: 'D:\\Windows', PATH: 'C:\\untrusted' }),
    'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  )
  assert.throws(() => windowsPowerShell({ PATH: 'C:\\untrusted' }), /INVALID_SETTINGS/)
})
test('Windows worker environment retains required OS fields but excludes credentials and runtime flags', () => {
  const env = shellEnvironment({ path: 'C:\\Tools' }, 'win32', {
    systemroot: 'C:\\Windows',
    USERPROFILE: 'C:\\Users\\Test',
    Path: 'ignored',
    USERNAME: 'Test',
    NODE_OPTIONS: '--require secret',
    TOKEN: 'secret',
    ELECTRON_RUN_AS_NODE: '1'
  })
  assert.equal(env.SystemRoot, 'C:\\Windows')
  assert.equal(env.PATH, 'C:\\Tools')
  assert.equal(env.USERPROFILE, 'C:\\Users\\Test')
  for (const name of ['Path', 'TOKEN', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE']) assert.equal(env[name], undefined)
})
test('PowerShell launcher quotes script paths as data and keeps command contents out of its command line', () => {
  const script = commandScript("C:\\user's folder\\command.ps1")
  assert.ok(script.includes("& 'C:\\user''s folder\\command.ps1'"))
  assert.ok(script.includes('$LASTEXITCODE'))
  assert.ok((Buffer.byteLength(bootstrap, 'utf16le') * 4) / 3 < 8000)
})
