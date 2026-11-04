import { runInNewContext } from 'node:vm'
import { parseAnalyticsDiagnostic } from '@xpert-ai/contracts'
import { AnalyticsProviderError, readAnalyticsProviderDiagnostic } from './analytics-diagnostic'

const diagnostic = {
  schema: 'xpert.analytics.diagnostic',
  version: 1,
  code: 'QUERY_FILTER_INVALID',
  stage: 'validation',
  retryable: false,
  message: 'Filter operator is invalid at filters.0.op. Use the discovered action schema.',
  upstreamExecutionId: 'source-run',
  auditRef: 'audit-run'
} as const

describe('public Analytics diagnostic boundary', () => {
  it('recognizes another package/realm without relying on Error identity', () => {
    const foreign = runInNewContext(
      `Object.assign(new Error('private driver text'), { name: 'AnalyticsProviderError', diagnostic: ${JSON.stringify(diagnostic)} })`
    )
    expect(foreign).not.toBeInstanceOf(Error)
    expect(readAnalyticsProviderDiagnostic(foreign)).toEqual(diagnostic)
    expect(readAnalyticsProviderDiagnostic(new AnalyticsProviderError(diagnostic))).toEqual(diagnostic)
  })
  it.each([
    { ...diagnostic, version: 2 },
    { ...diagnostic, retryable: 'false' },
    { ...diagnostic, retryable: true },
    { ...diagnostic, query: 'SELECT private FROM account' },
    { ...diagnostic, message: 'x'.repeat(601) },
    ...[
      'password=hidden',
      'Bearer hidden',
      'https://private/?token=hidden',
      '<html>secret</html>',
      'SELECT salary FROM employees',
      'jdbc:secret',
      'at driver (/private/db:1)',
      'bad\nraw dump'
    ].map((message) => ({ ...diagnostic, message })),
    { ...diagnostic, auditRef: 'https://private/log' }
  ])('rejects malformed/sensitive input without returning it', (value) => {
    expect(parseAnalyticsDiagnostic(value)).toBeUndefined()
    expect(() => new AnalyticsProviderError(value as typeof diagnostic)).toThrow('ANALYTICS_DIAGNOSTIC_INVALID')
  })
  it('does not invoke accessors or forward ordinary errors', () => {
    const get = jest.fn(() => 'private')
    expect(
      readAnalyticsProviderDiagnostic(Object.defineProperty({ name: 'AnalyticsProviderError' }, 'diagnostic', { get }))
    ).toBeUndefined()
    expect(parseAnalyticsDiagnostic(Object.defineProperty({ ...diagnostic }, 'message', { get }))).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
    expect(readAnalyticsProviderDiagnostic(new Error('QUERY_FILTER_INVALID'))).toBeUndefined()
  })
})
