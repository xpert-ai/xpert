import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { OverlayContainer } from '@angular/cdk/overlay'
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
    TestBed.inject(OverlayContainer).ngOnDestroy()
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
  })

  it.each([false, true])('uses dialog approval for a paid Wiki settings change (approved: %s)', async (approved) => {
    const component = createComponent({
      knowledgebase: {
        id: 'kb-1',
        name: 'Wiki',
        documentNum: 2,
        type: KnowledgebaseTypeEnum.Standard,
        copilotModel: { id: 'embedding-1' },
        chatModel: { id: 'llm-1' },
        wikiConfig: { enabled: true, extractionGranularity: 'standard' }
      }
    })
    component.updateWikiConfig('extractionGranularity', 'exhaustive')
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const api = TestBed.inject(KnowledgebaseService)
    const parentDialog = TestBed.inject(DialogRef)
    parentDialog.disableClose = false
    const pending = component.save()
    await component.save()
    TestBed.tick()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(confirm).not.toHaveBeenCalled()
    expect(overlay.querySelectorAll('z-dialog')).toHaveLength(1)
    expect(overlay.textContent).toContain('XP.Knowledgebase.Wiki.RebuildConfirm')
    expect(api.updateWikiConfiguration).not.toHaveBeenCalled()
    expect(parentDialog.disableClose).toBe(true)
    overlay.querySelector<HTMLButtonElement>(`[data-testid="z-${approved ? 'ok' : 'cancel'}-button"]`).click()
    await pending
    expect(parentDialog.disableClose).toBe(false)
    expect(component.loading()).toBe(false)
    if (approved) {
      expect(api.updateWikiConfiguration).toHaveBeenCalledTimes(1)
      expect(api.updateWikiConfiguration).toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({
          confirmModelCharges: true,
          wikiConfig: expect.objectContaining({ extractionGranularity: 'exhaustive' })
        })
      )
      expect(parentDialog.close).toHaveBeenCalled()
    } else {
      expect(api.updateWikiConfiguration).not.toHaveBeenCalled()
      expect(parentDialog.close).not.toHaveBeenCalled()
    }
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

    expect(component.processing.indexStrategyLocked()).toBe(true)
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
  it('saves and reopens the full first-batch parser settings', () => {
    const component = createComponent({
      knowledgebase: {
        id: 'kb-1',
        name: 'Settings',
        type: KnowledgebaseTypeEnum.Standard,
        workspaceId: 'workspace-1',
        copilotModel: { id: 'embedding' }
      }
    })
    component.processing.firstRowAsHeader.set(false)
    component.processing.tableMetadataRequirementsControl.setValue('Explain table units')
    component.processing.chunkSize.set(512)
    component.processing.chunkOverlap.set(0)
    component.processing.updateSeparators(['\\n\\n', '！', '？', ',', ''])
    component.processing.selectChunkStrategy('markdown-recursive')
    component.processing.splitterOptions.set({ headerToSplitOn: 2 })
    component.processing.imageUnderstandingEnabled.set(false)
    component.processing.imagePromptTemplate.set('请用中文解析图片：{{context}}')
    component.processing.selectPdfParser('pdf-visual')
    component.processing.pdfParserOptions.set({ renderPageImages: false, maxPages: 20 })
    component.save()
    const service = component.knowledgebaseService
    const input = jest.mocked(service.updateWikiConfiguration).mock.calls[0][1]
    expect(input.settings.parserConfig).toMatchObject({
      spreadsheet: { firstRowAsHeader: false },
      tableMetadataRequirements: 'Explain table units',
      chunkSize: 512,
      chunkOverlap: 0,
      separators: ['\\n\\n', '！', '？', ',', ''],
      textSplitterType: 'markdown-recursive',
      textSplitter: { headerToSplitOn: 2 },
      imageUnderstandingEnabled: false,
      imageUnderstanding: { promptTemplate: '请用中文解析图片：{{context}}' },
      pdfParser: { transformerType: 'pdf-visual', transformer: { renderPageImages: false, maxPages: 20 } }
    })
    TestBed.resetTestingModule()
    const editor = createComponent({ knowledgebase: { id: 'kb-1', ...input.settings } })
    expect(editor.processing.firstRowAsHeader()).toBe(false)
    expect(editor.processing.tableMetadataRequirements()).toBe('Explain table units')
    expect(editor.processing.chunkOverlap()).toBe(0)
    expect(editor.processing.separators()).toEqual(['\\n\\n', '！', '？', ',', ''])
    expect(editor.processing.chunkStrategy()).toBe('markdown-recursive')
    expect(editor.processing.imagePromptTemplate()).toBe('请用中文解析图片：{{context}}')
    expect(editor.processing.pdfParserOptions()).toEqual({ renderPageImages: false, maxPages: 20 })
  })

  it('stores the existing parent-child strategy parameters and preserves empty separators', () => {
    const component = createComponent({
      knowledgebase: { id: 'kb-1', name: 'Parent', copilotModel: { id: 'embedding' } }
    })
    component.processing.toggleParentChild(true)
    component.processing.parentChild.controls.parent.controls.mode.setValue('full')
    component.processing.parentChild.controls.child.patchValue({ maxChars: 100, separators: ['\\n', ','] })
    component.processing.updateSeparators([])
    component.save()
    const input = jest.mocked(component.knowledgebaseService.updateWikiConfiguration).mock.calls[0][1]
    expect(input.settings.parserConfig).toMatchObject({
      textSplitterType: 'parent-child',
      textSplitter: { parent: { mode: 'full' }, child: { maxChars: 100, separators: ['\\n', ','] } },
      separators: []
    })
  })

  it('defaults image understanding to off when no preference is stored', () => {
    const component = createComponent({
      knowledgebase: { id: 'kb-1', name: 'Inherited', copilotModel: { id: 'embedding' } }
    })
    component.save()
    const input = jest.mocked(component.knowledgebaseService.updateWikiConfiguration).mock.calls[0][1]
    expect(input.settings.parserConfig.imageUnderstandingEnabled).toBe(false)
    expect(input.settings.parserConfig.imageUnderstandingType).toBeUndefined()
  })

  it('rejects overlap that is not smaller than the chunk size', () => {
    const component = createComponent({
      knowledgebase: { id: 'kb-1', name: 'Invalid', copilotModel: { id: 'embedding' } }
    })
    component.processing.chunkSize.set(512)
    component.processing.chunkOverlap.set(512)
    component.save()
    expect(component.knowledgebaseService.updateWikiConfiguration).not.toHaveBeenCalled()
    expect(component.activeSection()).toBe('chunk')
  })
})
