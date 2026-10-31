import { inject } from '@angular/core'
import { HttpErrorResponse } from '@angular/common/http'
import { CanActivateChildFn, Router } from '@angular/router'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { CURRENT_USER_BOOTSTRAP_RELATIONS, CURRENT_USER_BOOTSTRAP_SELECT, Store, UsersService } from '../../@core/state'
import { firstValueFrom } from 'rxjs'
import { XpertProjectApiService } from '../project/project-api.service'
import { AppPlatformService } from '../../@core/services/app-platform.service'

export const appPlatformGuard: CanActivateChildFn = async (_route, state) => {
  const projects = inject(XpertProjectApiService)
  const store = inject(Store),
    users = inject(UsersService),
    router = inject(Router),
    platform = inject(AppPlatformService)
  if (!store.token) return true
  const user = store.user?.role
    ? store.user
    : await users.getMe([...CURRENT_USER_BOOTSTRAP_RELATIONS], CURRENT_USER_BOOTSTRAP_SELECT)
  store.user = user
  const permissions = user?.role?.rolePermissions?.filter((item) => item.enabled).map((item) => item.permission) ?? []
  if (!permissions.includes(AIPermissionsEnum.APPLICATION_USE)) return true
  const organization = user.organizations?.find(
    (item) => item.isActive !== false && item.organization?.isActive !== false
  )?.organization
  if (organization && !store.organizationId) store.setOrganizationScope(organization)
  const pathname = state.url.split('?')[0]
  // Feature routes enforce their own permissions. This guard only coordinates delivery readiness.
  if (!pathname.startsWith('/chat') && !pathname.startsWith('/project')) return true
  try {
    const status = await platform.refresh()
    const projectId = /^\/project\/([0-9a-f-]{36})$/.exec(pathname)?.[1]
    if (status.ready && permissions.includes(AIPermissionsEnum.XPERT_PROJECT_VIEW)) {
      if (pathname === '/project') return true
      if (projectId) {
        const project = await firstValueFrom(projects.get(projectId))
        if (project.applicationKey && project.projectTypeKey) {
          const entry = await firstValueFrom(
            projects.typeEntry(
              { applicationKey: project.applicationKey, projectTypeKey: project.projectTypeKey },
              { projectId }
            )
          )
          if (
            entry.kind === 'assistant' &&
            status.apps.some((app) => app.entries.some((item) => item.slug === entry.slug))
          )
            return router.createUrlTree(['/chat/x', entry.slug, 'p', projectId, 'c'], {
              queryParams: {
                view: entry.viewKey,
                viewSelection: entry.selectionId,
                viewProject: projectId,
                ...(entry.parameters ? { viewParameters: JSON.stringify(entry.parameters) } : {})
              }
            })
        }
      }
    }
    if (status.ready) return true
  } catch (error) {
    if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
      return router.createUrlTree(['/apps'], { queryParams: { returnUrl: state.url } })
  }
  return router.createUrlTree(['/apps'])
}
