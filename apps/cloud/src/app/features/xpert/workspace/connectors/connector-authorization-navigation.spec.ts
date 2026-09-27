import { navigateConnectorAuthorization } from './connector-authorization-navigation'

describe('connector authorization navigation', () => {
  it.each([
    'javascript:alert(1)',
    'file:///tmp/connector',
    'xpert://connection/complete',
    'https://user:secret@example.com/authorize',
    '/relative/authorize'
  ])('rejects an invalid authorization destination: %s', (url) => {
    expect(() => navigateConnectorAuthorization(url)).toThrow()
  })
})
