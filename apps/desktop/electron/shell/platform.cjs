const os = require('node:os')
const path = require('node:path')

function defaultSettings(platform = process.platform, environment = process.env) {
  return {
    name: os.hostname(),
    shell: platform === 'win32' ? 'powershell.exe' : '/bin/zsh',
    cwd: os.homedir(),
    path:
      platform === 'win32'
        ? environment.Path || environment.PATH || ''
        : '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  }
}

// Only operating-system settings cross into command processes; never copy the host's credentials.
function shellEnvironment(settings, platform = process.platform, environment = process.env) {
  if (platform === 'win32') {
    const result = {}
    for (const key of [
      'SystemRoot',
      'WINDIR',
      'COMSPEC',
      'PATHEXT',
      'USERPROFILE',
      'USERNAME',
      'USERDOMAIN',
      'HOMEDRIVE',
      'HOMEPATH',
      'APPDATA',
      'LOCALAPPDATA',
      'ProgramData',
      'ProgramFiles',
      'ProgramFiles(x86)',
      'CommonProgramFiles'
    ]) {
      const actual = Object.keys(environment).find((name) => name.toLowerCase() === key.toLowerCase())
      if (actual && environment[actual]) result[key] = environment[actual]
    }
    return { ...result, PATH: settings.path, TEMP: os.tmpdir(), TMP: os.tmpdir() }
  }
  return {
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    PATH: settings.path,
    LANG: 'en_US.UTF-8',
    TMPDIR: os.tmpdir(),
    SHELL: settings.shell
  }
}

function windowsPowerShell(environment = process.env) {
  const root = Object.keys(environment).find((name) => name.toLowerCase() === 'systemroot')
  if (!root || !/^[a-z]:[\\/]/i.test(environment[root])) throw new Error('INVALID_SETTINGS')
  // Resolve from the OS directory, never from the editable command PATH or cwd.
  return path.win32.join(environment[root], 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

module.exports = { defaultSettings, shellEnvironment, windowsPowerShell }
