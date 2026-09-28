import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IPty } from 'node-pty'
import type { SandboxTerminalOpenOptions, SandboxTerminalSession } from '@xpert-ai/plugin-sdk'

const DEFAULT_TERMINAL_COLS = 120
const DEFAULT_TERMINAL_ROWS = 32
const TERMINAL_BASH_ARGS = ['--noprofile', '--norc']
const ANSI_ESCAPE = '\u001b'
const ANSI_NON_PRINTING_PREFIX = '\u0001'
const ANSI_NON_PRINTING_SUFFIX = '\u0002'
const TERMINAL_PROMPT = `${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[1;36m${ANSI_NON_PRINTING_SUFFIX}xpert@sandbox${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[0m${ANSI_NON_PRINTING_SUFFIX} ${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[33m${ANSI_NON_PRINTING_SUFFIX}\\w${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[0m${ANSI_NON_PRINTING_SUFFIX} $ `
const TERMINAL_ZSH_PROMPT = '%F{cyan}xpert@sandbox%f %F{yellow}%~%f $ '
const TERMINAL_LS_COLORS = 'ExFxCxDxBxegedabagacad'
type ShellLaunchConfig = {
  args: string[]
  file: string
}

type NodePtyModule = Pick<typeof import('node-pty'), 'spawn'>

let cachedNodePtyModule: NodePtyModule | null = null

function buildNodePtyLoadError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(
    `Failed to load terminal support dependency "node-pty". Install or rebuild it for ${process.platform}-${process.arch}. ` +
      `In Docker images, ensure python3, make, and g++ are available during pnpm install. Original error: ${detail}`
  )
}

function getNodePtyModule(): NodePtyModule {
  if (cachedNodePtyModule) {
    return cachedNodePtyModule
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('node-pty') as NodePtyModule
    if (typeof module.spawn !== 'function') {
      throw new Error('node-pty did not export a spawn function.')
    }
    cachedNodePtyModule = module
    return module
  } catch (error) {
    throw buildNodePtyLoadError(error)
  }
}

function tryEnsureNodePtySpawnHelperExecutable(): void {
  try {
    const packageRoot = path.dirname(require.resolve('node-pty/package.json'))
    const helperCandidates = [
      path.join(packageRoot, 'build', 'Release', 'spawn-helper'),
      path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    ]

    for (const helperPath of helperCandidates) {
      if (!fs.existsSync(helperPath)) {
        continue
      }

      if ((fs.statSync(helperPath).mode & 0o111) === 0) {
        fs.chmodSync(helperPath, 0o755)
      }
      return
    }
  } catch {
    // If discovery fails we still attempt to open the PTY normally.
  }
}

function clampTerminalSize(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.trunc(value)) : fallback
}

function resolveFallbackShell(): ShellLaunchConfig {
  const shell = process.env['SHELL']?.trim()
  if (shell) {
    const shellName = path.basename(shell)
    if (shellName === 'bash') {
      return { file: shell, args: [...TERMINAL_BASH_ARGS] }
    }
    if (shellName === 'zsh') {
      return { file: shell, args: ['-f'] }
    }
    if (shellName === 'fish') {
      return { file: shell, args: ['--no-config'] }
    }
    return { file: shell, args: [] }
  }

  return { file: '/bin/sh', args: [] }
}

function resolveTerminalShell(): ShellLaunchConfig {
  if (fs.existsSync('/bin/bash')) {
    return {
      file: '/bin/bash',
      args: [...TERMINAL_BASH_ARGS]
    }
  }

  return resolveFallbackShell()
}

class LocalShellTerminalSession implements SandboxTerminalSession {
  constructor(private readonly ptyProcess: IPty) {}

  write(data: string): void {
    this.ptyProcess.write(data)
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(
      clampTerminalSize(cols, DEFAULT_TERMINAL_COLS),
      clampTerminalSize(rows, DEFAULT_TERMINAL_ROWS)
    )
  }

  close(): void {
    this.ptyProcess.kill()
  }
}

export async function openLocalTerminal(
  workingDirectory: string,
  options: SandboxTerminalOpenOptions
): Promise<SandboxTerminalSession> {
  tryEnsureNodePtySpawnHelperExecutable()
  const { spawn } = getNodePtyModule()
  const shell = resolveTerminalShell()
  const ptyProcess = spawn(shell.file, shell.args, {
    cwd: workingDirectory,
    cols: clampTerminalSize(options.cols, DEFAULT_TERMINAL_COLS),
    rows: clampTerminalSize(options.rows, DEFAULT_TERMINAL_ROWS),
    env: {
      ...process.env,
      HOME: process.env['HOME'] ?? os.homedir(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      CLICOLOR: '1',
      LSCOLORS: TERMINAL_LS_COLORS,
      BASH_ENV: '',
      ENV: '',
      PS1: TERMINAL_PROMPT,
      PROMPT: TERMINAL_ZSH_PROMPT,
      ZDOTDIR: '/dev/null'
    },
    name: 'xterm-256color'
  })

  ptyProcess.onData((data) => {
    options.onOutput(data)
  })
  ptyProcess.onExit((event) => {
    options.onExit({
      exitCode: event.exitCode,
      signal: event.signal
    })
  })

  return new LocalShellTerminalSession(ptyProcess)
}
