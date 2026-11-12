const { test } = require('node:test')
const assert = require('node:assert/strict')
const { defaultSettings, shellEnvironment, windowsPowerShell } = require('../electron/shell/platform.cjs')
const path = require('node:path')
const { commandScript, supervisorPath } = require('../electron/shell/windows-execution.cjs')

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
    PSModuleAnalysisCachePath: 'C:\\Cache\\ModuleAnalysisCache',
    NODE_OPTIONS: '--require secret',
    TOKEN: 'secret',
    ELECTRON_RUN_AS_NODE: '1'
  })
  assert.equal(env.SystemRoot, 'C:\\Windows')
  assert.equal(env.PATH, 'C:\\Tools')
  assert.equal(env.USERPROFILE, 'C:\\Users\\Test')
  assert.equal(env.PSModuleAnalysisCachePath, 'C:\\Cache\\ModuleAnalysisCache')
  for (const name of ['Path', 'TOKEN', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE']) assert.equal(env[name], undefined)
})
test('PowerShell launcher quotes script paths as data and keeps command contents out of its command line', () => {
  const script = commandScript("C:\\user's folder\\command.ps1")
  assert.ok(script.includes("& 'C:\\user''s folder\\command.ps1'"))
  assert.ok(script.includes('$LASTEXITCODE'))
})

test('Windows supervisor resolves the shipped executable in source and unpacked ASAR layouts', () => {
  const root = path.resolve('Bosi 中文 space')
  assert.equal(supervisorPath(path.join(root, 'electron/shell')), path.join(root, 'resources/shell/windows-supervisor.exe'))
  assert.equal(
    supervisorPath(path.join(root, 'resources/app.asar/electron/shell')),
    path.join(root, 'resources/app.asar.unpacked/resources/shell/windows-supervisor.exe')
  )
  const source = path.join(root, 'app.asar/project')
  assert.equal(supervisorPath(path.join(source, 'electron/shell')), path.join(source, 'resources/shell/windows-supervisor.exe'))
})
