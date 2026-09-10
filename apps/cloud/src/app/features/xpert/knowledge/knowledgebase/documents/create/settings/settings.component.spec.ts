jest.mock('../../../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))
jest.mock('@cloud/app/@shared/knowledge', () => ({ KnowledgeDocIdComponent: class {} }))
jest.mock('../preview/preview.component', () => ({ KnowledgeDocumentPreviewComponent: class {} }))

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { KBDocumentCategoryEnum, KnowledgebaseService } from '@cloud/app/@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentCreateSettingsComponent } from './settings.component'

describe('KnowledgeDocumentCreateSettingsComponent defaults', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseComponent, useValue: { knowledgebase: signal({ id: 'kb' }) } },
        {
          provide: KnowledgebaseService,
          useValue: {
            getTextSplitterStrategies: () => of([]),
            getDocumentTransformerStrategies: () => of([]),
            getDocumentSourceStrategies: () => of([]),
            understandingStrategies$: of([])
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new KnowledgeDocumentCreateSettingsComponent())
    component.parserConfig.set({})
    component.documents.set([])
    return component
  }

  afterEach(() => TestBed.resetTestingModule())

  it('keeps native spreadsheet settings available when the transformer is inherited', () => {
    const component = setup()
    component.documents.set([{ type: 'xlsx', category: KBDocumentCategoryEnum.Sheet }])
    expect(component.transformerType()).toBe('')
    expect(component.usesPlatformSpreadsheetParser()).toBe(true)
    component.parserConfig.set({ transformerType: 'external-parser' })
    TestBed.flushEffects()
    expect(component.usesPlatformSpreadsheetParser()).toBe(false)
  })

  it('keeps an explicit image opt-out distinct from PDF format defaults', () => {
    const component = setup()
    component.documents.set([{ type: 'pdf', category: KBDocumentCategoryEnum.Text }])
    TestBed.flushEffects()
    expect(component.enableImageUnderstanding()).toBe(true)
    component.parserConfig.set({ imageUnderstandingEnabled: false })
    TestBed.flushEffects()
    expect(component.enableImageUnderstanding()).toBe(false)
  })

  it('preserves inherited ordered separators including an explicit empty list', () => {
    const component = setup()
    component.parserConfig.set({ separators: ['\\n', '!', '?', ','] })
    TestBed.flushEffects()
    expect(component.separators()).toEqual(['\\n', '!', '?', ','])
    component.parserConfig.set({ separators: [] })
    TestBed.flushEffects()
    expect(component.separators()).toEqual([])
  })
})
