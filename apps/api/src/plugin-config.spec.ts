import { getConfig } from '@xpert-ai/server-config'
import { pluginConfig } from './plugin-config'

jest.mock('@xpert-ai/server-config', () => ({
  getConfig: () => ({
    assetOptions: {
      serverRoot: '/packaged',
      assetPath: '/packaged/assets',
      assetPublicPath: '/configured/public',
      dataPath: '/configured/data',
      pluginPath: '/configured/plugins'
    }
  })
}))

describe('API plugin path configuration', () => {
  it('keeps configured paths when the API builds its plugin configuration', () => {
    expect(pluginConfig.assetOptions).toEqual(getConfig().assetOptions)
  })
})
