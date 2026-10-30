import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beginPluginStartup, selectPluginStartup } from './plugin-startup-state'
import { createPluginStartupWatchdog } from './plugin-startup-watchdog'

const mockAssets: { pluginPath?: string } = {}
jest.mock('@xpert-ai/server-config', () => ({ getConfig: () => ({ assetOptions: mockAssets }) }))
jest.mock('./plugin-startup-watchdog', () => ({ createPluginStartupWatchdog: jest.fn() }))

describe('Plugin startup state root', () => {
  let directory: string
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'plugin-startup-path-'))
    delete mockAssets.pluginPath
    jest.clearAllMocks()
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  it.each([false, true])('uses the same path for persisted state and watchdog (override=%p)', (override) => {
    if (override) mockAssets.pluginPath = join(directory, 'isolated-plugins')
    beginPluginStartup(directory, 1000)
    selectPluginStartup([])
    const calls = jest.mocked(createPluginStartupWatchdog).mock.calls
    expect(calls).toHaveLength(1)
    const [statePath, timeout] = calls[0]
    expect(dirname(statePath)).toBe(join(mockAssets.pluginPath ?? join(directory, 'plugins'), '.runtime-plugin-state'))
    expect(existsSync(statePath)).toBe(true)
    expect(timeout).toBe(1000)
    if (override) expect(existsSync(join(directory, 'plugins'))).toBe(false)
  })
})
