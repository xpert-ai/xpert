import { getWebSocketUrl } from './utils'

describe('getWebSocketUrl', () => {
  it('uses the current origin for same-origin API base URLs', () => {
    const expectedProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const expectedOrigin = `${expectedProtocol}//${window.location.host}`

    expect(getWebSocketUrl('')).toBe(expectedOrigin)
    expect(getWebSocketUrl('same-origin')).toBe(expectedOrigin)
  })

  it('resolves tenant API templates from tenant app hostnames', () => {
    const expectedProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    expect(getWebSocketUrl('https://{tenant}.api.xpertai.cn', 'shenzhen.app.xpertai.cn')).toBe(
      `${expectedProtocol}//shenzhen.api.xpertai.cn`
    )
  })
})
