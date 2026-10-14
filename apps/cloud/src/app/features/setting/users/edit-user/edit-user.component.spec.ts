jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { TestBed, fakeAsync, tick } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService } from 'ngx-permissions'
import { BehaviorSubject, of } from 'rxjs'
import { IUser, PermissionsEnum, RolesEnum, UserType } from '@xpert-ai/contracts'
import { XpConfirmDeleteService, ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { AIPermissionsEnum, RequestScopeLevel, RoleService, Store } from '../../../../@core'
import { ToastrService, UsersService } from '@cloud/app/@core/state'
import { XpEditUserComponent } from './edit-user.component'

describe('XpEditUserComponent', () => {
  let scope$: BehaviorSubject<{ level: RequestScopeLevel }>
  let permissions$: BehaviorSubject<object>
  let enabled$: BehaviorSubject<boolean>
  let allowed: Set<string>
  let user: IUser
  let getUserById: jest.Mock
  let navigate: jest.Mock

  beforeEach(() => {
    scope$ = new BehaviorSubject({ level: RequestScopeLevel.ORGANIZATION })
    permissions$ = new BehaviorSubject({})
    enabled$ = new BehaviorSubject(true)
    allowed = new Set([PermissionsEnum.ALL_ORG_EDIT, AIPermissionsEnum.MEMBERSHIP_EDIT])
    user = { id: 'user-1', firstName: 'Admin', roleId: 'role-admin', type: UserType.USER }
    getUserById = jest.fn().mockImplementation(() => Promise.resolve(user))
    navigate = jest.fn().mockResolvedValue(true)
    TestBed.configureTestingModule({
      imports: [XpEditUserComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: Store,
          useValue: {
            user: { role: { name: RolesEnum.SUPER_ADMIN } },
            activeScope: scope$.value,
            selectActiveScope: () => scope$,
            hasPermission: (key: string) => allowed.has(key),
            selectHasFeatureEnabled: () => enabled$,
            hasFeatureEnabled: () => enabled$.value
          }
        },
        { provide: NgxPermissionsService, useValue: { permissions$, getPermissions: () => ({}) } },
        {
          provide: RoleService,
          useValue: { getAll: () => of({ items: [{ id: 'role-admin', name: RolesEnum.SUPER_ADMIN }] }) }
        },
        { provide: UsersService, useValue: { getUserById } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ id: 'user-1' }),
            snapshot: { params: { id: 'user-1' }, queryParamMap: convertToParamMap({}) },
            queryParamMap: of(convertToParamMap({ tab: 'security' }))
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: XpConfirmDeleteService, useValue: { confirm: jest.fn() } },
        { provide: ZardAlertDialogService, useValue: { confirm: () => of(false) } }
      ]
    }).overrideComponent(XpEditUserComponent, { set: { imports: [], template: '' } })
  })

  it('keeps organization details read-only, requests the role, and resolves the shared role label', fakeAsync(() => {
    const fixture = TestBed.createComponent(XpEditUserComponent)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    const component = fixture.componentInstance
    expect(getUserById).toHaveBeenCalledWith('user-1', ['role'])
    expect(component.roleLabel()).toBe('SUPER_ADMIN')
    expect(component.canManageTenantUser()).toBe(false)
    expect(component.availableTabs().map((t) => t.id)).toEqual(['basic', 'membership'])
    expect(component.activeTab()).toBe('basic')
  }))

  it('retains tenant edit, membership permission and feature gates independently', fakeAsync(() => {
    scope$.next({ level: RequestScopeLevel.TENANT })
    const fixture = TestBed.createComponent(XpEditUserComponent)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    const component = fixture.componentInstance
    expect(component.availableTabs().map((t) => t.id)).toEqual(['basic', 'membership', 'organizations', 'security'])
    allowed.delete(PermissionsEnum.ALL_ORG_EDIT)
    permissions$.next({ updated: true })
    fixture.detectChanges()
    tick()
    expect(component.availableTabs().map((t) => t.id)).toEqual(['basic', 'membership', 'organizations'])
    enabled$.next(false)
    expect(component.availableTabs().map((t) => t.id)).toEqual(['basic', 'organizations'])
    enabled$.next(true)
    allowed.delete(AIPermissionsEnum.MEMBERSHIP_EDIT)
    permissions$.next({ updated: false })
    expect(component.availableTabs().map((t) => t.id)).toEqual(['basic', 'organizations'])
  }))

  it('restricts technical users to basic details even in an editable tenant scope', fakeAsync(() => {
    scope$.next({ level: RequestScopeLevel.TENANT })
    user = { ...user, type: UserType.COMMUNICATION }
    const fixture = TestBed.createComponent(XpEditUserComponent)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    tick()
    expect(fixture.componentInstance.availableTabs().map((t) => t.id)).toEqual(['basic'])
    expect(fixture.componentInstance.activeTab()).toBe('basic')
  }))

  it('shows a recoverable load error and can retry without recreating the route', fakeAsync(() => {
    getUserById.mockRejectedValueOnce(new Error('offline'))
    const fixture = TestBed.createComponent(XpEditUserComponent)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    expect(fixture.componentInstance.userState().error).toBe(true)
    fixture.componentInstance.reloadUser()
    tick()
    fixture.detectChanges()
    expect(fixture.componentInstance.userState().error).toBe(false)
    expect(fixture.componentInstance.user()?.id).toBe('user-1')
  }))
})
