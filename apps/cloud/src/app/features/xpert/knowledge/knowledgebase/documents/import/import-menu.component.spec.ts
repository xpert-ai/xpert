jest.mock('./import-dialog.component', () => ({ DocumentImportDialogComponent: class {} }))
jest.mock('./source-dialog.component', () => ({ DocumentImportSourceDialogComponent: class {} }))
jest.mock('../pipeline/pipeline.component', () => ({ KnowledgeDocumentPipelineComponent: class {} }))

import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { Observable, of, Subject, takeWhile } from 'rxjs'
import { IKnowledgebaseTask, KnowledgebaseService, ToastrService } from '@cloud/app/@core'
import { DocumentImportMenuComponent } from './import-menu.component'
import { DocumentImportDialogComponent } from './import-dialog.component'
import { DocumentImportSourceDialogComponent } from './source-dialog.component'

describe('DocumentImportMenuComponent', () => {
  function setup() {
    const dialog = { open: jest.fn((): { closed: Observable<unknown> } => ({ closed: of(true) })) }
    const tasks = new Subject<IKnowledgebaseTask>()
    const api = { pollTaskStatus: jest.fn(() => tasks.pipe(takeWhile((task) => task.status === 'running', true))) }
    const toastr = { error: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: Dialog, useValue: dialog },
        { provide: KnowledgebaseService, useValue: api },
        { provide: ToastrService, useValue: toastr },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    TestBed.overrideComponent(DocumentImportMenuComponent, { set: { imports: [], template: '' } })
    const fixture = TestBed.createComponent(DocumentImportMenuComponent)
    fixture.componentRef.setInput('knowledgebase', { id: 'kb' })
    fixture.componentRef.setInput('parentId', 'folder')
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance, dialog, api, tasks, toastr }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('opens a document dialog with the current scope and refreshes after success', async () => {
    const { component, dialog } = setup()
    const refresh = jest.fn()
    component.imported.subscribe(refresh)
    await component.open('files')
    expect(dialog.open).toHaveBeenCalledWith(
      DocumentImportDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ knowledgebase: { id: 'kb' }, parentId: 'folder' }),
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      })
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps unavailable entries visible without invoking an API or dialog', async () => {
    const { component, dialog } = setup()
    expect(component.sources).toHaveLength(7)
    await component.open('folder')
    await component.open('online')
    await component.open('pipeline')
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('honors the knowledgebase write lock', async () => {
    const { component, fixture, dialog } = setup()
    fixture.componentRef.setInput('locked', true)
    await component.open('files')
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('stops after cancelling source selection', async () => {
    const { component, dialog } = setup()
    dialog.open.mockReturnValue({ closed: of(undefined) })
    await component.open('url')
    expect(dialog.open).toHaveBeenCalledTimes(1)
    expect(dialog.open).toHaveBeenCalledWith(
      DocumentImportSourceDialogComponent,
      expect.objectContaining({ data: 'url' })
    )
  })

  it.each(['success', 'failed'] as const)(
    'refreshes a submitted pipeline until its %s result, even before documents exist',
    async (status) => {
      const { component, fixture, dialog, api, tasks } = setup()
      fixture.componentRef.setInput('hasPipeline', true)
      dialog.open.mockReturnValue({ closed: of({ taskId: 'task' }) })
      const refresh = jest.fn()
      component.imported.subscribe(refresh)
      await component.open('pipeline')
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(api.pollTaskStatus).toHaveBeenCalledWith('kb', 'task')
      tasks.next({ id: 'task', status: 'running', documents: [] } as IKnowledgebaseTask)
      tasks.next({ id: 'task', status } as IKnowledgebaseTask)
      expect(refresh).toHaveBeenCalledTimes(3)
      expect(tasks.observed).toBe(false)
    }
  )

  it('releases task polling when the document page is destroyed', async () => {
    const { component, fixture, dialog, tasks } = setup()
    fixture.componentRef.setInput('hasPipeline', true)
    dialog.open.mockReturnValue({ closed: of({ taskId: 'task' }) })
    await component.open('pipeline')
    expect(tasks.observed).toBe(true)
    fixture.destroy()
    expect(tasks.observed).toBe(false)
  })

  it('does not track a cancelled pipeline dialog', async () => {
    const { component, fixture, dialog, api } = setup()
    fixture.componentRef.setInput('hasPipeline', true)
    dialog.open.mockReturnValue({ closed: of(undefined) })
    await component.open('pipeline')
    expect(api.pollTaskStatus).not.toHaveBeenCalled()
  })

  it('refreshes once more and reports a polling error', async () => {
    const { component, fixture, dialog, tasks, toastr } = setup()
    fixture.componentRef.setInput('hasPipeline', true)
    dialog.open.mockReturnValue({ closed: of({ taskId: 'task' }) })
    const refresh = jest.fn()
    component.imported.subscribe(refresh)
    await component.open('pipeline')
    tasks.error(new Error('Task request failed'))
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(toastr.error).toHaveBeenCalledWith('Task request failed')
  })
})
