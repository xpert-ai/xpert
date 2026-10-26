import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IXpertProject, TXpertProjectAccessSummary } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { ToastrService } from '../../@core'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectDeleteComponent } from './project-delete.component'
import { XpertProjectFacade } from './project.facade'

describe('XpertProjectDeleteComponent', () => {
  const project = signal<IXpertProject | null>(null)
  const projectAccess = signal<TXpertProjectAccessSummary | null>(null)
  const api = { deleteProject: jest.fn() }
  const dialog = { open: jest.fn() }
  const router = { navigate: jest.fn() }
  const toastr = { success: jest.fn(), error: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    project.set({ id: 'project-1', name: 'My project' })
    projectAccess.set({
      role: 'owner',
      capabilities: { canRead: true, canEdit: true, canManage: true, canUse: true }
    })
    dialog.open.mockReturnValue({ closed: of(true) })
    api.deleteProject.mockReturnValue(of(undefined))
    router.navigate.mockResolvedValue(true)
    TestBed.configureTestingModule({
      imports: [XpertProjectDeleteComponent, TranslateModule.forRoot()],
      providers: [
        { provide: XpertProjectFacade, useValue: { project, projectAccess } },
        { provide: XpertProjectApiService, useValue: api },
        { provide: Dialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: ToastrService, useValue: toastr }
      ]
    })
  })

  it('shows the owner a deletion action and returns to projects after confirmation', async () => {
    const fixture = TestBed.createComponent(XpertProjectDeleteComponent)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull()
    await fixture.componentInstance.deleteProject()
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ value: 'My project' })
      })
    )
    expect(api.deleteProject).toHaveBeenCalledWith('project-1')
    expect(router.navigate).toHaveBeenCalledWith(['/project'])
    expect(toastr.success).toHaveBeenCalled()
    expect(fixture.componentInstance.pending()).toBe(false)
  })

  it.each([false, undefined])('does nothing when confirmation closes with %s', async (result) => {
    dialog.open.mockReturnValue({ closed: of(result) })
    const component = TestBed.createComponent(XpertProjectDeleteComponent).componentInstance
    await component.deleteProject()
    expect(api.deleteProject).not.toHaveBeenCalled()
    expect(toastr.error).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(component.pending()).toBe(false)
  })

  it('hides deletion and rejects direct calls for a manager who is not the owner', async () => {
    projectAccess.update((access) => ({ ...access!, role: 'manager' }))
    const fixture = TestBed.createComponent(XpertProjectDeleteComponent)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('button')).toBeNull()
    await fixture.componentInstance.deleteProject()
    expect(dialog.open).not.toHaveBeenCalled()
    expect(api.deleteProject).not.toHaveBeenCalled()
  })

  it('guides entity-managed projects to the application without calling delete', async () => {
    project.set({
      id: 'project-1',
      projectTypeSnapshot: {
        applicationTitle: 'Business app',
        title: 'Business project',
        binding: { kind: 'entity', providerKey: 'business' }
      }
    })
    const fixture = TestBed.createComponent(XpertProjectDeleteComponent)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('button')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('XP.XProject.DeleteInApplication')
    await fixture.componentInstance.deleteProject()
    expect(api.deleteProject).not.toHaveBeenCalled()
  })

  it('allows retry after a server rejection and stays on the project', async () => {
    api.deleteProject.mockReturnValue(throwError(() => new Error('Access denied')))
    const component = TestBed.createComponent(XpertProjectDeleteComponent).componentInstance
    await component.deleteProject()
    expect(toastr.error).toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(component.pending()).toBe(false)
    api.deleteProject.mockReturnValue(of(undefined))
    await component.deleteProject()
    expect(api.deleteProject).toHaveBeenCalledTimes(2)
  })

  it('prevents duplicate dialogs and requests while deletion is pending', async () => {
    const deletion = new Subject<void>()
    let notifyStarted = () => {}
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    api.deleteProject.mockImplementationOnce(() => {
      notifyStarted()
      return deletion
    })
    const fixture = TestBed.createComponent(XpertProjectDeleteComponent)
    const first = fixture.componentInstance.deleteProject()
    await fixture.componentInstance.deleteProject()
    expect(dialog.open).toHaveBeenCalledTimes(1)
    await started
    await fixture.componentInstance.deleteProject()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true)
    expect(dialog.open).toHaveBeenCalledTimes(1)
    expect(api.deleteProject).toHaveBeenCalledTimes(1)
    deletion.next()
    deletion.complete()
    await first
    expect(fixture.componentInstance.pending()).toBe(false)
  })

  it('does not delete when project context changes during confirmation', async () => {
    const confirmation = new Subject<boolean>()
    dialog.open.mockReturnValue({ closed: confirmation })
    const component = TestBed.createComponent(XpertProjectDeleteComponent).componentInstance
    const deletion = component.deleteProject()
    project.set({ id: 'project-2' })
    confirmation.next(true)
    confirmation.complete()
    await deletion
    expect(api.deleteProject).not.toHaveBeenCalled()
  })
})
