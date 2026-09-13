import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, of, throwError } from 'rxjs'
import { KnowledgebaseParserConfig, KnowledgebaseService, KnowledgeStructureEnum } from '@cloud/app/@core'
import { createKnowledgeProcessingForm, KnowledgeProcessingFormOptions } from './processing-form'

describe('shared knowledge processing draft', () => {
  function setup(options: KnowledgeProcessingFormOptions = {}) {
    const splitters = new BehaviorSubject([
      { name: 'auto', structure: KnowledgeStructureEnum.General },
      { name: 'recursive-character', structure: KnowledgeStructureEnum.General },
      { name: 'parent-child', structure: KnowledgeStructureEnum.ParentChild }
    ])
    const api = {
      getTextSplitterStrategies: jest.fn(() => splitters),
      getDocumentTransformerStrategies: jest.fn(() =>
        of([
          { meta: { name: 'pdf-visual', supportedFileTypes: ['pdf'] } },
          { meta: { name: 'text-only', supportedFileTypes: ['txt'] } }
        ])
      )
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: api },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    return { form: TestBed.runInInjectionContext(() => createKnowledgeProcessingForm(options)), api }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('round-trips false headers and optional table instructions without changing spreadsheet mode', () => {
    const { form } = setup({
      config: {
        spreadsheet: { firstRowAsHeader: false, includeSheets: ['Orders'] },
        tableMetadataRequirements: 'Explain units'
      }
    })
    expect(form.firstRowAsHeader()).toBe(false)
    expect(form.config().spreadsheet).toEqual({ firstRowAsHeader: false, includeSheets: ['Orders'] })
    expect(form.tableMetadataRequirements()).toBe('Explain units')
    form.tableMetadataRequirementsControl.setValue('')
    const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: form.config() }))
    expect(reopened.tableMetadataRequirements()).toBe('')
    expect(reopened.firstRowAsHeader()).toBe(false)
    expect(reopened.config().spreadsheet.interpretation).toBeUndefined()
    form.tableMetadataRequirementsControl.setValue('x'.repeat(4001))
    expect(form.validation()).toEqual({ section: 'table', key: 'XP.Knowledgebase.TableMetadata.InvalidRequirements' })
    form.tableMetadataRequirementsControl.setValue('x'.repeat(4000))
    expect(form.validation()).toBeNull()
  })

  it('saves and restores all public language hints without serializing implicit separators', () => {
    const { form } = setup()
    expect(form.chunkLanguageHint()).toBe('auto')
    expect(form.config().separators).toBeUndefined()
    expect(form.config().delimiter).toBeNull()
    for (const chunkLanguageHint of ['auto', 'Chinese', 'English'] as const) {
      form.chunkLanguageHint.set(chunkLanguageHint)
      const config = form.config()
      expect(config.chunkLanguageHint).toBe(chunkLanguageHint)
      expect(config.textSplitter).not.toHaveProperty('chunkLanguageHint')
      const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config }))
      expect(reopened.chunkLanguageHint()).toBe(chunkLanguageHint)
      expect(reopened.config().separators).toBeUndefined()
    }
    form.updateSeparators([';'])
    expect(form.config().separators).toEqual([';'])
    form.chunkLanguageHint.set('Chinese')
    expect(form.config().separators).toEqual([';'])
    form.updateSeparators([])
    expect(form.config().separators).toEqual([])
  })

  it('defaults to auto, preserves explicit strategies and restores auto after leaving parent-child mode', () => {
    const { form } = setup()
    expect(form.config().textSplitterType).toBe('auto')
    form.toggleParentChild(true)
    expect(form.config().textSplitterType).toBe('parent-child')
    form.toggleParentChild(false)
    expect(form.config().textSplitterType).toBe('auto')
    for (const textSplitterType of ['recursive-character', 'markdown-recursive', 'structure-aware', 'parent-child']) {
      const saved = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: { textSplitterType } }))
      expect(saved.config().textSplitterType).toBe(textSplitterType)
    }
    const parentChild = TestBed.runInInjectionContext(() =>
      createKnowledgeProcessingForm({ structure: KnowledgeStructureEnum.ParentChild })
    )
    expect(parentChild.config().textSplitterType).toBe('parent-child')
  })

  it('round-trips new strategies, exposes their capabilities and keeps the token cap in the common form', () => {
    const { form } = setup({ config: { maxChunkTokens: 64 } })
    form.splitterProviders.set(
      ['auto', 'structure-aware'].map((name) => ({
        name,
        label: { en_US: name },
        structure: KnowledgeStructureEnum.General,
        chunkingCapabilities: {
          size: name === 'auto' ? 'strategy-dependent' : 'target',
          separators: true,
          tokenBudget: true
        },
        configSchema: {
          type: 'object',
          properties: {
            chunkSize: { type: 'number' },
            maxChunkTokens: { type: 'number' },
            separators: { type: 'array' }
          }
        }
      }))
    )
    for (const strategy of ['auto', 'structure-aware']) {
      form.selectChunkStrategy(strategy)
      form.splitterOptions.set({ maxChunkTokens: 1 })
      expect(form.supportsSeparators()).toBe(true)
      expect(form.chunkSizeMeaning()).toBe(strategy === 'auto' ? 'strategy-dependent' : 'target')
      expect(form.splitterSchema()).toBeNull()
      const config = form.config()
      expect(config.maxChunkTokens).toBe(64)
      expect(config.textSplitter.maxChunkTokens).toBeUndefined()
      const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config }))
      expect(reopened.config().textSplitterType).toBe(strategy)
      expect(reopened.config().maxChunkTokens).toBe(64)
    }
    form.selectChunkStrategy('recursive-character')
    expect(form.chunkSizeMeaning()).toBe('maximum')
  })

  it('omits inactive invalid question fields from the saved config and retains the draft on re-enable', () => {
    const { form } = setup()
    form.questionGenerationEnabled.set(true)
    form.questionCountControl.setValue(0)
    form.questionRequirementsControl.setValue('x'.repeat(4001))
    form.questionGenerationEnabled.set(false)
    expect(form.validation()).toBeNull()
    expect(form.config().questionGeneration).toEqual({ enabled: false })
    form.questionGenerationEnabled.set(true)
    expect(form.questionCount()).toBe(0)
    expect(form.questionRequirements()).toHaveLength(4001)
  })

  it('preserves valid saved question settings while generation is disabled', () => {
    const questionGeneration = {
      enabled: false,
      questionCount: 5,
      customInstructions: 'Use procurement terminology',
      model: { copilotId: 'd349f858-50c2-4b41-a422-e74e265b4569', model: 'chat', modelType: AiModelTypeEnum.LLM }
    }
    const { form } = setup({ config: { questionGeneration } })
    expect(form.config().questionGeneration).toEqual(questionGeneration)
  })

  it('keeps question generation opt-in and round-trips its model, count and instructions', () => {
    const { form } = setup()
    expect(form.config().questionGeneration.enabled).toBe(false)
    form.questionGenerationEnabled.set(true)
    expect(form.validation()?.key).toContain('MissingModel')
    form.questionModel.set({
      copilotId: 'd349f858-50c2-4b41-a422-e74e265b4569',
      model: 'chat',
      modelType: AiModelTypeEnum.LLM
    })
    form.questionCountControl.setValue(5)
    form.questionRequirementsControl.setValue('Use procurement terminology')
    expect(form.validation()).toBeNull()
    const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: form.config() }))
    expect(reopened.config().questionGeneration).toEqual(form.config().questionGeneration)
    for (const count of [0, 11, 1.5, null]) {
      form.questionCountControl.setValue(count)
      expect(form.validation()?.key).toContain('InvalidSettings')
    }
    form.questionCountControl.setValue(3)
    form.questionRequirementsControl.setValue('x'.repeat(4001))
    expect(form.validation()?.key).toContain('InvalidSettings')
    form.questionGenerationEnabled.set(false)
    expect(form.validation()).toBeNull()
  })

  it('persists the token cap, supports explicit zero and rejects invalid values in both structures', () => {
    const { form } = setup({ config: { maxChunkTokens: 256 } })
    expect(form.maxChunkTokens()).toBe(256)
    form.maxChunkTokensControl.setValue(128)
    const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: form.config() }))
    expect(reopened.maxChunkTokens()).toBe(128)
    for (const parentChild of [false, true]) {
      form.toggleParentChild(parentChild)
      for (const invalid of [null, -1, 1.5, 8193, NaN]) {
        form.maxChunkTokensControl.setValue(invalid)
        expect(form.validation()?.key).toContain('InvalidTokenLimit')
      }
      for (const valid of [0, 1, 128, 8192]) {
        form.maxChunkTokensControl.setValue(valid)
        expect(form.config().maxChunkTokens).toBe(valid)
        expect(form.validation()).toBeNull()
      }
    }
  })

  it('defaults images to off even if an old strategy or a vision model exists', () => {
    const { form } = setup({ config: { imageUnderstandingType: 'vlm-default' }, visionModel: { model: 'vision' } })
    expect(form.imageUnderstandingEnabled()).toBe(false)
    expect(form.config().imageUnderstandingEnabled).toBe(false)
    expect(form.validation()).toBeNull()
  })

  it('inherits an explicit enable flag and validates the model only while enabled', () => {
    const { form } = setup({ config: { imageUnderstandingEnabled: true } })
    expect(form.validation()?.section).toBe('image')
    form.visionModel.set({ model: 'vision' })
    expect(form.validation()).toBeNull()
    form.visionModel.set(undefined)
    form.imageUnderstandingEnabled.set(false)
    expect(form.validation()).toBeNull()
  })

  it('isolates editing of nested configuration and model options from knowledgebase defaults', () => {
    const config: Partial<KnowledgebaseParserConfig> = {
      pdfParser: { transformerType: 'pdf-visual', transformer: { renderPageImages: true } },
      separators: ['!', '\\n'],
      imageUnderstanding: { promptTemplate: 'Original {{context}}' }
    }
    const visionModel = { model: 'vision', options: { temperature: 0.1 } }
    const { form } = setup({ config, visionModel })
    form.pdfParserOptions().renderPageImages = false
    form.separators().push('?')
    form.visionModel().options.temperature = 0.7
    form.imagePromptTemplate.set('New {{context}}')
    expect(config.pdfParser.transformer).toEqual({ renderPageImages: true })
    expect(config.separators).toEqual(['!', '\\n'])
    expect(config.imageUnderstanding.promptTemplate).toBe('Original {{context}}')
    expect(visionModel.options.temperature).toBe(0.1)
  })

  it.each([{ separators: ['\\n', '!'] }, { separators: '\\n,!' }])(
    'preserves historical nested separators %p',
    ({ separators }) => {
      const { form } = setup({ config: { textSplitter: { separators } } })
      expect(form.config().separators).toEqual(['\n', '!'])
      form.updateSeparators([])
      expect(form.config().separators).toEqual([])
    }
  )

  it('preserves parent and child settings without replacing them with ordinary chunk controls', () => {
    const { form } = setup({
      structure: KnowledgeStructureEnum.ParentChild,
      config: {
        textSplitter: {
          parent: { mode: 'paragraph', separator: '\\n\\n', maxChars: 1200 },
          child: { separator: '\\n', maxChars: 200 }
        }
      }
    })
    expect(form.config().textSplitterType).toBe('parent-child')
    expect(form.config().textSplitter).toEqual({
      parent: { mode: 'paragraph', separators: ['\\n\\n'], maxChars: 1200 },
      child: { separators: ['\\n'], maxChars: 200 }
    })
  })

  it('omits an empty extra schema while retaining plugin-specific fields', () => {
    const { form } = setup({ config: { textSplitterType: 'recursive-character' } })
    form.splitterProviders.set([
      {
        name: 'recursive-character',
        configSchema: {
          type: 'object',
          properties: {
            chunkSize: { type: 'number' },
            chunkOverlap: { type: 'number' },
            separators: { type: 'string' }
          }
        }
      }
    ])
    expect(form.splitterSchema()).toBeNull()
    form.splitterProviders.set([
      {
        name: 'recursive-character',
        configSchema: {
          type: 'object',
          properties: { customOption: { type: 'string' } }
        }
      }
    ])
    expect(form.splitterSchema()?.properties).toHaveProperty('customOption')
  })

  it('keeps parent-child edits when toggling and validates only active settings', () => {
    const { form } = setup()
    form.toggleParentChild(true)
    const controls = form.parentChild.controls
    controls.parent.controls.maxChars.setValue(1500)
    controls.child.controls.maxChars.setValue(300)
    form.toggleParentChild(false)
    form.toggleParentChild(true)
    expect(form.config().textSplitter).toMatchObject({ parent: { maxChars: 1500 }, child: { maxChars: 300 } })
    controls.parent.controls.maxChars.setValue(null)
    expect(form.validation()?.section).toBe('chunk')
    controls.parent.controls.mode.setValue('full')
    expect(form.config().textSplitter).toMatchObject({ parent: { mode: 'full' } })
    expect(form.config().textSplitter.parent).not.toHaveProperty('maxChars')
    expect(form.validation()).toBeNull()
    controls.child.controls.maxChars.setValue(0)
    expect(form.validation()?.section).toBe('chunk')
    form.toggleParentChild(false)
    expect(form.validation()).toBeNull()
  })

  it('uses readable separator labels without changing persisted separator values', () => {
    const { form } = setup({ config: { separators: ['\\n\\n', '\n', '|'] } })
    expect(form.displaySeparator('\\n\\n')).toBe(
      'XP.Knowledgebase.WorkspaceConfiguration.Chunk.SeparatorLabels.DoubleNewline'
    )
    expect(form.displaySeparator('\n')).toBe(
      'XP.Knowledgebase.WorkspaceConfiguration.Chunk.SeparatorLabels.SingleNewline'
    )
    expect(form.config().separators).toEqual(['\\n\\n', '\n', '|'])
    expect(form.compareSeparators('\n', '\\n')).toBe(true)
    expect(form.compareSeparators('\n\n', '\\n')).toBe(false)
  })

  it('keeps multiple separators ordered and independent across saving and reopening', () => {
    const { form } = setup({ structure: KnowledgeStructureEnum.ParentChild })
    const parent = ['\\n\\n', '\\n', '|']
    const child = [',', '.*', '\\n']
    form.parentChild.controls.parent.controls.separators.setValue(parent)
    form.parentChild.controls.child.controls.separators.setValue(child)
    const saved = form.config()
    const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: saved }))
    expect(reopened.parentChild.controls.parent.controls.separators.value).toEqual(parent)
    expect(reopened.parentChild.controls.child.controls.separators.value).toEqual(child)
    reopened.parentChild.controls.parent.controls.separators.setValue([])
    reopened.parentChild.controls.child.controls.separators.setValue([])
    const empty = reopened.config()
    const cleared = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: empty }))
    expect(cleared.config().textSplitter.parent).toMatchObject({ separators: [] })
    expect(cleared.config().textSplitter.child).toMatchObject({ separators: [] })
    expect(cleared.config().textSplitter.parent).not.toHaveProperty('separator')
    expect(saved.textSplitter.parent).toMatchObject({ separators: parent })
  })

  it('prefers persisted lists over legacy fields and keeps literal legacy escapes', () => {
    const { form } = setup({
      structure: KnowledgeStructureEnum.ParentChild,
      config: {
        textSplitter: {
          parent: { separator: '|', separators: [',', '\\n'] },
          child: { separator: '\\t' }
        }
      }
    })
    expect(form.parentChild.controls.parent.controls.separators.value).toEqual([',', '\\n'])
    expect(form.parentChild.controls.child.controls.separators.value).toEqual(['\\\\t'])
  })

  it('finishes loading from organization streams without waiting for completion', async () => {
    const { form } = setup()
    await form.loadStrategies()
    expect(form.strategiesLoading()).toBe(false)
    expect(form.strategiesLoaded()).toBe(true)
    expect(form.pdfProviders().map((provider) => provider.meta.name)).toEqual(['pdf-visual'])
    form.selectPdfParser('text-only')
    expect(form.validation()?.section).toBe('parser')
    form.selectPdfParser('pdf-visual')
    expect(form.validation()).toBeNull()
    form.chunkOverlap.set(512)
    expect(form.validation()?.section).toBe('chunk')
  })

  it('retries a failed provider lookup and clears the loading error', async () => {
    const { form, api } = setup()
    api.getDocumentTransformerStrategies.mockReturnValueOnce(throwError(() => new Error('failed')))
    await form.loadStrategies()
    expect(form.strategiesError()).toContain('failed')
    expect(form.strategiesLoaded()).toBe(false)
    await form.loadStrategies()
    expect(form.strategiesError()).toBe('')
    expect(form.strategiesLoaded()).toBe(true)
  })
})
