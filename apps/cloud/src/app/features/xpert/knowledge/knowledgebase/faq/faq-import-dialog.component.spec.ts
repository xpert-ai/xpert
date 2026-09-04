import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { KnowledgeFAQService } from '../../../../../@core'
import { KnowledgeFAQImportDialogComponent } from './faq-import-dialog.component'

describe('KnowledgeFAQImportDialogComponent', () => {
  const close = jest.fn()
  const faqService = {
    previewImportFile: jest.fn(),
    importFile: jest.fn(),
    downloadImportTemplate: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: { knowledgebaseId: 'kb-1' } },
        { provide: KnowledgeFAQService, useValue: faqService }
      ]
    })
  })

  afterEach(() => TestBed.resetTestingModule())

  it('previews a selected file before importing it', async () => {
    const preview = {
      total: 1,
      items: [{ row: 1, standardQuestion: 'How do I reset my password?' }],
      truncated: false
    }
    faqService.previewImportFile.mockReturnValue(of(preview))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQImportDialogComponent())
    const file = new File(['csv'], 'faq.csv', { type: 'text/csv' })

    await component.useFile(file)

    expect(faqService.previewImportFile).toHaveBeenCalledWith('kb-1', file)
    expect(component.preview()).toEqual(preview)
  })

  it('passes replace mode to the import request and closes after success', async () => {
    const preview = {
      total: 1,
      items: [{ row: 1, standardQuestion: 'How do I reset my password?' }],
      truncated: false
    }
    const result = { total: 1, imported: 1, failed: [] }
    faqService.previewImportFile.mockReturnValue(of(preview))
    faqService.importFile.mockReturnValue(of(result))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQImportDialogComponent())
    const file = new File(['csv'], 'faq.csv', { type: 'text/csv' })
    await component.useFile(file)
    component.setMode('replace')

    await component.importFAQs()

    expect(faqService.importFile).toHaveBeenCalledWith('kb-1', file, 'replace')
    expect(close).toHaveBeenCalledWith(result)
  })
})
