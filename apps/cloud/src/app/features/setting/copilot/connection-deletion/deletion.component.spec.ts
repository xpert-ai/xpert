import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { CONNECTION_REFERENCE_KINDS, ConnectionDeletionImpact } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { CopilotServerService } from '../../../../@core'
import { ConnectionDeletionDialogComponent } from './deletion.component'

describe('connection deletion confirmation', () => {
  const impact: ConnectionDeletionImpact = {
    enabled: false,
    canDelete: true,
    references: Object.fromEntries(
      CONNECTION_REFERENCE_KINDS.map((kind) => [kind, 0])
    ) as ConnectionDeletionImpact['references']
  }
  function setup() {
    const server = {
      getConnectionDeletionImpact: jest.fn().mockReturnValue(of(impact)),
      deleteConnection: jest.fn().mockReturnValue(of(undefined))
    }
    const dialog = { close: jest.fn(), disableClose: false }
    TestBed.configureTestingModule({
      imports: [ConnectionDeletionDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { id: 'disabled', name: 'Test connection', enabled: false } },
        { provide: DialogRef, useValue: dialog },
        { provide: CopilotServerService, useValue: server }
      ]
    })
    const fixture = TestBed.createComponent(ConnectionDeletionDialogComponent)
    return { fixture, component: fixture.componentInstance, server, dialog }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('renders the exact connection and only deletes after confirmation', async () => {
    const { fixture, component, server, dialog } = setup()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Test connection')
    expect(server.deleteConnection).not.toHaveBeenCalled()
    await component.remove()
    expect(server.deleteConnection).toHaveBeenCalledWith('disabled')
    expect(dialog.close).toHaveBeenCalledWith(true)
  })
  it('cancels without mutating the connection', async () => {
    const { fixture, server, dialog } = setup()
    await fixture.whenStable()
    fixture.detectChanges()
    fixture.nativeElement.querySelector('footer button').click()
    expect(dialog.close).toHaveBeenCalledWith()
    expect(server.deleteConnection).not.toHaveBeenCalled()
  })
  it('blocks deletion when dependency loading fails and permits retry', async () => {
    const { component, server } = setup()
    server.getConnectionDeletionImpact.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    await component.load()
    await component.remove()
    expect(component.impact()).toBeNull()
    expect(component.error()).toBeTruthy()
    expect(server.deleteConnection).not.toHaveBeenCalled()
    await component.load()
    expect(component.impact()?.canDelete).toBe(true)
  })
  it('shows current references and refuses deletion', async () => {
    const { component, fixture, server } = setup()
    server.getConnectionDeletionImpact.mockReturnValue(
      of({ ...impact, canDelete: false, references: { ...impact.references, assistants: 2 } })
    )
    await component.load()
    fixture.detectChanges()
    expect(component.references()).toEqual([{ kind: 'assistants', count: 2 }])
    expect(fixture.nativeElement.querySelector('dl').textContent).toContain('2')
    await component.remove()
    expect(server.deleteConnection).not.toHaveBeenCalled()
  })
  it('refreshes references on a delete conflict and leaves the dialog open', async () => {
    const { component, server, dialog } = setup()
    await component.load()
    server.deleteConnection.mockReturnValue(throwError(() => new Error('New reference')))
    server.getConnectionDeletionImpact.mockReturnValue(
      of({ ...impact, canDelete: false, references: { ...impact.references, knowledgebases: 1 } })
    )
    await component.remove()
    expect(dialog.close).not.toHaveBeenCalled()
    expect(component.impact()?.canDelete).toBe(false)
    expect(component.error()).toBeTruthy()
    expect(dialog.disableClose).toBe(false)
  })
  it('prevents duplicate submissions and closing during deletion', async () => {
    const { component, server, dialog } = setup()
    await component.load()
    const response = new Subject<void>()
    server.deleteConnection.mockReturnValue(response)
    const pending = component.remove()
    await component.remove()
    expect(dialog.disableClose).toBe(true)
    expect(server.deleteConnection).toHaveBeenCalledTimes(1)
    response.next()
    response.complete()
    await pending
    expect(dialog.close).toHaveBeenCalledWith(true)
  })
})
