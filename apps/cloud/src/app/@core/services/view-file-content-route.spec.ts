import { viewFileContentRoute } from './view-file-content-route'

describe('viewFileContentRoute', () => {
  const prefix = 'http://192.0.2.10:4300/api'
  const path = '/api/workspace-files/content/session/grant/%E5%9B%BE.png'

  it('resolves a relative grant through the configured frontend transport', () => {
    expect(viewFileContentRoute(path, 'session', prefix)).toBe(
      '/view-sessions/session/grants/grant/content/%E5%9B%BE.png'
    )
  })

  it.each([
    `http://192.0.2.10:3333${path}`,
    `//other.example${path}`,
    `${path}?token=secret`,
    `${path}#fragment`,
    '/api/workspace-files/content/other-session/grant/image.png',
    '/api/workspace-files/content/session/grant/%2Fetc',
    '/api/workspace-files/content/session/grant/%00image',
    '/api/workspace-files/content/session/grant/../file',
    '/api/ai/threads'
  ])('rejects an untrusted target before authentication is sent: %s', (url) => {
    expect(() => viewFileContentRoute(url, 'session', prefix)).toThrow()
  })
})
