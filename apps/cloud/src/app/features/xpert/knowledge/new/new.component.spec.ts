import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import { KnowledgebaseService, KnowledgebaseTypeEnum, ToastrService, XpertAPIService } from '../../../../@core'

jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class CopilotModelSelectComponent {} }))
jest.mock('@cloud/app/@shared/knowledge', () => ({
  hasEnabledKnowledgeRetrievalSource: () => true,
  KnowledgeRetrievalSettingsComponent: class KnowledgeRetrievalSettingsComponent {}
}))

import { XpertNewKnowledgeComponent } from './new.component'

describe('XpertNewKnowledgeComponent', () => {
  function createComponent(dialogData: object) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: dialogData
        },
        {
          provide: DialogRef,
          useValue: {
            close: jest.fn()
          }
        },
        {
          provide: XpertAPIService,
          useValue: {}
        },
        {
          provide: ToastrService,
          useValue: {
            success: jest.fn(),
            error: jest.fn()
          }
        },
        {
          provide: TranslateService,
          useValue: {
            instant: jest.fn((key: string) => key)
          }
        },
        {
          provide: KnowledgebaseService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(() => of({ id: 'kb-1' })),
            updateWikiConfiguration: jest.fn(() => of({ id: 'kb-1' }))
          }
        }
      ]
    })

    return TestBed.runInInjectionContext(() => new XpertNewKnowledgeComponent())
  }

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('keeps an empty initial name invalid after selecting an embedding model', () => {
    const component = createComponent({ workspaceId: 'workspace-1' })

    component.copilotModel.set({} as never)

    expect(() => component.invalid()).not.toThrow()
    expect(component.invalid()).toBe(true)
  })

  it('can select and then clear Wiki while creating an empty knowledgebase', () => {
    const component = createComponent({ workspaceId: 'workspace-1' })

    component.toggleWiki()
    expect(component.wikiEnabled()).toBe(true)

    component.toggleWiki()
    expect(component.wikiEnabled()).toBe(false)
  })

  it('keeps the Wiki strategy unchanged for an existing knowledgebase with content', () => {
    const component = createComponent({
      knowledgebase: {
        id: 'kb-1',
        type: KnowledgebaseTypeEnum.Standard,
        documentNum: 1,
        wikiConfig: { enabled: false, extractionGranularity: 'standard' }
      }
    })

    expect(component.indexStrategyLocked()).toBe(true)
    component.toggleWiki()
    expect(component.wikiEnabled()).toBe(false)
  })

  it('opens the requested settings section', () => {
    const component = createComponent({ initialSection: 'models' })

    expect(component.activeSection()).toBe('models')
  })

  it('uses weighted RRF for new knowledgebases without migrating existing legacy settings', () => {
    const component = createComponent({ workspaceId: 'workspace-1' })
    expect(component.retrieval().recall?.fusion?.mode).toBe('weighted_rrf')

    TestBed.resetTestingModule()
    const editor = createComponent({ knowledgebase: { id: 'kb-1', recall: { mode: 'hybrid' } } })
    expect(editor.retrieval().recall?.fusion).toBeUndefined()
  })

  it('can enable graph indexing for existing content without changing Wiki or retrieval mode', () => {
    const component = createComponent({
      knowledgebase: {
        id: 'kb-1',
        name: 'Existing documents',
        type: KnowledgebaseTypeEnum.Standard,
        documentNum: 2,
        copilotModel: { id: 'embedding-1' },
        wikiConfig: { enabled: false },
        recall: { mode: 'vector' },
        graphRag: { enabled: false, mode: 'vector', entityTopK: 12 }
      }
    })

    component.toggleGraph()
    component.save()

    expect(component.wikiEnabled()).toBe(false)
    expect(component.knowledgebaseService.updateWikiConfiguration).toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({
        settings: expect.objectContaining({
          graphRag: expect.objectContaining({ enabled: true, mode: 'vector', entityTopK: 12 }),
          recall: expect.objectContaining({ mode: 'vector' })
        }),
        wikiConfig: expect.objectContaining({ enabled: false })
      })
    )

    component.toggleGraph()
    expect(component.retrieval().graphRag?.enabled).toBe(false)
  })

  it('cannot enable graph indexing for FAQ knowledgebases', () => {
    const component = createComponent({ knowledgebase: { id: 'faq-1', type: KnowledgebaseTypeEnum.FAQ } })

    component.toggleGraph()

    expect(component.retrieval().graphRag?.enabled).toBe(false)
  })

  function createEditor() {
    return createComponent({
      knowledgebase: {
        id: 'kb-1',
        name: 'Wiki test',
        type: KnowledgebaseTypeEnum.Standard,
        documentNum: 0,
        copilotModel: { id: 'embedding-1', model: 'embedding' },
        chatModel: { id: 'llm-1', model: 'llm' },
        wikiConfig: { enabled: true, extractionGranularity: 'standard' }
      }
    })
  }

  it('sends ordinary and Wiki settings in one save request', () => {
    const component = createEditor()
    component.description.set('Updated description')

    component.save()

    expect(component.knowledgebaseService.update).not.toHaveBeenCalled()
    expect(component.knowledgebaseService.updateWikiConfiguration).toHaveBeenCalledTimes(1)
    expect(component.knowledgebaseService.updateWikiConfiguration).toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({
        settings: expect.objectContaining({
          description: 'Updated description',
          chatModel: { id: 'llm-1', model: 'llm' }
        }),
        wikiConfig: expect.objectContaining({ enabled: true }),
        wikiModel: null
      })
    )
    expect(TestBed.inject(DialogRef).close).toHaveBeenCalledWith({ id: 'kb-1' })
  })

  it('persists the Wiki content selection as part of the knowledgebase recall defaults', () => {
    const component = createEditor()
    component.retrieval.update((retrieval) => ({
      ...retrieval,
      recall: { ...retrieval.recall, contentScope: 'original' }
    }))
    component.save()
    expect(component.knowledgebaseService.updateWikiConfiguration).toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({
        settings: expect.objectContaining({ recall: expect.objectContaining({ contentScope: 'original' }) })
      })
    )
  })

  it('keeps the editor open without a separate ordinary save when Wiki validation fails', () => {
    const component = createEditor()
    jest
      .spyOn(component.knowledgebaseService, 'updateWikiConfiguration')
      .mockReturnValue(throwError(() => new Error('Wiki strategy is locked')))

    component.save()

    expect(component.knowledgebaseService.update).not.toHaveBeenCalled()
    expect(TestBed.inject(DialogRef).close).not.toHaveBeenCalled()
    expect(TestBed.inject(ToastrService).error).toHaveBeenCalled()
    expect(component.loading()).toBe(false)
  })
})
