import { executionObservationQuerySchema, executionObservationAnomalySchema } from './execution-observability.model'
const range = { from: '2026-10-26T16:00:00Z', to: '2026-10-27T16:00:00Z', timeZone: 'Asia/Shanghai' }
describe('execution observability query boundary', () => {
  it('rejects security overrides, invalid ranges and oversized pages', () => {
    for (const input of [
      { ...range, tenantId: 'tenant' },
      { ...range, organizationId: 'org' },
      { ...range, ownerId: 'user' },
      { ...range, to: range.from },
      { ...range, to: '2027-01-01T00:00:00Z' },
      { ...range, timeZone: 'invalid/zone' },
      { ...range, pageSize: 101 },
      { ...range, assistantId: 'currentAssistant' },
      { ...range, statuses: ['queued'] }
    ])
      expect(executionObservationQuerySchema.safeParse(input).success).toBe(false)
  })
  it('normalizes defaults and preserves offset times across DST', () => {
    expect(executionObservationQuerySchema.parse(range)).toMatchObject({
      page: 1,
      pageSize: 25,
      countingUnit: 'root_execution'
    })
    expect(
      executionObservationQuerySchema.safeParse({
        from: '2026-11-01T00:00:00-04:00',
        to: '2026-11-02T00:00:00-05:00',
        timeZone: 'America/New_York'
      }).success
    ).toBe(true)
  })
  it('bounds anomaly thresholds and returned evidence', () => {
    expect(executionObservationAnomalySchema.safeParse({ query: range, thresholdMs: -1 }).success).toBe(false)
    expect(executionObservationAnomalySchema.safeParse({ query: range, limit: 1000 }).success).toBe(false)
  })
})
