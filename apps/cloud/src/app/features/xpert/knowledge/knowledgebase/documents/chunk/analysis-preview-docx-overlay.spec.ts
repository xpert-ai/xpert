import { KnowledgeDocumentAnalysisPage } from '@xpert-ai/contracts'
import { renderDocxAnalysisOverlays } from './analysis-preview-docx-overlay'

describe('renderDocxAnalysisOverlays', () => {
  const page: KnowledgeDocumentAnalysisPage = {
    schemaVersion: 1,
    page: 1,
    width: 1000,
    height: 1400,
    markdown: 'Technical notice',
    blocks: [
      {
        id: 'block-rect',
        order: 0,
        type: 'text',
        markdown: 'Motor voltage',
        bounds: { x: 100, y: 200, width: 300, height: 80 }
      },
      {
        id: 'block-polygon',
        order: 1,
        type: 'table',
        markdown: 'Parameter table',
        polygon: [
          { x: -10, y: 500 },
          { x: 600, y: 500 },
          { x: 600, y: 1500 },
          { x: -10, y: 1500 }
        ]
      },
      {
        id: 'block-without-geometry',
        order: 2,
        type: 'text',
        markdown: 'No coordinates'
      }
    ]
  }

  it('projects bounds and polygons onto the matching docx page', () => {
    const host = document.createElement('div')
    host.innerHTML =
      '<xp-file-docx-preview><section class="docx" data-analysis-page="1"></section></xp-file-docx-preview>'

    const cleanup = renderDocxAnalysisOverlays({
      host,
      pages: new Map([[1, page]]),
      enabledTypes: new Set(),
      selectedBlockId: 'block-rect',
      selectedBlockPage: 1,
      blockAriaLabel: (block) => block.markdown,
      onSelect: jest.fn()
    })

    const overlay = host.querySelector('svg[data-analysis-docx-overlay="1"]')
    expect(overlay?.getAttribute('viewBox')).toBe('0 0 1000 1400')
    expect(overlay?.querySelector('rect[data-analysis-docx-block-id="block-rect"]')).not.toBeNull()
    expect(overlay?.querySelector('polygon')?.getAttribute('points')).toBe('0,500 600,500 600,1400 0,1400')
    expect(overlay?.querySelector('[data-analysis-docx-block-id="block-without-geometry"]')).toBeNull()

    cleanup()
    expect(host.querySelector('svg[data-analysis-docx-overlay]')).toBeNull()
  })

  it('filters block types and delegates click selection', () => {
    const host = document.createElement('div')
    host.innerHTML =
      '<xp-file-docx-preview><section class="docx" data-analysis-page="1"></section></xp-file-docx-preview>'
    const onSelect = jest.fn()

    renderDocxAnalysisOverlays({
      host,
      pages: new Map([[1, page]]),
      enabledTypes: new Set(['table']),
      selectedBlockId: null,
      selectedBlockPage: null,
      blockAriaLabel: (block) => block.markdown,
      onSelect
    })

    expect(host.querySelector('rect')).toBeNull()
    const polygon = host.querySelector<SVGPolygonElement>('polygon')
    polygon?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith(page.blocks[1], 1)
  })
})
