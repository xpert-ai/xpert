import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { KBDocumentCategoryEnum, KnowledgeTableMetadata } from '@xpert-ai/contracts'
import { KnowledgeTableMetadataComponent } from './table-metadata.component'

describe('table metadata detail', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('shows missing generation and explicit failures separately from document chunks', () => {
    TestBed.configureTestingModule({ imports: [KnowledgeTableMetadataComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(KnowledgeTableMetadataComponent)
    const document = { type: 'xlsx', category: KBDocumentCategoryEnum.Sheet }
    fixture.componentRef.setInput('document', document)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('NotGenerated')
    const state: KnowledgeTableMetadata = {
      schemaVersion: 1,
      status: 'skipped',
      reason: 'missing_model',
      inputHash: 'hash',
      generationId: 'version',
      updatedAt: '2026-09-11',
      tables: []
    }
    fixture.componentRef.setInput('document', { ...document, metadata: { tableMetadata: state } })
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Reason.missing_model')
    fixture.componentRef.setInput('document', {
      ...document,
      metadata: { tableMetadata: { ...state, reason: undefined, status: 'failed', error: 'Model unavailable' } }
    })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toBe('Model unavailable')
    expect(fixture.nativeElement.textContent).toContain('ReprocessHint')
    expect(fixture.nativeElement.querySelector('input,textarea')).toBeNull()
  })

  it('keeps unsupported documents without generated metadata out of the table section', () => {
    TestBed.configureTestingModule({ imports: [KnowledgeTableMetadataComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(KnowledgeTableMetadataComponent)
    fixture.componentRef.setInput('document', { type: 'xlsx', category: KBDocumentCategoryEnum.Text })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[data-table-metadata]')).toBeNull()
  })
})
