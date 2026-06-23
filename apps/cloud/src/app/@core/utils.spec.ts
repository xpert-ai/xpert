import { getWebSocketUrl } from './utils'

describe('getWebSocketUrl', () => {
  it('uses the current origin for same-origin API base URLs', () => {
    const expectedProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const expectedOrigin = `${expectedProtocol}//${window.location.host}`

    expect(getWebSocketUrl('')).toBe(expectedOrigin)
    expect(getWebSocketUrl('same-origin')).toBe(expectedOrigin)
  })
})
