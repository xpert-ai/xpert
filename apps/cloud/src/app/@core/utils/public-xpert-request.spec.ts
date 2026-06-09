import { isPublicXpertRequest } from './public-xpert-request'

describe('isPublicXpertRequest', () => {
  it('matches the public app bootstrap route', () => {
    expect(isPublicXpertRequest('GET', '/api/xpert/demo/app')).toBe(true)
  })

  it('does not treat workspace app updates as public requests', () => {
    expect(isPublicXpertRequest('PUT', '/api/xpert/f9618d3b-14ec-4661-ade5-f4f54ed4a44e/app')).toBe(false)
  })

  it('matches the public chat stream route', () => {
    expect(isPublicXpertRequest('POST', '/api/xpert/demo/chat-app')).toBe(true)
    expect(isPublicXpertRequest('GET', '/api/xpert/demo/chat-app')).toBe(false)
  })

  it('matches public conversation routes only for supported methods', () => {
    expect(isPublicXpertRequest('GET', '/api/xpert/demo/conversation')).toBe(true)
    expect(isPublicXpertRequest('GET', '/api/xpert/demo/conversation/conv-1')).toBe(true)
    expect(isPublicXpertRequest('PUT', '/api/xpert/demo/conversation/conv-1')).toBe(true)
    expect(isPublicXpertRequest('DELETE', '/api/xpert/demo/conversation/conv-1')).toBe(true)
    expect(isPublicXpertRequest('GET', '/api/xpert/demo/conversation/conv-1/feedbacks')).toBe(true)
    expect(isPublicXpertRequest('POST', '/api/xpert/demo/conversation/conv-1')).toBe(false)
  })
})
