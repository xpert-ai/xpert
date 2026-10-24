import { analyticsSourceRefSchema, analyticsBindingSchema, analyticsSourceKey } from './analytics.schema'
const id = 'a1234567-1234-4234-8234-123456789012'
it('requires exact native versions and rejects scope/credentials/extra fields', () => {
  for (const source of [
    { kind: 'definition', definitionId: id },
    { kind: 'artifact', artifactId: id, versionId: 'latest' },
    { kind: 'data-source', dataSourceId: id, token: 'secret' }
  ])
    expect(analyticsSourceRefSchema.safeParse(source).success).toBe(false)
})
it('uses explicit source identities for discovery receipts', () => {
  const source = analyticsSourceRefSchema.parse({ kind: 'artifact', artifactId: id, versionId: id })
  expect(analyticsSourceKey(source)).toBe(`artifact/${id}/${id}`)
  expect(analyticsBindingSchema.safeParse({ schemaVersion: 1, dataSourceId: id }).success).toBe(false)
})
