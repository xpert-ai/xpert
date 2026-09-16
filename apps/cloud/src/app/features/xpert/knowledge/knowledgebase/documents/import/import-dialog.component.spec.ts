jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))
jest.mock('../pipeline/settings/settings.component', () => ({ KnowledgeDocumentPipelineSettingsComponent: class {} }))

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormsModule } from '@angular/forms'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import {
  IKnowledgeDocument,
  BUILTIN_KNOWLEDGE_FILE_TYPES,
  KnowledgeTablePreview,
  KBDocumentCategoryEnum,
  KnowledgeStructureEnum,
  KnowledgebaseService,
  KnowledgeDocumentService
} from '@cloud/app/@core'
import { DocumentImportDialogComponent } from './import-dialog.component'
import { IMPORT_ROOT_FOLDER } from './import-folder-tree'
import { XpTreeSelectComponent } from '@cloud/app/@shared/form-fields/tree-select/tree-select.component'

describe('DocumentImportDialogComponent', () => {
  async function setup(
    graphEnabled = false,
    editDocument?: IKnowledgeDocument,
    structure = KnowledgeStructureEnum.General,
    renderTemplate = false
  ) {
    const knowledgebase = {
      id: 'kb',
      structure,
      documentNum: 0,
      graphRag: { enabled: graphEnabled },
      parserConfig: {
        textSplitterType: structure === KnowledgeStructureEnum.ParentChild ? 'parent-child' : 'recursive-character',
        chunkSize: 512,
        textSplitter: { chunkSize: 512, separators: ['\\n', '!'] },
        imageUnderstandingEnabled: undefined
      }
    }
    const api = {
      estimateTable: jest.fn((_document: Partial<IKnowledgeDocument>) =>
        of<KnowledgeTablePreview>({ tables: [], chunks: [] })
      ),
      getAll: jest.fn(() => of({ items: [] })),
      createBulk: jest.fn((_documents: Partial<IKnowledgeDocument>[], _process: boolean) => of([])),
      updateBulk: jest.fn((_documents: Partial<IKnowledgeDocument>[], _process: boolean) => of(undefined)),
      startParsing: jest.fn(() => of([])),
      getReprocessCapabilities: jest.fn(() => of({ rechunk: { available: true } }))
    }
    const ref = { close: jest.fn(), disableClose: false }
    const kbAPI = {
      getTextSplitterStrategies: () =>
        of([
          { name: 'recursive-character', structure: KnowledgeStructureEnum.General },
          { name: 'auto', structure: KnowledgeStructureEnum.General },
          { name: 'structure-aware', structure: KnowledgeStructureEnum.General },
          { name: 'parent-child', structure: KnowledgeStructureEnum.ParentChild }
        ]),
      getDocumentTransformerStrategies: () =>
        of([
          { meta: { name: 'default', supportedFileTypes: BUILTIN_KNOWLEDGE_FILE_TYPES } },
          {
            meta: {
              name: 'pdf-visual',
              supportedFileTypes: ['pdf'],
              configSchema: { type: 'object', properties: { maxPages: { type: 'number', default: 300 } } }
            }
          }
        ]),
      createTask: jest.fn(() => of({}))
    }
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            knowledgebase,
            editDocument,
            parentId: 'folder',
            locked: () => false,
            documents: [{ name: 'web', sourceType: 'web-crawl' }]
          }
        },
        { provide: DialogRef, useValue: ref },
        { provide: KnowledgeDocumentService, useValue: api },
        {
          provide: KnowledgebaseService,
          useValue: kbAPI
        }
      ]
    })
    TestBed.overrideComponent(DocumentImportDialogComponent, {
      set: renderTemplate
        ? { imports: [FormsModule, TranslateModule, XpTreeSelectComponent], schemas: [NO_ERRORS_SCHEMA] }
        : { template: '', imports: [] }
    })
    const fixture = TestBed.createComponent(DocumentImportDialogComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, component: fixture.componentInstance, api, ref, knowledgebase, kbAPI }
  }

  afterEach(() => TestBed.resetTestingModule())

  it.each([false, true])(
    'submits selected AnyDoc spreadsheets in document mode for sheet-only=%s',
    async (sheetOnly) => {
      const { component, api, knowledgebase } = await setup()
      component.processing.parserProviders.update((providers) => [
        ...providers,
        { meta: { name: 'anydoc', supportedFileTypes: ['pdf', 'xlsx', 'xls', 'csv'] } }
      ])
      const sheets = ['xlsx', 'xls', 'csv'].map((type) => ({
        type,
        category: KBDocumentCategoryEnum.Sheet,
        filePath: '/sample.' + type,
        parserConfig: { indexedFields: ['sku'], spreadsheet: { firstRowAsHeader: false } }
      }))
      component.externalDocuments.set(
        sheetOnly ? sheets : [...sheets, { type: 'pdf', category: KBDocumentCategoryEnum.Text }]
      )
      for (const type of ['xlsx', 'xls', 'csv']) component.processing.selectParser(type, 'anydoc')
      await component.submit()
      expect(component.error()).toBe('')
      expect(api.createBulk).toHaveBeenCalledTimes(1)
      const documents = api.createBulk.mock.calls[0][0]
      for (const document of documents.slice(0, 3)) {
        expect(document.parserConfig).toMatchObject({
          transformerType: 'anydoc',
          spreadsheet: { interpretation: 'form_document', firstRowAsHeader: false }
        })
      }
      expect(api.estimateTable).not.toHaveBeenCalled()
      expect(knowledgebase.parserConfig).not.toHaveProperty('parsers')
    }
  )

  it('saves the plugin mode without overwriting it with the old sheet draft', async () => {
    const document = {
      id: 'sheet',
      type: 'csv',
      version: 1,
      category: KBDocumentCategoryEnum.Sheet,
      filePath: '/sample.csv',
      parserConfig: { transformerType: 'builtin', indexedFields: ['sku'], spreadsheet: { interpretation: 'records' } }
    } as IKnowledgeDocument
    const { component, api } = await setup(false, document)
    component.processing.parserProviders.update((providers) => [
      ...providers,
      { meta: { name: 'anydoc', supportedFileTypes: ['csv'] } }
    ])
    component.processing.selectParser('csv', 'anydoc')
    await component.saveAndProcess('full')
    expect(component.error()).toBe('')
    expect(api.updateBulk.mock.calls[0][0][0].parserConfig).toMatchObject({
      transformerType: 'anydoc',
      spreadsheet: { interpretation: 'form_document' }
    })
    expect(api.estimateTable).not.toHaveBeenCalled()
  })

  it('keeps the original spreadsheet conversion mode for a rechunk-only save', async () => {
    const document = {
      id: 'sheet',
      type: 'xlsx',
      version: 1,
      category: KBDocumentCategoryEnum.Sheet,
      parserConfig: { transformerType: 'builtin', spreadsheet: { interpretation: 'records', contextUnit: 'row' } }
    } as IKnowledgeDocument
    const { component, api } = await setup(false, document)
    component.processing.parserProviders.update((providers) => [
      ...providers,
      { meta: { name: 'anydoc', supportedFileTypes: ['xlsx'] } }
    ])
    component.processing.selectParser('xlsx', 'anydoc')
    expect(component.rechunkReady()).toBe(false)
    await component.saveAndProcess('rechunk')
    expect(api.updateBulk).not.toHaveBeenCalled()
    component.processing.selectParser('xlsx', 'builtin')
    expect(component.rechunkReady()).toBe(true)
    await component.saveAndProcess('rechunk')
    expect(component.error()).toBe('')
    expect(api.updateBulk.mock.calls[0][0][0].parserConfig).toMatchObject({
      transformerType: 'builtin',
      spreadsheet: { interpretation: 'records', contextUnit: 'row' }
    })
  })

  it.each(['xlsx', 'csv'])(
    'uses shared parser settings without a table preview for %s imports and edits',
    async (type) => {
      for (const editing of [false, true]) {
        const document = {
          id: 'sheet',
          type,
          category: KBDocumentCategoryEnum.Sheet,
          version: 1,
          parserConfig: {
            indexedFields: ['sku'],
            spreadsheet: { includeSheets: ['Orders'], firstRowAsHeader: !editing }
          }
        } as IKnowledgeDocument
        const { fixture, component, api } = await setup(
          false,
          editing ? document : undefined,
          KnowledgeStructureEnum.General,
          true
        )
        if (!editing) component.externalDocuments.set([document])
        fixture.detectChanges()
        await fixture.whenStable()
        const shared = fixture.debugElement.query(By.css('xp-knowledge-processing-settings'))
        expect(shared).not.toBeNull()
        expect(shared.properties['form']).toBe(component.processing)
        expect(shared.properties['section']).toBe('parser')
        expect(fixture.debugElement.query(By.css('xp-knowledge-document-create-settings'))).toBeNull()
        expect(fixture.debugElement.query(By.css('xp-knowledge-document-preview'))).toBeNull()
        expect(fixture.debugElement.query(By.css('z-select'))).toBeNull()
        component.processing.firstRowAsHeader.set(editing)
        if (editing) await component.saveAndProcess('full')
        else await component.submit()
        const saved = (editing ? api.updateBulk : api.createBulk).mock.calls[0][0][0].parserConfig
        expect(saved).toMatchObject({
          transformerType: 'builtin',
          indexedFields: ['sku'],
          spreadsheet: { interpretation: 'records', includeSheets: ['Orders'], firstRowAsHeader: editing }
        })
        TestBed.resetTestingModule()
      }
    }
  )

  it.each([KnowledgeStructureEnum.General, KnowledgeStructureEnum.ParentChild])(
    'inherits the empty knowledgebase structure %s while allowing batch parameter changes',
    async (structure) => {
      const { component, api, knowledgebase } = await setup(false, undefined, structure)
      const parentChild = structure === KnowledgeStructureEnum.ParentChild
      component.processing.toggleParentChild(!parentChild)
      expect(component.processing.indexStrategyLocked()).toBe(true)
      expect(component.processing.parentChildChunkingEnabled()).toBe(parentChild)
      if (parentChild) {
        component.processing.parentChild.controls.child.controls.maxChars.setValue(300)
      } else {
        component.processing.chunkSize.set(800)
      }
      await component.submit()
      expect(api.createBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            parserConfig: expect.objectContaining({
              textSplitterType: parentChild ? 'parent-child' : 'recursive-character',
              ...(parentChild
                ? { textSplitter: expect.objectContaining({ child: expect.objectContaining({ maxChars: 300 }) }) }
                : { chunkSize: 800 })
            })
          })
        ],
        true
      )
      expect(knowledgebase.structure).toBe(structure)
      expect(knowledgebase.parserConfig.chunkSize).toBe(512)
    }
  )

  it('edits the existing document without creating or moving it, then runs the selected processing mode', async () => {
    const document = {
      id: 'existing',
      name: 'note.txt',
      type: 'txt',
      version: 3,
      parserConfig: { textSplitter: { chunkSize: 900 }, removeSensitive: true }
    } as IKnowledgeDocument
    const { component, api, ref } = await setup(false, document)
    expect(component.processing.chunkSize()).toBe(900)
    expect(component.processing.indexStrategyLocked()).toBe(true)
    expect(api.getAll).not.toHaveBeenCalled()
    component.selectFolder('elsewhere')
    component.removeExternal(0)
    expect(component.documents()).toHaveLength(1)
    component.processing.chunkSize.set(700)
    await component.submit()
    expect(api.createBulk).not.toHaveBeenCalled()
    await component.saveAndProcess('rechunk')
    const patch = api.updateBulk.mock.calls[0][0][0]
    expect(patch).toMatchObject({ id: 'existing', version: 3, parserConfig: { chunkSize: 700, removeSensitive: true } })
    expect(patch).not.toHaveProperty('parent')
    expect(api.startParsing).toHaveBeenCalledWith('existing', 'rechunk')
    expect(ref.close).toHaveBeenCalledWith(true)
    expect(document.parserConfig.textSplitter.chunkSize).toBe(900)
  })

  it('retains the updated version if starting processing fails, so retry does not resubmit a stale version', async () => {
    const { component, api, ref } = await setup(false, {
      id: 'existing',
      type: 'txt',
      version: 3
    } as IKnowledgeDocument)
    api.startParsing.mockReturnValueOnce(throwError(() => new Error('queue unavailable')))
    await component.saveAndProcess('full')
    expect(component.error()).toContain('queue unavailable')
    expect(component.editDocument().version).toBe(4)
    expect(ref.close).not.toHaveBeenCalled()
    await component.saveAndProcess('full')
    expect(api.updateBulk).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'existing', version: 4 })], false)
    expect(ref.close).toHaveBeenCalledWith(true)
  })

  it('allows rechunk with a removed parser but refuses a new parser without a matching snapshot', async () => {
    const document = {
      id: 'existing',
      version: 1,
      type: 'png',
      parserConfig: {
        transformerType: 'removed-parser',
        transformerIntegration: 'old-connection',
        transformer: { mode: 'layout' },
        imageUnderstandingEnabled: false
      }
    } as IKnowledgeDocument
    const { component, api } = await setup(false, document)
    expect(component.ready()).toBe(false)
    expect(component.rechunkReady()).toBe(true)
    await component.saveAndProcess('rechunk')
    expect(api.startParsing).toHaveBeenCalledWith('existing', 'rechunk')
    component.processing.selectParser('png', 'builtin')
    expect(component.rechunkReady()).toBe(false)
  })

  it.each([undefined, 'pdf-visual'])(
    'reopens builtin PDF settings and allows rechunk without treating displayed defaults as edits (%s)',
    async (transformerType) => {
      const document = { id: 'pdf', type: 'pdf', version: 1, parserConfig: { transformerType } } as IKnowledgeDocument
      const { component, api } = await setup(false, document)
      expect(component.processing.pdfProvider().meta.name).toBe('pdf-visual')
      expect(component.processing.pdfParserOptions()).toEqual({ maxPages: 300 })
      expect(component.rechunkReady()).toBe(true)
      component.processing.pdfParserOptions.set({ maxPages: 20 })
      expect(component.rechunkReady()).toBe(false)
      component.processing.selectPdfParser('builtin')
      expect(component.rechunkReady()).toBe(true)
      await component.saveAndProcess('rechunk')
      expect(api.startParsing).toHaveBeenCalledWith('pdf', 'rechunk')
      expect(api.updateBulk.mock.calls[0][0][0].parserConfig.transformerType).toBe(transformerType)
    }
  )

  it('does not start rechunk processing without a reusable conversion snapshot', async () => {
    const { component, api } = await setup(false, { id: 'existing', type: 'txt', version: 3 } as IKnowledgeDocument)
    component.canRechunk.set(false)
    await component.saveAndProcess('rechunk')
    expect(api.updateBulk).not.toHaveBeenCalled()
    expect(api.startParsing).not.toHaveBeenCalled()
  })

  it('keeps pipeline documents on the existing task processing path', async () => {
    const { component, api, kbAPI } = await setup(false, {
      id: 'pipeline-doc',
      version: 3,
      sourceConfig: { type: 'local-file' }
    } as IKnowledgeDocument)
    await component.saveAndProcess('rechunk')
    expect(kbAPI.createTask).toHaveBeenCalledWith(
      'kb',
      expect.objectContaining({
        taskType: 'document_reprocess',
        context: { processingMode: 'rechunk' },
        documents: [expect.objectContaining({ id: 'pipeline-doc' })]
      })
    )
    expect(api.createBulk).not.toHaveBeenCalled()
    expect(api.updateBulk).not.toHaveBeenCalled()
    expect(api.startParsing).not.toHaveBeenCalled()
  })

  it('hides graph settings when graph indexing is not enabled', async () => {
    const { component } = await setup()
    expect(component.sections.some((section) => section.id === 'graph')).toBe(false)
  })

  it('shows graph settings only when explicitly enabled', async () => {
    const { component } = await setup(true)
    expect(component.sections.some((section) => section.id === 'graph')).toBe(true)
  })

  it('loads folder parents and submits the selected destination or root without storing UI keys', async () => {
    const { component, api } = await setup()
    expect(api.getAll).toHaveBeenCalledWith(expect.objectContaining({ relations: ['parent'] }))
    component.selectFolder('child')
    await component.submit()
    expect(api.createBulk).toHaveBeenLastCalledWith([expect.objectContaining({ parent: { id: 'child' } })], true)
    component.selectFolder(IMPORT_ROOT_FOLDER)
    expect(component.parentId()).toBe('')
    await component.submit()
    expect(api.createBulk).toHaveBeenLastCalledWith([expect.objectContaining({ parent: null })], true)
  })

  it('does not block non-PDF imports on a hidden unavailable PDF parser', async () => {
    const { component } = await setup()
    component.processing.selectPdfParser('unavailable-pdf-parser')
    component.externalDocuments.set([{ type: 'pdf' }])
    expect(component.ready()).toBe(false)
    component.externalDocuments.set([{ type: 'txt' }])
    expect(component.configurationError()).toBeNull()
    expect(component.ready()).toBe(true)
  })

  it('imports a PDF with images off by default and no missing-model warning', async () => {
    const { component, api, knowledgebase } = await setup()
    component.externalDocuments.set([{ name: 'report', type: 'pdf', category: KBDocumentCategoryEnum.Text }])
    expect(component.processing.imageUnderstandingEnabled()).toBe(false)
    expect(component.configurationError()).toBeNull()
    expect(component.ready()).toBe(true)
    await component.submit()
    expect(api.createBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ parserConfig: expect.objectContaining({ imageUnderstandingEnabled: false }) })],
      true
    )
    expect(knowledgebase.parserConfig.imageUnderstandingEnabled).toBeUndefined()
  })

  it('checks the model only after image understanding is enabled', async () => {
    const { component, api } = await setup()
    component.processing.imageUnderstandingEnabled.set(true)
    expect(component.ready()).toBe(false)
    expect(component.configurationError()).toContain('MissingVisionModel')
    await component.submit()
    expect(api.createBulk).not.toHaveBeenCalled()
    component.processing.imageUnderstandingEnabled.set(false)
    expect(component.configurationError()).toBeNull()
    expect(component.ready()).toBe(true)
  })

  it('submits the current batch and destination without changing knowledgebase defaults', async () => {
    const { component, api, ref, knowledgebase } = await setup()
    component.processing.chunkSize.set(1000)
    component.parentId.set('other-folder')
    await component.submit()
    expect(api.createBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          knowledgebaseId: 'kb',
          parent: { id: 'other-folder' },
          parserConfig: expect.objectContaining({ chunkSize: 1000, imageUnderstandingEnabled: false })
        })
      ],
      true
    )
    expect(knowledgebase.parserConfig.chunkSize).toBe(512)
    expect(ref.close).toHaveBeenCalledWith(true)
  })

  it('keeps sources and configuration after a failed submission and permits retry', async () => {
    const { component, api, ref } = await setup()
    api.createBulk.mockReturnValueOnce(throwError(() => new Error('failed')))
    await component.submit()
    expect(component.error()).toContain('failed')
    expect(component.documents()).toHaveLength(1)
    expect(component.busy()).toBe(false)
    expect(ref.disableClose).toBe(false)
    expect(ref.close).not.toHaveBeenCalled()
    await component.submit()
    expect(ref.close).toHaveBeenCalledWith(true)
  })

  it('isolates nested defaults and shows the chunk size that the processor will use', async () => {
    const { component, knowledgebase } = await setup()
    const separators = component.processing.splitterOptions().separators
    if (!Array.isArray(separators)) throw new Error('Expected an array of separators')
    separators.push('?')
    component.processing.chunkSize.set(800)
    expect(knowledgebase.parserConfig.textSplitter.separators).toEqual(['\\n', '!'])
    expect(knowledgebase.parserConfig.textSplitter.chunkSize).toBe(512)
    expect(component.chunkSize()).toBe(800)
  })

  it('shares chunk settings while preserving spreadsheet parser settings when sources change', async () => {
    const { component } = await setup()
    component.processing.chunkSize.set(800)
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    expect(component.activeParserConfig()).toMatchObject({ chunkSize: 800 })
    component.sheetParserConfig.set({ spreadsheet: { interpretation: 'form_document' } })
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Text, type: 'txt' }])
    expect(component.activeParserConfig()).toMatchObject({ chunkSize: 800 })
    expect(component.activeParserConfig().spreadsheet).toEqual({ firstRowAsHeader: true })
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    expect(component.activeParserConfig()).toMatchObject({
      chunkSize: 800,
      spreadsheet: { interpretation: 'form_document' }
    })
  })

  it('uses the shared parser, chunk and image forms for spreadsheets', async () => {
    const { component, fixture } = await setup(
      false,
      { id: 'sheet', type: 'xlsx', category: KBDocumentCategoryEnum.Sheet, version: 1 } as IKnowledgeDocument,
      KnowledgeStructureEnum.General,
      true
    )
    expect(fixture.debugElement.query(By.css('xp-knowledge-processing-settings')).properties['section']).toBe('parser')
    component.section.set('chunks')
    fixture.detectChanges()
    const shared = fixture.debugElement.query(By.css('xp-knowledge-processing-settings'))
    expect(shared).not.toBeNull()
    expect(shared.properties['section']).toBe('chunk')
    expect(shared.properties['form']).toBe(component.processing)
    expect(fixture.debugElement.query(By.css('xp-knowledge-document-create-settings'))).toBeNull()
    component.section.set('parser')
    fixture.detectChanges()
    expect(fixture.debugElement.query(By.css('xp-knowledge-processing-settings')).properties['section']).toBe('parser')
    component.section.set('images')
    fixture.detectChanges()
    expect(fixture.debugElement.query(By.css('xp-knowledge-document-create-settings'))).toBeNull()
    expect(fixture.debugElement.query(By.css('xp-knowledge-processing-settings')).properties['section']).toBe('image')
  })

  it('validates the shared image model selection for a spreadsheet-only batch', async () => {
    const { component, api } = await setup()
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    component.processing.imageUnderstandingEnabled.set(true)
    expect(component.configurationError()).toBeTruthy()
    await component.submit()
    expect(api.createBulk).not.toHaveBeenCalled()
    component.processing.visionModel.set({ model: 'vision' })
    expect(component.configurationError()).toBeNull()
  })

  it('saves shared chunk and image settings for a sheet import alongside spreadsheet conversion settings', async () => {
    const { component, api, knowledgebase } = await setup()
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    component.sheetParserConfig.set({
      spreadsheet: { interpretation: 'records', includeSheets: ['Orders'] },
      indexedFields: ['sku'],
      imageUnderstandingEnabled: false
    })
    component.processing.imageUnderstandingEnabled.set(true)
    component.processing.visionModel.set({ model: 'vision' })
    component.processing.imagePromptTemplate.set('Read all table cells')
    component.processing.selectChunkStrategy('auto')
    component.processing.chunkSize.set(800)
    component.processing.chunkOverlap.set(40)
    component.processing.maxChunkTokensControl.setValue(256)
    await component.submit()
    expect(api.createBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          parserConfig: expect.objectContaining({
            textSplitterType: 'auto',
            textSplitter: { chunkSize: 800, chunkOverlap: 40 },
            chunkSize: 800,
            chunkOverlap: 40,
            maxChunkTokens: 256,
            spreadsheet: { interpretation: 'records', includeSheets: ['Orders'], firstRowAsHeader: true },
            indexedFields: ['sku'],
            imageUnderstandingEnabled: true,
            imageUnderstandingModel: { model: 'vision' },
            imageUnderstanding: { promptTemplate: 'Read all table cells' }
          })
        })
      ],
      true
    )
    expect(knowledgebase.parserConfig.chunkSize).toBe(512)
  })

  it('saves and restores shared sheet chunk settings when editing an existing document', async () => {
    const document = {
      id: 'sheet',
      type: 'xlsx',
      category: KBDocumentCategoryEnum.Sheet,
      version: 1,
      parserConfig: {
        textSplitterType: 'auto',
        textSplitter: { chunkSize: 900, chunkOverlap: 50 },
        indexedFields: ['sku'],
        spreadsheet: { interpretation: 'records' }
      }
    } as IKnowledgeDocument
    const { component, api } = await setup(false, document)
    expect(component.processing.chunkSize()).toBe(900)
    component.processing.selectChunkStrategy('structure-aware')
    component.processing.chunkSize.set(700)
    component.processing.maxChunkTokensControl.setValue(128)
    await component.saveAndProcess('full')
    const saved = api.updateBulk.mock.calls[0][0][0].parserConfig
    expect(saved).toMatchObject({
      textSplitterType: 'structure-aware',
      chunkSize: 700,
      maxChunkTokens: 128,
      textSplitter: { chunkSize: 700, chunkOverlap: 50 },
      indexedFields: ['sku'],
      spreadsheet: { interpretation: 'records' }
    })
    expect(api.startParsing).toHaveBeenCalledWith('sheet', 'full')
    TestBed.resetTestingModule()
    const reopened = await setup(false, { ...document, parserConfig: saved })
    expect(reopened.component.processing.chunkStrategy()).toBe('structure-aware')
    expect(reopened.component.processing.chunkSize()).toBe(700)
    expect(reopened.component.processing.maxChunkTokens()).toBe(128)
  })

  it('blocks invalid shared chunk parameters for sheets before submitting', async () => {
    const { component, api } = await setup()
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    component.processing.maxChunkTokensControl.setValue(-1)
    expect(component.configurationError()).toContain('InvalidTokenLimit')
    await component.submit()
    expect(api.createBulk).not.toHaveBeenCalled()
    component.processing.maxChunkTokensControl.setValue(0)
    component.processing.chunkOverlap.set(512)
    expect(component.configurationError()).toContain('InvalidLimits')
    component.processing.chunkOverlap.set(80)
    expect(component.ready()).toBe(true)
  })

  it('preserves explicit false headers while saving metadata requirements with sheet conversion settings', async () => {
    const document = {
      id: 'sheet',
      type: 'xlsx',
      category: KBDocumentCategoryEnum.Sheet,
      version: 1,
      parserConfig: {
        spreadsheet: { firstRowAsHeader: false, includeSheets: ['Orders'] },
        tableMetadataRequirements: 'Explain business column meanings'
      }
    } as IKnowledgeDocument
    const { component, api } = await setup(false, document)
    expect(component.processing.firstRowAsHeader()).toBe(false)
    expect(component.processing.tableMetadataRequirements()).toBe('Explain business column meanings')
    expect(document.parserConfig.spreadsheet.interpretation).toBeUndefined()
    component.processing.tableMetadataRequirementsControl.setValue('')
    await component.saveAndProcess('full')
    expect(api.updateBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          parserConfig: expect.objectContaining({
            spreadsheet: { interpretation: 'records', firstRowAsHeader: false, includeSheets: ['Orders'] },
            tableMetadataRequirements: ''
          })
        })
      ],
      false
    )
    expect(document.parserConfig.tableMetadataRequirements).toBe('Explain business column meanings')
  })

  it('uses shared header controls without losing spreadsheet selection and blocks long requirements', async () => {
    const { component, api } = await setup()
    component.externalDocuments.set([{ type: 'xlsx', category: KBDocumentCategoryEnum.Sheet }])
    component.sheetParserConfig.set({ spreadsheet: { includeSheets: ['Orders'] } })
    component.processing.firstRowAsHeader.set(false)
    expect(component.processing.firstRowAsHeader()).toBe(false)
    expect(component.activeParserConfig().spreadsheet).toEqual({
      interpretation: 'records',
      firstRowAsHeader: false,
      includeSheets: ['Orders']
    })
    component.processing.tableMetadataRequirementsControl.setValue('x'.repeat(4001))
    expect(component.configurationError()).toBe('XP.Knowledgebase.TableMetadata.InvalidRequirements')
    await component.submit()
    expect(api.createBulk).not.toHaveBeenCalled()
  })

  it.each([
    { header: true, fields: ['sku'], expected: ['A'] },
    { header: false, fields: ['B'], expected: ['price'] },
    { header: true, fields: ['B'], expected: ['A'], firstKey: 'B' }
  ])(
    'preserves the selected physical columns when changing headers: $header $fields',
    async ({ header, fields, expected, firstKey }) => {
      const document = {
        id: 'sheet',
        type: 'xlsx',
        category: KBDocumentCategoryEnum.Sheet,
        version: 1,
        filePath: '/sample.xlsx',
        parserConfig: { indexedFields: fields, spreadsheet: { firstRowAsHeader: header, includeSheets: ['Orders'] } }
      } as IKnowledgeDocument
      const { component, api } = await setup(false, document)
      api.estimateTable.mockImplementation((input) =>
        of({
          tables: [
            {
              tableId: 'sheet:0',
              sheetName: 'Orders',
              range: 'A1:B3',
              rowCount: 2,
              columns: (input.parserConfig?.spreadsheet?.firstRowAsHeader === false
                ? ['A', 'B']
                : [firstKey ?? 'sku', 'price']
              ).map((key, index) => ({ columnId: index === 0 ? 'A' : 'B', key, label: key, column: index + 1 }))
            }
          ],
          chunks: []
        })
      )
      component.processing.firstRowAsHeader.set(!header)
      // Saving succeeded but enqueueing failed: retry must use the remapped fields and updated version.
      api.startParsing.mockReturnValueOnce(throwError(() => new Error('Queue unavailable')))
      await component.saveAndProcess('full')
      expect(api.updateBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            parserConfig: expect.objectContaining({
              indexedFields: expected,
              spreadsheet: expect.objectContaining({ firstRowAsHeader: !header, includeSheets: ['Orders'] })
            })
          })
        ],
        false
      )
      await component.saveAndProcess('full')
      expect(api.updateBulk.mock.calls[1][0][0]).toMatchObject({
        version: 2,
        parserConfig: { indexedFields: expected }
      })
      expect(api.estimateTable.mock.calls.every(([input]) => input.parserConfig.indexedFields === undefined)).toBe(true)
      expect(document.parserConfig.indexedFields).toEqual(fields)
    }
  )

  it('checks configured columns before saving and returns to the parser when a header becomes invalid', async () => {
    const { component, api } = await setup(false, {
      id: 'sheet',
      type: 'xlsx',
      category: KBDocumentCategoryEnum.Sheet,
      version: 1,
      filePath: '/sample.xlsx',
      parserConfig: { indexedFields: ['old-header'] }
    } as IKnowledgeDocument)
    api.estimateTable.mockReturnValue(
      of({
        tables: [
          {
            tableId: 'table',
            sheetName: 'Orders',
            range: 'A1:A2',
            rowCount: 1,
            columns: [{ columnId: 'A', key: 'A', label: 'A', column: 1 }]
          }
        ],
        chunks: []
      })
    )
    component.processing.firstRowAsHeader.set(false)
    component.section.set('table')
    await component.saveAndProcess('full')
    expect(api.updateBulk).not.toHaveBeenCalled()
    expect(api.startParsing).not.toHaveBeenCalled()
    expect(component.section()).toBe('parser')
    expect(component.error()).toContain('old-header')
  })

  it('preserves each source document index selection across mixed import and submission', async () => {
    const { component, api } = await setup()
    component.externalDocuments.set([
      {
        type: 'xlsx',
        category: KBDocumentCategoryEnum.Sheet,
        storageFileId: 'orders',
        name: 'Orders',
        parserConfig: { indexedFields: ['sku'] }
      },
      { type: 'txt', category: KBDocumentCategoryEnum.Text },
      {
        type: 'csv',
        category: KBDocumentCategoryEnum.Sheet,
        storageFileId: 'prices',
        name: 'Prices',
        parserConfig: { indexedFields: ['price'] }
      }
    ])
    api.estimateTable.mockReturnValue(
      of({
        tables: [
          {
            tableId: 'table',
            sheetName: 'Sheet',
            range: 'A1:B2',
            rowCount: 1,
            columns: [
              { columnId: 'A', key: 'sku', label: 'sku', column: 1 },
              { columnId: 'B', key: 'price', label: 'price', column: 2 }
            ]
          }
        ],
        chunks: []
      })
    )
    expect(component.documentsWithParserConfig()[0].parserConfig.indexedFields).toEqual(['sku'])
    expect(component.documentsWithParserConfig()[2].parserConfig.indexedFields).toEqual(['price'])
    await component.submit()
    const submitted = api.createBulk.mock.calls[0][0]
    expect(submitted[0].parserConfig.indexedFields).toEqual(['sku'])
    expect(submitted[2].parserConfig.indexedFields).toEqual(['price'])
  })

  it('remaps Excel fields during mixed import without changing the CSV selection', async () => {
    const { component, api } = await setup()
    component.externalDocuments.set([
      {
        type: 'xlsx',
        category: KBDocumentCategoryEnum.Sheet,
        storageFileId: 'orders',
        parserConfig: { indexedFields: ['sku'] }
      },
      {
        type: 'csv',
        category: KBDocumentCategoryEnum.Sheet,
        storageFileId: 'prices',
        parserConfig: { indexedFields: ['price'] }
      }
    ])
    api.estimateTable.mockImplementation((document) =>
      of({
        tables: [
          {
            tableId: 'sheet:0',
            sheetName: 'Orders',
            range: 'A1:B3',
            rowCount: 2,
            columns: (document.type === 'xlsx' && document.parserConfig?.spreadsheet?.firstRowAsHeader === false
              ? ['A', 'B']
              : ['sku', 'price']
            ).map((key, index) => ({ columnId: index === 0 ? 'A' : 'B', key, label: key, column: index + 1 }))
          }
        ],
        chunks: []
      })
    )
    component.processing.firstRowAsHeader.set(false)
    await component.submit()
    expect(api.createBulk.mock.calls[0][0].map((document) => document.parserConfig.indexedFields)).toEqual([
      ['A'],
      ['price']
    ])
    expect(component.externalDocuments()[0].parserConfig.indexedFields).toEqual(['sku'])
  })

  it('prevents duplicate submit while a request is pending', async () => {
    const { component, api, ref } = await setup()
    const result = new Subject<IKnowledgeDocument[]>()
    api.createBulk.mockReturnValue(result)
    const first = component.submit()
    await component.submit()
    expect(api.createBulk).toHaveBeenCalledTimes(1)
    expect(ref.disableClose).toBe(true)
    result.next([])
    await first
  })

  it('does not create documents merely by opening or cancelling', async () => {
    const { component, api, ref } = await setup()
    component.dialogRef.close()
    expect(api.createBulk).not.toHaveBeenCalled()
    expect(ref.close).toHaveBeenCalledWith()
    expect(api.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { knowledgebaseId: 'kb', sourceType: 'folder' } })
    )
  })
})
