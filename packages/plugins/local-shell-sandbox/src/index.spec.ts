import manifest from '../package.json'
import plugin from './index'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  XpertServerPlugin: () => (target: unknown) => target
}))

jest.mock('./lib/local-shell-sandbox.provider', () => ({
  LocalShellSandboxProvider: class {},
  LocalShellSandbox: class {}
}))

describe('Local Shell Sandbox installation metadata', () => {
  it('matches the package identity and system installation boundary', () => {
    expect(plugin.meta).toMatchObject({
      name: manifest.name,
      version: manifest.version,
      level: manifest.xpert.plugin.level,
      artifactNamespace: manifest.xpert.plugin.artifactNamespace
    })
  })
})
