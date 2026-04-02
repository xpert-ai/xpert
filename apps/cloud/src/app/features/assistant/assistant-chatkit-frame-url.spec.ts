import { normalizeAssistantFrameUrl } from './assistant-chatkit-frame-url'

describe('normalizeAssistantFrameUrl', () => {
  it.each([
    ['/chatkit', '/chatkit/index.html'],
    ['/chatkit/', '/chatkit/index.html'],
    ['/chatkit?foo=1', '/chatkit/index.html?foo=1'],
    ['/chatkit/?foo=1', '/chatkit/index.html?foo=1'],
    ['/chatkit#thread', '/chatkit/index.html#thread'],
    ['/chatkit?foo=1#thread', '/chatkit/index.html?foo=1#thread'],
    ['https://app.xpertai.cn/chatkit', 'https://app.xpertai.cn/chatkit'],
    ['//cdn.example.com/chatkit', '//cdn.example.com/chatkit'],
    ['/other-page', '/other-page']
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeAssistantFrameUrl(value)).toBe(expected)
  })
})
