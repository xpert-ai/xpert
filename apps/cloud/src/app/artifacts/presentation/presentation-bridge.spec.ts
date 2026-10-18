import { isolatePresentationHtml, presentationMessage } from './presentation-bridge'

describe('Artifact presentation bridge', () => {
  const envelope = {
    channel: 'xpertai.remote_component',
    protocolVersion: 1,
    instanceId: 'viewer',
    requestId: 'request-1'
  }
  it('accepts only read transport and rejects client commands and file access', () => {
    expect(
      presentationMessage.safeParse({ ...envelope, type: 'executeAction', actionKey: 'query', input: {} }).success
    ).toBe(true)
    for (const type of ['invokeClientCommand', 'requestFileAccess', 'openUrl', 'save'])
      expect(presentationMessage.safeParse({ ...envelope, type }).success).toBe(false)
  })
  it('puts the network and navigation policy before provider scripts', () => {
    const html = isolatePresentationHtml('<html><head><script>example()</script></head></html>')
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script>'))
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("form-action 'none'")
    expect(() => isolatePresentationHtml('<script>example()</script>')).toThrow()
  })
})
