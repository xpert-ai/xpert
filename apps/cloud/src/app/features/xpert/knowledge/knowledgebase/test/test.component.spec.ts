import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('KnowledgeTestComponent layout', () => {
  const template = readFileSync(join(__dirname, 'test.component.html'), 'utf8')

  it('places retrieval settings and knowledge filters in Zard accordion panels above the query input', () => {
    const controlsIndex = template.indexOf('data-test-controls')
    const queryInputIndex = template.indexOf('data-test-query-input')
    const retrievalPanelIndex = template.indexOf('data-test-panel="retrieval"')
    const filterPanelIndex = template.indexOf('data-test-panel="filters"')

    expect(controlsIndex).toBeGreaterThan(-1)
    expect(retrievalPanelIndex).toBeGreaterThan(controlsIndex)
    expect(filterPanelIndex).toBeGreaterThan(retrievalPanelIndex)
    expect(queryInputIndex).toBeGreaterThan(filterPanelIndex)
    expect(template.slice(controlsIndex, queryInputIndex)).toContain('<z-accordion')
    expect(template.slice(retrievalPanelIndex, filterPanelIndex)).toContain('<xp-knowledge-retrieval-settings')
    expect(template.slice(filterPanelIndex, queryInputIndex)).toContain('<xp-knowledge-filter-form')
  })

  it('removes the connected-overlay retrieval settings trigger', () => {
    expect(template).not.toContain('cdkOverlayOrigin')
    expect(template).not.toContain('cdkConnectedOverlay')
    expect(template).not.toContain('retrievalSettingsTrigger')
  })
})
