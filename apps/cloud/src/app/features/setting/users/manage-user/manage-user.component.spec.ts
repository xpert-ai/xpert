jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))
jest.mock('../users.component', () => ({ XpUsersComponent: class XpUsersComponent {} }))

import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  type IPagination,
  type IUserDirectoryItem,
  type IUserDirectoryQuery,
  RolesEnum,
  UserType
} from '@xpert-ai/contracts'
import { XpConfirmDeleteService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { OrganizationsService, RequestScopeLevel, RoleService, Store } from '../../../../@core'
import { ToastrService, UsersService, type ActiveScope } from '@cloud/app/@core/state'
import { XpUsersComponent } from '../users.component'
import { ManageUserComponent } from './manage-user.component'

const organization = { id: 'org-1', name: 'Research' }
const users: IUserDirectoryItem[] = [
  {
    id: 'alice',
    firstName: 'Alice',
    email: 'alice@example.com',
    role: { name: RolesEnum.ADMIN },
    type: UserType.USER,
    displayOrganizations: [organization]
  },
  {
    id: 'bob',
    firstName: 'Bob',
    email: 'bob@example.com',
    role: { name: RolesEnum.VIEWER },
    type: UserType.USER,
    deletedAt: new Date(),
    displayOrganizations: [organization]
  }
]
const technical: IUserDirectoryItem = {
  id: 'service',
  firstName: 'Service',
  type: UserType.COMMUNICATION,
  displayOrganizations: [organization]
}

describe('ManageUserComponent', () => {
  let fixture: ComponentFixture<ManageUserComponent>
  let component: ManageUserComponent
  let scope$: BehaviorSubject<ActiveScope>
  let getDirectory: jest.Mock
  let canEdit: ReturnType<typeof signal<boolean>>
  let refresh$: BehaviorSubject<void>
  let state: { status: string; users: IUserDirectoryItem[]; total: number; pageIndex: number; pageSize: number }

  beforeEach(async () => {
    scope$ = new BehaviorSubject<ActiveScope>({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: organization.id
    })
    canEdit = signal(true)
    getDirectory = jest.fn((_query: IUserDirectoryQuery) => of({ items: users, total: users.length }))
    refresh$ = new BehaviorSubject<void>(undefined)
    await TestBed.configureTestingModule({
      imports: [ManageUserComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: Store,
          useValue: {
            activeScope: scope$.value,
            selectedOrganization: organization,
            selectActiveScope: () => scope$,
            hasPermission: () => true
          }
        },
        {
          provide: XpUsersComponent,
          useValue: { canOpenUsers: signal(true), canEditUsers: canEdit, navUser: jest.fn(), refresh$ }
        },
        { provide: UsersService, useValue: { getDirectory } },
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

  it('requests only the first page and uses the server total instead of the visible row count', () => {
    getDirectory.mockReturnValue(of({ items: users, total: 43 }))
    const subscription = component.state$.subscribe((value) => (state = value))
    expect(getDirectory).toHaveBeenLastCalledWith({
      take: 20,
      skip: 0,
      types: [UserType.USER],
      search: '',
      roles: [],
      status: 'all',
      organizationIds: []
    })
    expect(state.total).toBe(43)
    expect(state.users).toEqual(users)
    fixture.detectChanges()
    expect(getDirectory).toHaveBeenCalledTimes(1)
    expect(fixture.nativeElement.querySelector('z-paginator')).not.toBeNull()
    subscription.unsubscribe()
  })

  it('passes every filter to the server and resets the page without filtering the returned page locally', () => {
    getDirectory.mockReturnValue(of({ items: users, total: 60 }))
    const subscription = component.state$.subscribe((value) => (state = value))
    component.onPage({ pageIndex: 2, pageSize: 20, length: 60 })
    expect(getDirectory.mock.lastCall[0]).toMatchObject({ take: 20, skip: 40 })
    component.selectUserTypeQuickFilter(null)
    component.roles = [RolesEnum.VIEWER]
    component.status = 'disabled'
    component.organizationIds = [organization.id]
    component.search = ' ALICE@EXAMPLE.COM '
    expect(getDirectory.mock.lastCall[0]).toEqual({
      take: 20,
      skip: 0,
      types: [UserType.USER, UserType.COMMUNICATION],
      roles: [RolesEnum.VIEWER],
      status: 'disabled',
      organizationIds: [organization.id],
      search: 'ALICE@EXAMPLE.COM'
    })
    expect(state.users).toEqual(users)
    component.clearFilters()
    expect(getDirectory.mock.lastCall[0]).toMatchObject({
      types: [UserType.USER],
      roles: [],
      status: 'all',
      organizationIds: [],
      skip: 0
    })
    subscription.unsubscribe()
  })

  it('supports page size changes and returns to page one', () => {
    getDirectory.mockReturnValue(of({ items: users, total: 120 }))
    const subscription = component.state$.subscribe((value) => (state = value))
    component.onPage({ pageIndex: 3, pageSize: 20, length: 120 })
    component.onPage({ pageIndex: 1, pageSize: 50, length: 120 })
    expect(getDirectory.mock.lastCall[0]).toMatchObject({ take: 50, skip: 0 })
    expect(state.pageSize).toBe(50)
    expect(state.pageIndex).toBe(0)
    subscription.unsubscribe()
  })

  it('moves to the last remaining page after a refresh shrinks the result set', () => {
    getDirectory.mockReturnValue(of({ items: users, total: 41 }))
    const subscription = component.state$.subscribe((value) => (state = value))
    component.onPage({ pageIndex: 2, pageSize: 20, length: 41 })
    getDirectory.mockReturnValueOnce(of({ items: [], total: 40 })).mockReturnValue(of({ items: users, total: 40 }))
    refresh$.next()
    expect(getDirectory.mock.lastCall[0]).toMatchObject({ skip: 20, take: 20 })
    expect(state.pageIndex).toBe(1)
    expect(state.status).toBe('ready')
    subscription.unsubscribe()
  })

  it('reloads page one when switching organizations at the same scope level and cancels stale requests', () => {
    getDirectory.mockReturnValue(of({ items: users, total: 60 }))
    const subscription = component.state$.subscribe((value) => (state = value))
    const request = new Subject<IPagination<IUserDirectoryItem>>()
    getDirectory.mockReturnValueOnce(request)
    component.onPage({ pageIndex: 2, pageSize: 20, length: 60 })
    expect(state.status).toBe('loading')
    expect(state.users).toEqual([])
    scope$.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-2' })
    expect(request.observed).toBe(false)
    expect(getDirectory.mock.lastCall[0]).toMatchObject({ skip: 0 })
    expect(state.pageIndex).toBe(0)
    request.next({ items: [technical], total: 1 })
    expect(state.users).toEqual(users)
    subscription.unsubscribe()
  })

  it('preserves the failed page for retry and keeps filters usable after failure', () => {
    getDirectory.mockReturnValue(of({ items: users, total: 60 }))
    const subscription = component.state$.subscribe((value) => (state = value))
    getDirectory.mockReturnValueOnce(throwError(() => new Error('offline')))
    component.onPage({ pageIndex: 1, pageSize: 20, length: 60 })
    expect(state.status).toBe('error')
    component.refresh$.next()
    expect(getDirectory.mock.lastCall[0]).toMatchObject({ skip: 20 })
    expect(state.status).toBe('ready')
    component.search = 'Bob'
    expect(getDirectory.mock.lastCall[0]).toMatchObject({ skip: 0, search: 'Bob' })
    const refresh = jest.spyOn(component.refresh$, 'next')
    fixture.destroy()
    refresh$.next()
    expect(refresh).not.toHaveBeenCalled()
    subscription.unsubscribe()
  })

  it('limits destructive actions to regular users in tenant scope', async () => {
    scope$.next({ level: RequestScopeLevel.TENANT })
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Delete"]')).toHaveLength(2)
    getDirectory.mockReturnValue(of({ items: [technical], total: 1 }))
    component.selectUserTypeQuickFilter(UserType.COMMUNICATION)
    fixture.detectChanges()
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Delete"]')).toHaveLength(0)
    canEdit.set(false)
    fixture.detectChanges()
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Edit"]')).toHaveLength(0)
    getDirectory.mockReturnValue(of({ items: users, total: 2 }))
    scope$.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: organization.id })
    canEdit.set(true)
    component.clearFilters()
    fixture.detectChanges()
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Edit"]')).toHaveLength(2)
    expect(root.querySelectorAll('[aria-label="XP.ACTIONS.Delete"]')).toHaveLength(0)
  })
})
