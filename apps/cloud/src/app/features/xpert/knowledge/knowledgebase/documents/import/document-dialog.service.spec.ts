jest.mock('./import-dialog.component', () => ({ DocumentImportDialogComponent: class {} }))

import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import {
  KnowledgebaseService,
  KnowledgebaseStatusEnum,
  KnowledgeDocumentService,
  ToastrService
} from '@cloud/app/@core'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import { KnowledgeDocumentDialogService } from './document-dialog.service'
import { DocumentImportDialogComponent } from './import-dialog.component'

describe('document dialog entry points', () => {
  const document = { id: 'doc', version: 7, knowledgebaseId: 'kb', parserConfig: { chunkSize: 900 } }
  function setup() {
    const api = { getOneById: jest.fn(() => of(document)) }
    const currentKnowledgebase = {
      id: 'kb',
      parserConfig: { chunkSize: 700 },
      visionModel: { id: 'vision-1', model: 'vision' },
      pipeline: { id: 'pipeline-1', version: '2' },
      status: KnowledgebaseStatusEnum.READY
    }
    const kbAPI = {
      getDetail: jest.fn(() => of(currentKnowledgebase)),
      getOneById: jest.fn(() => throwError(() => new Error('unsafe knowledgebase relations')))
    }
    const dialog = { open: jest.fn(() => ({ closed: of(true) })) }
    const toastr = { error: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgeDocumentService, useValue: api },
        { provide: KnowledgebaseService, useValue: kbAPI },
        { provide: Dialog, useValue: dialog },
        { provide: ToastrService, useValue: toastr },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    return { api, kbAPI, currentKnowledgebase, dialog, toastr, service: TestBed.inject(KnowledgeDocumentDialogService) }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('loads the document without nested relations and gets model and pipeline settings through the detail projection', async () => {
    const { service, dialog, api, kbAPI, currentKnowledgebase } = setup()
    expect(await service.edit('doc', () => false)).toBe(true)
    expect(api.getOneById).toHaveBeenCalledWith('doc')
    expect(kbAPI.getDetail).toHaveBeenCalledWith('kb')
    expect(kbAPI.getOneById).not.toHaveBeenCalled()
    expect(dialog.open).toHaveBeenCalledWith(
      DocumentImportDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ editDocument: document, knowledgebase: currentKnowledgebase }),
        panelClass: 'xp-overlay-pane-dialog',
        backdropClass: 'backdrop-blur-xs-black'
      })
    )
  })

  it('honors the write lock and suppresses duplicate clicks while loading', async () => {
    const { service, api, dialog } = setup()
    expect(await service.edit('doc', () => true)).toBe(false)
    expect(api.getOneById).not.toHaveBeenCalled()
    const response = new Subject<typeof document>()
    api.getOneById.mockReturnValue(response)
    const first = service.edit('doc', () => false)
    expect(await service.edit('doc', () => false)).toBe(false)
    response.next(document)
    await first
    expect(dialog.open).toHaveBeenCalledTimes(1)
  })

  it('reports loading failures without opening an empty editor', async () => {
    const { service, api, dialog, toastr } = setup()
    api.getOneById.mockReturnValue(throwError(() => new Error('load failed')))
    expect(await service.edit('doc', () => false)).toBe(false)
    expect(dialog.open).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalled()
  })

  it('loads current knowledgebase defaults, preserves the destination folder and returns cancellation', async () => {
    const { service, dialog, kbAPI, currentKnowledgebase } = setup()
    dialog.open.mockReturnValue({ closed: of(false) })
    expect(await service.importDocuments({ id: 'kb' }, 'folder', () => false)).toBe(false)
    expect(kbAPI.getDetail).toHaveBeenCalledWith('kb')
    expect(kbAPI.getOneById).not.toHaveBeenCalled()
    expect(dialog.open).toHaveBeenCalledWith(
      DocumentImportDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'folder', knowledgebase: currentKnowledgebase })
      })
    )
  })

  it('does not open the editor when knowledgebase access is denied and allows a later retry', async () => {
    const { service, dialog, kbAPI, toastr } = setup()
    kbAPI.getDetail.mockReturnValueOnce(throwError(() => new Error('access denied')))
    expect(await service.edit('doc', () => false)).toBe(false)
    expect(dialog.open).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalledTimes(1)
    expect(await service.edit('doc', () => false)).toBe(true)
    expect(dialog.open).toHaveBeenCalledTimes(1)
  })

  it('honors a newly loaded rebuilding status in both edit and import entry points', async () => {
    const { service, dialog, currentKnowledgebase } = setup()
    currentKnowledgebase.status = KnowledgebaseStatusEnum.REBUILDING
    expect(await service.edit('doc', () => false)).toBe(false)
    expect(await service.importDocuments({ id: 'kb' }, null, () => false)).toBe(false)
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('checks the write lock again after loading knowledgebase details', async () => {
    const { service, kbAPI, currentKnowledgebase, dialog } = setup()
    const response = new Subject<typeof currentKnowledgebase>()
    kbAPI.getDetail.mockReturnValue(response)
    let locked = false
    const result = service.edit('doc', () => locked)
    await Promise.resolve()
    expect(kbAPI.getDetail).toHaveBeenCalledWith('kb')
    locked = true
    response.next(currentKnowledgebase)
    expect(await result).toBe(false)
    expect(dialog.open).not.toHaveBeenCalled()
  })
})
