import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { injectOrganization, injectOrganizationId } from '@cloud/app/@core/state'
import { injectToastr, injectUserGroupAPI, injectXpertAPI } from '../../../@core'
import { IUser } from '@xpert-ai/contracts'
import { UserGroupsSettingsComponent } from './groups.component'

jest.mock('@cloud/app/@core/state', () => ({ injectOrganization: jest.fn(), injectOrganizationId: jest.fn() }))
jest.mock('../../../@core', () => ({
  injectToastr: jest.fn(),
  injectUserGroupAPI: jest.fn(),
  injectXpertAPI: jest.fn(),
  getErrorMessage: (error: Error) => error.message,
  OrderTypeEnum: { DESC: 'DESC' },
  routeAnimations: []
}))
jest.mock('@xpert-ai/headless-ui', () => ({
  injectConfirmDelete: () => jest.fn(),
  ZardTabsImports: []
}))
jest.mock('../../../@shared/user', () => ({}))
jest.mock('../../../@shared/language', () => jest.requireActual('../../../@shared/language/translation-base.component'))

describe('UserGroupsSettingsComponent organization members', () => {
  const organizationId = signal<string | null>('org-a')
  const groupParams = new BehaviorSubject(convertToParamMap({ id: 'group-a' }))
  const groups = {
    getAllByOrganization: jest.fn(),
    getMemberCandidates: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
  const xperts = { getUserGroupAuthorizations: jest.fn(), updateUserGroupAuthorizations: jest.fn() }
  const toastr = { error: jest.fn(), success: jest.fn() }
  const router = { navigate: jest.fn() }
  const active: IUser = { id: 'active-user', email: 'active@example.test' }
  const inactive: IUser = { id: 'inactive-user', email: 'inactive@example.test' }
  const foreign: IUser = { id: 'foreign-user', email: 'foreign@example.test' }
  let component: UserGroupsSettingsComponent

  beforeEach(() => {
    jest.clearAllMocks()
    organizationId.set('org-a')
    groupParams.next(convertToParamMap({ id: 'group-a' }))
    jest.mocked(injectOrganizationId).mockReturnValue(organizationId)
    jest.mocked(injectOrganization).mockReturnValue(signal({ id: 'org-a', name: 'A' }))
    jest.mocked(injectUserGroupAPI).mockReturnValue(groups as unknown as ReturnType<typeof injectUserGroupAPI>)
    jest.mocked(injectXpertAPI).mockReturnValue(xperts as unknown as ReturnType<typeof injectXpertAPI>)
    jest.mocked(injectToastr).mockReturnValue(toastr as unknown as ReturnType<typeof injectToastr>)
    groups.getAllByOrganization.mockReturnValue(
      of({ items: [{ id: 'group-a', organizationId: 'org-a', name: 'Group', members: [active, inactive, foreign] }] })
    )
    groups.getMemberCandidates.mockReturnValue(of([active]))
    groups.update.mockReturnValue(of({ id: 'group-a' }))
    groups.create.mockReturnValue(of({ id: 'new-group' }))
    xperts.getUserGroupAuthorizations.mockReturnValue(of({ items: [], selectedXpertIds: [] }))
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: groupParams,
            queryParamMap: of(convertToParamMap({})),
            snapshot: { paramMap: groupParams.value, queryParamMap: convertToParamMap({}) }
          }
        }
      ]
    })
    component = TestBed.runInInjectionContext(() => new UserGroupsSettingsComponent())
  })

  async function settle() {
    TestBed.flushEffects()
    await Promise.resolve()
    await Promise.resolve()
    TestBed.flushEffects()
    await Promise.resolve()
    await Promise.resolve()
    TestBed.flushEffects()
  }

  it('excludes historical inactive and foreign members from display, selection, search and save', async () => {
    await settle()
    expect(groups.getMemberCandidates).toHaveBeenCalledWith('org-a')
    expect(component.visibleUsers()).toEqual([active])
    expect(component.selectedMemberIds()).toEqual([active.id])
    expect(component.groupMemberCount(component.selectedGroup())).toBe(1)
    component.toggleMember(foreign.id, true)
    component.selectVisibleMembers()
    expect(component.selectedMemberIds()).toEqual([active.id])
    component.updateMemberQuery('foreign')
    expect(component.visibleUsers()).toEqual([])
    component.save()
    expect(groups.update).toHaveBeenCalledWith('group-a', {
      name: 'Group',
      description: null,
      members: [{ id: active.id }]
    })
    await settle()
  })

  it('clears the list on organization switches and ignores a late response from the previous organization', async () => {
    const oldUsers = new Subject<IUser[]>()
    groups.getMemberCandidates.mockReturnValueOnce(oldUsers)
    await settle()
    expect(component.loading()).toBe(true)
    organizationId.set('org-b')
    groups.getAllByOrganization.mockReturnValue(of({ items: [] }))
    groups.getMemberCandidates.mockReturnValue(of([foreign]))
    TestBed.flushEffects()
    expect(component.visibleUsers()).toEqual([])
    expect(component.selectedMemberIds()).toEqual([])
    await settle()
    expect(component.visibleUsers()).toEqual([foreign])
    oldUsers.next([active])
    oldUsers.complete()
    await settle()
    expect(component.visibleUsers()).toEqual([foreign])
    expect(component.loading()).toBe(false)
  })

  it('does not use a remembered organization when the active scope has no organization', async () => {
    await settle()
    jest.clearAllMocks()
    organizationId.set(null)
    await settle()
    expect(component.visibleUsers()).toEqual([])
    expect(component.selectedMemberIds()).toEqual([])
    expect(groups.getMemberCandidates).not.toHaveBeenCalled()
    component.name.setValue('New')
    component.save()
    expect(groups.create).not.toHaveBeenCalled()
  })

  it('keeps no stale candidates when a refresh fails', async () => {
    await settle()
    groups.getMemberCandidates.mockReturnValue(throwError(() => new Error('Unavailable')))
    await component.loadData()
    expect(component.visibleUsers()).toEqual([])
    expect(component.selectedMemberIds()).toEqual([])
    expect(component.loading()).toBe(false)
    expect(toastr.error).toHaveBeenCalledWith('Unavailable')
  })

  it('ignores a superseded response even when both requests target the same organization', async () => {
    await settle()
    const stale = new Subject<IUser[]>()
    groups.getMemberCandidates.mockReturnValueOnce(stale)
    const pending = component.loadData()
    groups.getMemberCandidates.mockReturnValueOnce(of([]))
    await component.loadData()
    stale.next([active])
    stale.complete()
    await pending
    await settle()
    expect(component.visibleUsers()).toEqual([])
  })
})
