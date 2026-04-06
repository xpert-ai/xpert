/**
 * Why this exists:
 * Remote-select params are rebuilt from sibling form state and often arrive as fresh objects.
 * This test guards the idempotence contract so equivalent request params do not trigger duplicate remote reloads.
 */
import { buildRemoteSelectRequest, isSameRemoteSelectRequest } from './select.request'

describe('remote select request helpers', () => {
  it('treats equivalent params as the same request', () => {
    const previous = buildRemoteSelectRequest('/api/options', {
      integration: 'integration-1'
    })
    const current = buildRemoteSelectRequest('/api/options', {
      integration: 'integration-1'
    })

    expect(isSameRemoteSelectRequest(previous, current)).toBe(true)
  })

  it('normalizes empty params to avoid redundant reloads', () => {
    const previous = buildRemoteSelectRequest('/api/options', {})
    const current = buildRemoteSelectRequest('/api/options', undefined)

    expect(previous).toEqual({
      url: '/api/options'
    })
    expect(isSameRemoteSelectRequest(previous, current)).toBe(true)
  })
})
