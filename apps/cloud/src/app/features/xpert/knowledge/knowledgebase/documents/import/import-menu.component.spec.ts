jest.mock('./import-dialog.component', () => ({ DocumentImportDialogComponent: class {} }))
jest.mock('./source-dialog.component', () => ({ DocumentImportSourceDialogComponent: class {} }))

import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { DocumentImportMenuComponent } from './import-menu.component'
import { DocumentImportDialogComponent } from './import-dialog.component'
import { DocumentImportSourceDialogComponent } from './source-dialog.component'

describe('DocumentImportMenuComponent', () => {
  function setup() {
    const dialog = { open: jest.fn(() => ({ closed: of(true) })) }
    TestBed.configureTestingModule({
      providers: [
        { provide: Dialog, useValue: dialog },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    TestBed.overrideComponent(DocumentImportMenuComponent, { set: { imports: [], template: '' } })
    const fixture = TestBed.createComponent(DocumentImportMenuComponent)
    fixture.componentRef.setInput('knowledgebase', { id: 'kb' })
    fixture.componentRef.setInput('parentId', 'folder')
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance, dialog }
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
})
