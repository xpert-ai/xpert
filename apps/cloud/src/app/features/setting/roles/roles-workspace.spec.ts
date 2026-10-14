import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, Subject, from, of, throwError } from 'rxjs'
import {
  IRole,
  IRolePermission,
  IUser,
  PermissionGroups,
  PermissionsEnum,
  RequestScopeLevel,
  RolePermissionsService,
  RolesEnum,
  RoleService,
  Store,
  ToastrService
} from '../../../@core'
import { ROLE_PERMISSION_MODULES } from '@xpert-ai/contracts'
import { RolesComponent } from './roles.component'

const admin: IRole = { id: 'admin', name: RolesEnum.ADMIN }
const superAdmin: IRole = { id: 'super', name: RolesEnum.SUPER_ADMIN }
const custom: IRole = { id: 'custom', name: 'Reviewer' }
const actor: IUser = { id: 'actor', tenantId: 'tenant', role: superAdmin }
const permission = (id: string, role = admin, enabled = true): IRolePermission => ({
  id: `record-${id}`,
  permission: id,
  role,
  roleId: role.id,
  enabled
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('roles workspace', () => {
  let harness: RouterTestingHarness
  let component: RolesComponent
  let user$: BehaviorSubject<IUser>
  const roles = { getAll: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() }
  const permissions = {
    selectRolePermissions: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    syncDefaults: jest.fn()
  }
  const toastr = { success: jest.fn(), error: jest.fn() }
  const store = { user$: new BehaviorSubject<IUser>(actor), activeScope: { level: RequestScopeLevel.TENANT } }

  beforeEach(async () => {
    jest.resetAllMocks()
    user$ = new BehaviorSubject<IUser>(actor)
    store.user$ = user$
    store.activeScope.level = RequestScopeLevel.TENANT
    roles.getAll.mockReturnValue(of({ items: [superAdmin, admin, custom] }))
    permissions.selectRolePermissions.mockResolvedValue({ items: [permission(PermissionsEnum.PROFILE_EDIT)], total: 1 })
    permissions.update.mockReturnValue(of({}))
    permissions.create.mockReturnValue(of({}))
    await TestBed.configureTestingModule({
      imports: [RolesComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: 'roles', component: RolesComponent }]),
        { provide: RoleService, useValue: roles },
        { provide: RolePermissionsService, useValue: permissions },
        { provide: Store, useValue: store },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    harness = await RouterTestingHarness.create()
    component = await harness.navigateByUrl('/roles', RolesComponent)
    await settle()
  })

  async function settle() {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  async function open(id: string) {
    await harness.navigateByUrl(`/roles?role=${id}`, RolesComponent)
    await settle()
  }

  it('starts with a directory and does not request permissions for every role', () => {
    expect(component.role()).toBeNull()
    expect(component.roles()).toHaveLength(3)
    expect(permissions.selectRolePermissions).not.toHaveBeenCalled()
    expect(harness.routeNativeElement?.querySelector('table')).not.toBeNull()
  })
  it('supports deep links, switching and returning to the directory', async () => {
    await open(admin.id)
    expect(component.role()).toEqual(admin)
    expect(permissions.selectRolePermissions).toHaveBeenLastCalledWith({ roleId: admin.id, tenantId: 'tenant' })
    await component.selectRole(custom.id)
    await settle()
    expect(component.role()).toEqual(custom)
    await component.selectRole(null)
    await settle()
    expect(component.role()).toBeNull()
    expect(component.permissions()).toEqual([])
  })
  it('handles an unknown role without selecting or loading another role', async () => {
    await open('missing')
    expect(component.role()).toBeNull()
    expect(harness.routeNativeElement?.textContent).toContain('XP.RoleWorkspace.RoleNotFound')
    expect(permissions.selectRolePermissions).not.toHaveBeenCalled()
  })
  it('ignores a late permission response after switching roles', async () => {
    const slow = deferred<{ items: IRolePermission[]; total: number }>()
    permissions.selectRolePermissions.mockReturnValueOnce(slow.promise)
    await open(admin.id)
    await open(custom.id)
    slow.resolve({ items: [permission(PermissionsEnum.ORG_USERS_EDIT)], total: 1 })
    await settle()
    expect(component.role()).toEqual(custom)
    expect(component.enabledPermissions().has(PermissionsEnum.ORG_USERS_EDIT)).toBe(false)
  })
  it('does not replace the new role when a previous permission save finishes', async () => {
    // A deferred first emission represents a pending HTTP mutation.
    const saved = deferred<object>()
    permissions.update.mockReturnValue(from(saved.promise))
    await open(admin.id)
    const update = component.permissionChanged(PermissionsEnum.PROFILE_EDIT, false)
    await open(custom.id)
    const requests = permissions.selectRolePermissions.mock.calls.length
    saved.resolve({})
    await update
    expect(component.role()).toEqual(custom)
    expect(permissions.selectRolePermissions).toHaveBeenCalledTimes(requests)
  })
  it('keeps SUPER_ADMIN permissions read only regardless of isSystem', async () => {
    await open(superAdmin.id)
    await component.permissionChanged(PermissionsEnum.PROFILE_EDIT, false)
    expect(harness.routeNativeElement?.querySelector('[role="switch"]')).toBeNull()
    expect(permissions.update).not.toHaveBeenCalled()
  })
  it('retains the administration restriction for other actors while allowing general changes', async () => {
    user$.next({ ...actor, role: admin })
    await open(custom.id)
    await component.permissionChanged(PermissionsEnum.ORG_USERS_EDIT, true)
    expect(permissions.create).not.toHaveBeenCalled()
    await component.permissionChanged(PermissionsEnum.PROFILE_EDIT, false)
    expect(permissions.update).toHaveBeenCalledWith(`record-${PermissionsEnum.PROFILE_EDIT}`, { enabled: false })
  })
  it('creates missing permission records with the original tenant and role payload', async () => {
    await open(admin.id)
    await component.permissionChanged(PermissionsEnum.ORG_USERS_EDIT, true)
    expect(permissions.create).toHaveBeenCalledWith({
      roleId: admin.id,
      tenantId: 'tenant',
      permission: PermissionsEnum.ORG_USERS_EDIT,
      enabled: true
    })
  })
  it('preserves the confirmed value and reports failed saves', async () => {
    await open(admin.id)
    permissions.update.mockReturnValue(throwError(() => new Error('save failed')))
    await component.permissionChanged(PermissionsEnum.PROFILE_EDIT, false)
    expect(component.enabledPermissions().get(PermissionsEnum.PROFILE_EDIT)).toBe(true)
    expect(component.savingPermission()).toBeNull()
    expect(toastr.error).toHaveBeenCalled()
  })
  it('restores the visible switch when saving fails', async () => {
    await open(admin.id)
    component.setQuery('PROFILE_EDIT')
    await settle()
    const response = new Subject<object>()
    permissions.update.mockReturnValue(response)
    const toggle = harness.routeNativeElement?.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(toggle?.getAttribute('aria-checked')).toBe('true')
    toggle?.click()
    await Promise.resolve()
    response.error(new Error('save failed'))
    await settle()
    expect(permissions.update).toHaveBeenCalledTimes(1)
    expect(harness.routeNativeElement?.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
  })
  it('blocks writes after a failed read and allows retry', async () => {
    permissions.selectRolePermissions.mockRejectedValueOnce(new Error('read failed'))
    await open(admin.id)
    expect(component.permissionsError()).toBeTruthy()
    await component.permissionChanged(PermissionsEnum.ORG_USERS_EDIT, true)
    expect(permissions.create).not.toHaveBeenCalled()
    await component.loadPermissions()
    expect(component.permissionsError()).toBe('')
    expect(component.enabledCount()).toBe(1)
  })
  it('retains all deprecated permissions and their existing editing rules', async () => {
    await open(admin.id)
    expect(component.permissionRows()).toHaveLength(
      PermissionGroups.GENERAL.length + component.getAdministrationPermissions().length
    )
    component.setTab('deprecated')
    expect(component.filteredPermissions().every((row) => row.deprecated)).toBe(true)
    expect(component.filteredPermissions().some((row) => row.id === PermissionsEnum.ORG_INVITE_VIEW)).toBe(true)
    await component.permissionChanged(PermissionsEnum.ORG_INVITE_VIEW, true)
    expect(permissions.create).toHaveBeenCalled()
  })
  it('combines permission ID, module and enabled-state filters', async () => {
    await open(admin.id)
    component.setQuery('profile_edit')
    component.setModule('personal')
    component.setStatus('enabled')
    expect(component.filteredPermissions().map((row) => row.id)).toEqual([PermissionsEnum.PROFILE_EDIT])
    component.setStatus('disabled')
    expect(component.filteredPermissions()).toEqual([])
    component.clearFilters()
    expect(component.filteredPermissions()).toHaveLength(component.activeCount())
  })
  it('maps every catalog permission explicitly without changing authorization categories', () => {
    for (const id of [...PermissionGroups.GENERAL, ...PermissionGroups.ADMINISTRATION])
      expect(ROLE_PERMISSION_MODULES.has(id)).toBe(true)
    expect(component.permissionRows().find((row) => row.id === PermissionsEnum.ORG_USERS_EDIT)?.administration).toBe(
      true
    )
    expect(component.permissionRows().find((row) => row.id === PermissionsEnum.ORG_INVITE_EDIT)?.administration).toBe(
      false
    )
  })
  it('does not rename or delete system roles', async () => {
    await component.rename({ ...custom, isSystem: true })
    await component.remove({ ...custom, isSystem: true })
    expect(roles.update).not.toHaveBeenCalled()
    expect(roles.delete).not.toHaveBeenCalled()
  })
  it('restricts default synchronization to tenant scope', async () => {
    store.activeScope.level = RequestScopeLevel.ORGANIZATION
    await component.syncDefaultPermissions()
    expect(permissions.syncDefaults).not.toHaveBeenCalled()
  })
})
