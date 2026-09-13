jest.mock('../../../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('@cloud/app/@shared/knowledge', () => ({ KnowledgeChunkComponent: class {} }))

import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { KBDocumentCategoryEnum, KnowledgeDocumentService, KnowledgeTablePreview } from '@cloud/app/@core'
import { KnowledgeDocumentPreviewComponent } from './preview.component'

const result: KnowledgeTablePreview = {
  tables: [
    {
      tableId: 'one',
      sheetName: 'Orders',
      range: 'A1:A2',
      headerRow: 1,
      rowCount: 1,
      columns: [{ columnId: 'A', key: 'sku', label: 'sku', column: 1 }]
    },
    {
      tableId: 'two',
      sheetName: 'Prices',
      range: 'B2:B3',
      headerRow: 2,
      rowCount: 1,
      columns: [{ columnId: 'B', key: 'price', label: 'price', column: 2 }]
    }
  ],
  chunks: []
}

describe('table preview and index selection', () => {
  async function setup(config = {}) {
    const api = { estimateTable: jest.fn(() => of(result)), estimate: jest.fn(() => of([])) }
    TestBed.configureTestingModule({ providers: [{ provide: KnowledgeDocumentService, useValue: api }] })
    TestBed.overrideComponent(KnowledgeDocumentPreviewComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(KnowledgeDocumentPreviewComponent)
    fixture.componentRef.setInput('knowledgebaseValue', { id: 'kb' })
    fixture.componentRef.setInput('document', {
      type: 'xlsx',
      category: KBDocumentCategoryEnum.Sheet,
      filePath: '/sample.xlsx'
    })
    fixture.componentRef.setInput('parserConfig', config)
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 650))
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, component: fixture.componentInstance, api }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('uses parser columns from all worksheets, including tables without preview rows', async () => {
    const { component, api } = await setup({ spreadsheet: { firstRowAsHeader: false } })
    expect(api.estimateTable).toHaveBeenCalledWith(
      expect.objectContaining({ parserConfig: expect.objectContaining({ spreadsheet: { firstRowAsHeader: false } }) })
    )
    expect(api.estimate).not.toHaveBeenCalled()
    expect(component.fields().map((field) => field.value)).toEqual(['sku', 'price'])
    expect(component.allIndexed()).toBe(true)
  })

  it('retains stale selections until the user explicitly selects valid columns', async () => {
    const { component } = await setup({ indexedFields: ['old-header'] })
    expect(component.invalidIndexedFields()).toEqual(['old-header'])
    expect(component.effectiveConfig().indexedFields).toEqual(['old-header'])
    component.selectAllFields()
    expect(component.parserConfig().indexedFields).toEqual(['sku', 'price'])
    component.updateIndexed('sku', false)
    expect(component.parserConfig().indexedFields).toEqual(['price'])
    component.updateIndexed('price', false)
    expect(component.parserConfig().indexedFields).toEqual(['price'])
    expect(component.selectionError()).toBe(true)
  })

  it('preserves legacy empty selection semantics and keeps unsupported parsers on the old API', async () => {
    const { fixture, component, api } = await setup({ indexedFields: [] })
    expect(component.allIndexed()).toBe(true)
    fixture.componentRef.setInput('parserConfig', { transformerType: 'external' })
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 650))
    fixture.detectChanges()
    await fixture.whenStable()
    expect(component.isRecordSpreadsheet()).toBe(false)
    expect(api.estimate).toHaveBeenCalled()
  })
})
