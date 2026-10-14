jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))
jest.mock('../users.component', () => ({ XpUsersComponent: class XpUsersComponent {} }))

import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { IUser, IUserOrganization, RolesEnum, UserType } from '@xpert-ai/contracts'
import { XpConfirmDeleteService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import {
  OrganizationsService,
  RequestScopeLevel,
  RoleService,
  Store,
  UsersOrganizationsService
} from '../../../../@core'
import { ToastrService, UsersService } from '@cloud/app/@core/state'
import { XpUsersComponent } from '../users.component'
import { ManageUserComponent } from './manage-user.component'

const users: IUser[] = [
  { id: 'alice', firstName: 'Alice', email: 'alice@example.com', role: { name: RolesEnum.ADMIN }, type: UserType.USER },
  {
    id: 'bob',
    firstName: 'Bob',
    email: 'bob@example.com',
    role: { name: RolesEnum.VIEWER },
    type: UserType.USER,
    deletedAt: new Date()
  },
  { id: 'service', firstName: 'Service', role: { name: RolesEnum.VIEWER }, type: UserType.COMMUNICATION }
]
const organization = { id: 'org-1', name: 'Research' }
const memberships: IUserOrganization[] = users.map((user) => ({ user, userId: user.id, organization }))

describe('ManageUserComponent', () => {
  let fixture: ComponentFixture<ManageUserComponent>
  let component: ManageUserComponent
  let scope$: BehaviorSubject<{ level: RequestScopeLevel }>
  let getAll: jest.Mock
  let getAllInOrg: jest.Mock
  let canEdit: ReturnType<typeof signal<boolean>>
  let refresh$: BehaviorSubject<void>
  let state: { status: string; users: Array<IUser & { displayOrganizations: (typeof organization)[] }> }

  beforeEach(async () => {
    scope$ = new BehaviorSubject({ level: RequestScopeLevel.ORGANIZATION })
    canEdit = signal(true)
    getAll = jest.fn(() => of(users))
    getAllInOrg = jest.fn(() => of({ items: memberships }))
    refresh$ = new BehaviorSubject<void>(undefined)
    await TestBed.configureTestingModule({
      imports: [ManageUserComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: Store,
          useValue: { activeScope: scope$.value, selectActiveScope: () => scope$, hasPermission: () => true }
        },
        {
          provide: XpUsersComponent,
          useValue: { canOpenUsers: signal(true), canEditUsers: canEdit, navUser: jest.fn(), refresh$ }
        },
        { provide: UsersService, useValue: { getAll } },
        { provide: UsersOrganizationsService, useValue: { getAllInOrg, getAll: () => of({ items: memberships }) } },
        { provide: OrganizationsService, useValue: { getAll: () => of({ items: [organization] }) } },
        {
          provide: RoleService,
          useValue: { getAll: () => of({ items: [{ name: RolesEnum.ADMIN }, { name: RolesEnum.VIEWER }] }) }
        },
        { provide: XpConfirmDeleteService, useValue: { confirm: jest.fn(() => of(false)) } },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(ManageUserComponent)
    component = fixture.componentInstance
  })

  afterEach(() => TestBed.resetTestingModule())

  it('retains organization-scoped membership loading, user type, role, status, organization and search filters', () => {
    const subscription = component.state$.subscribe((value) => (state = value))
    expect(getAll).not.toHaveBeenCalled()
    expect(getAllInOrg).toHaveBeenCalledWith(['user', 'user.role', 'organization'])
    expect(state.users.map((user) => user.id)).toEqual(['alice', 'bob'])
    component.selectUserTypeQuickFilter(null)
    expect(state.users).toHaveLength(3)
    component.roles = [RolesEnum.VIEWER]
    component.status = 'disabled'
    expect(state.users.map((user) => user.id)).toEqual(['bob'])
    component.clearFilters()
    component.organizationIds = ['different-org']
    expect(state.users).toHaveLength(0)
    component.organizationIds = [organization.id]
    component.search = ' ALICE@EXAMPLE.COM '
    expect(state.users.map((user) => user.id)).toEqual(['alice'])
    component.search = 'research'
    expect(state.users).toHaveLength(2)
    subscription.unsubscribe()
  })

  it('preserves tenant loading with disabled users and limits destructive actions to regular users in tenant scope', async () => {
    scope$.next({ level: RequestScopeLevel.TENANT })
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(getAll).toHaveBeenCalledWith(['role'], undefined, undefined, { types: [UserType.USER], withDeleted: true })
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Delete"]')).toHaveLength(2)
    component.selectUserTypeQuickFilter(UserType.COMMUNICATION)
    fixture.detectChanges()
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Delete"]')).toHaveLength(0)
    canEdit.set(false)
    fixture.detectChanges()
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Edit"]')).toHaveLength(0)
    scope$.next({ level: RequestScopeLevel.ORGANIZATION })
    canEdit.set(true)
    component.clearFilters()
    fixture.detectChanges()
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Edit"]')).toHaveLength(2)
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Delete"]')).toHaveLength(0)
  })

  it('exposes loading and recoverable errors without terminating refreshes', () => {
    const request$ = new Subject<{ items: IUserOrganization[] }>()
    getAllInOrg.mockReturnValue(request$)
    const subscription = component.state$.subscribe((value) => (state = value))
    expect(state.status).toBe('loading')
    request$.error(new Error('offline'))
    expect(state.status).toBe('error')
    getAllInOrg.mockReturnValue(of({ items: memberships }))
    component.refresh$.next()
    expect(state.status).toBe('ready')
    expect(state.users).toHaveLength(2)
    subscription.unsubscribe()
  })

  it('keeps filter changes usable after an error and cleans up the import refresh subscription', () => {
    getAllInOrg.mockReturnValue(throwError(() => new Error('offline')))
    const subscription = component.state$.subscribe((value) => (state = value))
    getAllInOrg.mockReturnValue(of({ items: memberships }))
    component.search = 'Bob'
    expect(state.users.map((user) => user.id)).toEqual(['bob'])
    const refresh = jest.spyOn(component.refresh$, 'next')
    fixture.destroy()
    refresh$.next()
    expect(refresh).not.toHaveBeenCalled()
    subscription.unsubscribe()
  })
})
