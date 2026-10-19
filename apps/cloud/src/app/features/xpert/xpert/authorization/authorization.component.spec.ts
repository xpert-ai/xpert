import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { AssistantSharingState } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { injectOrganizationId } from '@cloud/app/@core/state'
import { injectToastr, injectXpertAPI } from 'apps/cloud/src/app/@core'
import { XpertComponent } from '../xpert.component'
import { XpertAuthorizationComponent } from './authorization.component'

jest.mock('@cloud/app/@core/state', () => ({ injectOrganizationId: jest.fn() }))
jest.mock('apps/cloud/src/app/@core', () => ({
  injectToastr: jest.fn(),
  injectXpertAPI: jest.fn(),
  getErrorMessage: (error: Error) => error.message
}))
jest.mock('../xpert.component', () => ({ XpertComponent: class XpertComponent {} }))
jest.mock('apps/cloud/src/app/@shared/user', () =>
  jest.requireActual('apps/cloud/src/app/@shared/user/avatar/avatar.component')
)

const state = (groups = false, manage = true): AssistantSharingState => ({
  capabilities: { canViewAccess: true, canManageAccess: manage, canUseGroups: groups, canManageGroups: false },
  organization: { id: 'org', name: 'Organization' },
  users: [{ id: 'user', email: 'user@example.test' }],
  groups: groups ? [{ id: 'group', name: 'Group' }] : [],
  groupRevision: 'revision',
  inherited: {}
})
describe('Assistant sharing permission and UI boundaries', () => {
  let fixture: ComponentFixture<XpertAuthorizationComponent>, component: XpertAuthorizationComponent
  const organization = signal('org'),
    id = signal('assistant')
  const api = {
    getSharing: jest.fn(),
    getShareCandidates: jest.fn(),
    getShareGroupCandidates: jest.fn(),
    shareUsers: jest.fn(),
    revokeShare: jest.fn(),
    saveShareGroups: jest.fn()
  }
  const toastr = { success: jest.fn(), error: jest.fn() }
  beforeEach(async () => {
    jest.clearAllMocks()
    id.set('assistant')
    organization.set('org')
    jest.mocked(injectOrganizationId).mockReturnValue(organization)
    jest.mocked(injectXpertAPI).mockReturnValue(api as unknown as ReturnType<typeof injectXpertAPI>)
    jest.mocked(injectToastr).mockReturnValue(toastr as unknown as ReturnType<typeof injectToastr>)
    api.getSharing.mockReturnValue(of(state()))
    api.getShareCandidates.mockReturnValue(of({ items: [{ id: 'new', email: 'new@example.test' }], total: 1 }))
    api.getShareGroupCandidates.mockReturnValue(of({ items: [{ id: 'group', name: 'Group' }], total: 1 }))
    api.shareUsers.mockReturnValue(of({ ...state(), users: [{ id: 'new', email: 'new@example.test' }] }))
    api.revokeShare.mockReturnValue(of({ ...state(), users: [] }))
    api.saveShareGroups.mockReturnValue(of(state(true)))
    await TestBed.configureTestingModule({
      imports: [XpertAuthorizationComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: XpertComponent, useValue: { xpertId: id, xpert: signal({ id: 'assistant', name: 'ClawXpert' }) } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(XpertAuthorizationComponent)
    component = fixture.componentInstance
  })
  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  it('hides the group tab and never fetches groups without permission; personal sharing still works', async () => {
    await settle()
    expect(fixture.nativeElement.querySelector('nav').textContent).not.toContain('XP.Sharing.Groups')
    expect(fixture.nativeElement.querySelector('nav').textContent).toContain('XP.Sharing.Personal')
    component.showPanel('groups')
    expect(component.panel()).toBe('users')
    expect(api.getShareGroupCandidates).not.toHaveBeenCalled()
    const shareButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[z-button][type="button"]')
    expect(shareButton.disabled).toBe(true)
    component.selectUsers(['new', 'foreign'])
    await settle()
    expect(shareButton.disabled).toBe(false)
    shareButton.click()
    await settle()
    expect(api.shareUsers).toHaveBeenCalledWith('assistant', ['new'])
    expect(component.state().users.map((user) => user.id)).toEqual(['new'])
    expect(shareButton.disabled).toBe(true)
  })
  it('shows group authorization but not group management for a viewer with resource management', async () => {
    api.getSharing.mockReturnValue(of(state(true)))
    await settle()
    expect(fixture.nativeElement.querySelector('nav').textContent).toContain('XP.Sharing.Groups')
    component.showPanel('groups')
    await settle()
    expect(api.getShareGroupCandidates).toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).not.toContain('XP.Sharing.ManageGroups')
    component.toggleGroup('group', false)
    await component.saveGroups()
    expect(api.saveShareGroups).toHaveBeenCalledWith('assistant', [], 'revision')
  })
  it('keeps failed group loads distinct from empty groups and preserves selection', async () => {
    api.getSharing.mockReturnValue(of(state(true)))
    await settle()
    api.getShareGroupCandidates.mockReturnValue(throwError(() => new Error('unavailable')))
    component.showPanel('groups')
    await settle()
    expect(component.selectedGroups()).toEqual(['group'])
    expect(component.candidateError()).toBe('unavailable')
    expect(fixture.nativeElement.textContent).not.toContain('XP.Sharing.NoGroups')
    expect(api.saveShareGroups).not.toHaveBeenCalled()
  })
  it('does not enable candidate browsing or writes for an ordinary workspace collaborator', async () => {
    api.getSharing.mockReturnValue(of(state(true, false)))
    await settle()
    expect(fixture.nativeElement.textContent).toContain('XP.Sharing.ReadOnly')
    expect(api.getShareCandidates).not.toHaveBeenCalled()
    await component.remove('user')
    expect(api.revokeShare).not.toHaveBeenCalled()
    component.showPanel('groups')
    await settle()
    expect(api.getShareGroupCandidates).not.toHaveBeenCalled()
  })
  it('rejects stale replies after an organization switch and clears pending selections', async () => {
    const old = new Subject<AssistantSharingState>()
    api.getSharing.mockReturnValueOnce(old)
    fixture.detectChanges()
    organization.set('other')
    api.getSharing.mockReturnValue(of({ ...state(), organization: { id: 'other', name: 'Other' }, users: [] }))
    await settle()
    old.next(state(true))
    old.complete()
    await settle()
    expect(component.state().organization.id).toBe('other')
    expect(component.state().users).toEqual([])
    expect(component.selectedUsers()).toEqual([])
  })
  it('retains existing shares on save errors and prevents duplicate submissions', async () => {
    await settle()
    const pending = new Subject<AssistantSharingState>()
    api.revokeShare.mockReturnValue(pending)
    const first = component.remove('user')
    await component.remove('user')
    expect(api.revokeShare).toHaveBeenCalledTimes(1)
    pending.error(new Error('denied'))
    await first
    expect(component.state().users.map((user) => user.id)).toEqual(['user'])
    expect(toastr.error).toHaveBeenCalledWith('denied')
  })
})
