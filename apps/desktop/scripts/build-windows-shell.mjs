// Compile during build/development setup, never within a command's execution deadline.
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

if (process.platform === 'win32') {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const systemRoot = Object.keys(process.env).find((key) => key.toLowerCase() === 'systemroot')
  if (!systemRoot) throw new Error('Windows SystemRoot is required to build the Shell supervisor')
  const compiler = ['Framework64', 'Framework']
    .map((directory) => join(process.env[systemRoot], 'Microsoft.NET', directory, 'v4.0.30319/csc.exe'))
    .find(existsSync)
  if (!compiler) throw new Error('The Windows .NET Framework C# compiler is required to build the Shell supervisor')
  const output = join(root, 'resources/shell/windows-supervisor.exe')
  mkdirSync(dirname(output), { recursive: true })
  rmSync(output, { force: true })
  execFileSync(
    compiler,
    [
      '/nologo',
      '/target:exe',
      '/platform:anycpu',
      '/optimize+',
      '/warnaserror+',
      '/reference:System.Runtime.Serialization.dll',
      `/win32manifest:${join(root, 'electron/shell/windows-supervisor.manifest')}`,
      `/out:${output}`,
      join(root, 'electron/shell/windows-supervisor.cs')
    ],
    { stdio: 'inherit' }
  )
  const check = JSON.parse(execFileSync(output, ['--check'], { encoding: 'utf8', timeout: 10000 }))
  if (check.protocol !== 1 || check.pointerSize !== 8) throw new Error('Unsupported Windows Shell supervisor runtime')
}
