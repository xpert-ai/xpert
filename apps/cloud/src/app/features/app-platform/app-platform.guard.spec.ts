import { TestBed } from '@angular/core/testing'
import { HttpErrorResponse } from '@angular/common/http'
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router'
import { AIPermissionsEnum, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { Store, UsersService } from '../../@core/state'
import { AppPlatformService } from '../../@core/services/app-platform.service'
import { XpertProjectApiService } from '../project/project-api.service'
import { appPlatformGuard } from './app-platform.guard'

describe('application routes within the existing website', () => {
  const permissions: string[] = []
  const user = {
    role: {
      name: String(RolesEnum.APP_USER),
      rolePermissions: permissions.map((permission) => ({ permission, enabled: true }))
    },
    organizations: []
  }
  const store = { token: 'test-session', user, setOrganizationScope: jest.fn() }
  const platform = { refresh: jest.fn() }
  const projects = { get: jest.fn(), typeEntry: jest.fn() }
  const router = { createUrlTree: jest.fn((commands: string[]) => commands.join('/')) }
  const navigate = (url: string) =>
    TestBed.runInInjectionContext(() => appPlatformGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot))
  beforeEach(() => {
    router.createUrlTree.mockClear()
    user.role = {
      name: RolesEnum.APP_USER,
      rolePermissions: [
        AIPermissionsEnum.APPLICATION_USE,
        AIPermissionsEnum.CHAT_VIEW,
        AIPermissionsEnum.XPERT_PROJECT_VIEW,
        PermissionsEnum.PROFILE_EDIT,
        AIPermissionsEnum.MEMBERSHIP_USE
      ].map((permission) => ({ permission, enabled: true }))
    }
    platform.refresh
      .mockReset()
      .mockResolvedValue({ ready: true, apps: [{ entries: [{ id: 'entry', slug: 'assigned-app' }] }] })
    projects.get.mockReset()
    projects.typeEntry.mockReset()
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: UsersService, useValue: {} },
        { provide: AppPlatformService, useValue: platform },
        { provide: XpertProjectApiService, useValue: projects },
        { provide: Router, useValue: router }
      ]
    })
  })
  afterEach(() => TestBed.resetTestingModule())

  it.each([
    '/settings/account/profile',
    '/settings/account/password',
    '/settings/account/usage',
    '/settings/account/billing',
    '/project',
    '/chat/x/assigned-app/c'
  ])('keeps the authorized website route %s', async (url) => expect(await navigate(url)).toBe(true))
  it.each([
    '/xpert',
    '/copilot/basic',
    '/plugins',
    '/settings/roles',
    '/settings/account/models',
    '/settings/account/api-keys'
  ])('leaves feature permission checks to native route guards for %s', async (url) => {
    expect(await navigate(url)).toBe(true)
    expect(platform.refresh).not.toHaveBeenCalled()
  })
  it.each([RolesEnum.APP_USER, RolesEnum.ADMIN, 'BID_CUSTOMER'])(
    'coordinates readiness with identical permissions for role %s',
    async (name) => {
      user.role.name = name
      expect(await navigate('/chat/x/assigned-app/c')).toBe(true)
      expect(platform.refresh).toHaveBeenCalledTimes(1)
      platform.refresh.mockResolvedValue({ ready: false, apps: [] })
      expect(await navigate('/chat/x/assigned-app/c')).toBe('/apps')
    }
  )
  it('does not infer managed delivery from the role name', async () => {
    user.role.rolePermissions.find((item) => item.permission === AIPermissionsEnum.APPLICATION_USE)!.enabled = false
    expect(await navigate('/chat/x/assigned-app/c')).toBe(true)
    expect(platform.refresh).not.toHaveBeenCalled()
  })
  it('opens a project through its authorized App entry, retaining the business view', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    projects.get.mockReturnValue(of({ applicationKey: 'sample:app', projectTypeKey: 'document' }))
    projects.typeEntry.mockReturnValue(
      of({ kind: 'assistant', slug: 'assigned-app', viewKey: 'studio', selectionId: 'document' })
    )
    expect(await navigate(`/project/${projectId}`)).toBe(`/chat/x/assigned-app/p/${projectId}/c`)
    projects.get.mockReturnValue(throwError(() => new Error('Forbidden')))
    expect(await navigate(`/project/${projectId}`)).toBe('/apps')
  })
  it('preserves ordinary platform navigation', async () => {
    user.role.name = RolesEnum.ADMIN
    expect(await navigate('/xpert')).toBe(true)
    expect(platform.refresh).not.toHaveBeenCalled()
  })
  it('retains the business deep link when the API is temporarily unavailable', async () => {
    platform.refresh.mockRejectedValue(new HttpErrorResponse({ status: 503 }))
    const url = '/chat/x/assigned-app/p/project/c/thread?view=studio'
    expect(await navigate(url)).toBe('/apps')
    expect(router.createUrlTree).toHaveBeenLastCalledWith(['/apps'], { queryParams: { returnUrl: url } })
  })
  it('does not repeatedly restore an unauthorized route', async () => {
    platform.refresh.mockRejectedValue(new HttpErrorResponse({ status: 403 }))
    expect(await navigate('/chat/x/assigned-app/c')).toBe('/apps')
    expect(router.createUrlTree).toHaveBeenLastCalledWith(['/apps'])
  })
})
