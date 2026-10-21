import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analyticsInventoryDigest,
  inspectAnalyticsDocument,
  inspectLegacyAnalyticsSource,
  legacyAnalyticsProviders
} from './analytics-inventory'
import published from './testing/published-dashboard-v1.json'

const bytes = readFileSync(join(__dirname, 'testing/published-dashboard-v1.json'))
const id = published.manifest.bindings[0].dataSourceId
const source = {
  id,
  type: 'workspace-files',
  updatedAt: new Date(0),
  options: { password: 'secret', datasets: [{ id: 'sales', revision: 'v1', file: { filePath: 'private.csv' } }] }
}
describe('read-only analytics migration inventory', () => {
  it('scans published package bindings without rewriting bytes or exposing payloads', () => {
    const before = Buffer.from(bytes),
      checksum = analyticsInventoryDigest(bytes)
    const report = inspectAnalyticsDocument(bytes, 'dashboard')
    expect(report.bindings).toHaveLength(5)
    expect(report.issues).toEqual([])
    expect(report.contentDigest).toBe(checksum)
    expect(bytes.equals(before)).toBe(true)
    expect(report.bindings[0].dataset?.contractHash).toBe('a'.repeat(64))
    expect(JSON.stringify(report)).not.toContain('data-binding')
    expect(JSON.stringify(report)).not.toContain('select')
  })
  it('scans historical bare dashboards and explicit script sources only', () => {
    const binding = published.manifest.bindings[0]
    expect(
      inspectAnalyticsDocument(Buffer.from(JSON.stringify(published.manifest)), 'dashboard').bindings
    ).toHaveLength(5)
    const report = inspectAnalyticsDocument(
      Buffer.from(
        JSON.stringify({
          schema: 'xpert.analytics-script/v1',
          sources: [{ alias: 'sales', binding }],
          script: { secret: 'hidden' },
          metadata: { binding }
        })
      ),
      'script'
    )
    expect(report.bindings.map((item) => item.location)).toEqual(['sources[0].binding'])
    expect(JSON.stringify(report)).not.toContain('hidden')
    expect(inspectAnalyticsDocument(bytes, 'script').issues[0].code).toBe('document-owner-mismatch')
  })
  it('reports invalid and unknown envelopes rather than guessing or dropping failed bindings', () => {
    const malformed = { ...published.manifest, bindings: [{ ...published.manifest.bindings[0], schemaVersion: 99 }] }
    expect(inspectAnalyticsDocument(Buffer.from(JSON.stringify(malformed)), 'dashboard').issues).toEqual([
      { location: 'bindings[0]', code: 'invalid-binding' }
    ])
    expect(inspectAnalyticsDocument(Buffer.from('{'), 'dashboard').issues[0].code).toBe('invalid-json')
    expect(inspectAnalyticsDocument(Buffer.from('{"schema":"unknown/v1"}'), 'dashboard').issues[0].code).toBe(
      'unsupported-or-invalid-document'
    )
  })
  it.each(Object.keys(legacyAnalyticsProviders))(
    'recognizes machine type %s and keeps effective contract validation pending',
    (type) => {
      const before = JSON.stringify(source)
      const report = inspectLegacyAnalyticsSource({ ...source, type }, Object.values(legacyAnalyticsProviders))
      expect(report?.providerAvailable).toBe(true)
      expect(report?.configCheck).toBe('provider-validation-required')
      expect(JSON.stringify(report)).not.toMatch(/secret|private.csv|password/)
      expect(JSON.stringify(source)).toBe(before)
    }
  )
  it('reports missing providers, malformed and duplicate datasets; ignores real database types', () => {
    expect(inspectLegacyAnalyticsSource(source, [])?.providerAvailable).toBe(false)
    expect(inspectLegacyAnalyticsSource({ ...source, options: {} }, [])?.issues).toContain('invalid-datasets')
    expect(
      inspectLegacyAnalyticsSource(
        {
          ...source,
          options: {
            datasets: [
              { id: 'sales', revision: 'v1' },
              { id: 'sales', revision: 'v2' }
            ]
          }
        },
        []
      )?.issues
    ).toContain('duplicate-dataset-id')
    expect(inspectLegacyAnalyticsSource({ ...source, type: 'postgres' }, [])).toBeNull()
  })
})
