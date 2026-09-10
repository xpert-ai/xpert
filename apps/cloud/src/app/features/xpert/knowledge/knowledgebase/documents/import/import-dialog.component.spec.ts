jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))
jest.mock('../create/settings/settings.component', () => ({ KnowledgeDocumentCreateSettingsComponent: class {} }))
jest.mock('../pipeline/settings/settings.component', () => ({ KnowledgeDocumentPipelineSettingsComponent: class {} }))

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import {
  IKnowledgeDocument,
  KBDocumentCategoryEnum,
  KnowledgeStructureEnum,
  KnowledgebaseService,
  KnowledgeDocumentService
} from '@cloud/app/@core'
import { DocumentImportDialogComponent } from './import-dialog.component'
import { IMPORT_ROOT_FOLDER } from './import-folder-tree'

describe('DocumentImportDialogComponent', () => {
  async function setup(
    graphEnabled = false,
    editDocument?: IKnowledgeDocument,
    structure = KnowledgeStructureEnum.General
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
      getAll: jest.fn(() => of({ items: [] })),
      createBulk: jest.fn(() => of([])),
      updateBulk: jest.fn((_documents: Partial<IKnowledgeDocument>[], _process: boolean) => of(undefined)),
      startParsing: jest.fn(() => of([])),
      getReprocessCapabilities: jest.fn(() => of({ rechunk: { available: true } }))
    }
    const ref = { close: jest.fn(), disableClose: false }
    const kbAPI = {
      getTextSplitterStrategies: () =>
        of([
          { name: 'recursive-character', structure: KnowledgeStructureEnum.General },
          { name: 'parent-child', structure: KnowledgeStructureEnum.ParentChild }
        ]),
      getDocumentTransformerStrategies: () => of([]),
      createTask: jest.fn(() => of({}))
    }
    TestBed.configureTestingModule({
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
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        {
          provide: KnowledgebaseService,
          useValue: kbAPI
        }
      ]
    })
    TestBed.overrideComponent(DocumentImportDialogComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(DocumentImportDialogComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, component: fixture.componentInstance, api, ref, knowledgebase, kbAPI }
  }

  afterEach(() => TestBed.resetTestingModule())

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

  it('keeps spreadsheet and text batch settings separate when sources change', async () => {
    const { component } = await setup()
    component.processing.chunkSize.set(800)
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    expect(component.activeParserConfig()).toEqual({})
    component.sheetParserConfig.set({ spreadsheet: { interpretation: 'form_document' } })
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Text, type: 'txt' }])
    expect(component.activeParserConfig()).toMatchObject({ chunkSize: 800 })
    component.externalDocuments.set([{ category: KBDocumentCategoryEnum.Sheet, type: 'xlsx' }])
    expect(component.activeParserConfig()).toEqual({ spreadsheet: { interpretation: 'form_document' } })
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
