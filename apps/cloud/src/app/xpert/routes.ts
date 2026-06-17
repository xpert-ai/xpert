import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, RedirectFunction, Router, RouterStateSnapshot, Routes } from '@angular/router'
import { Store } from '@xpert-ai/cloud/state'
import { firstValueFrom } from 'rxjs'
import { XpertAPIService } from '../@core'

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const xpertService = inject(XpertAPIService)
  const router = inject(Router)
  const store = inject(Store)

  // if (await authService.isAuthenticated()) {
  //   return true;  // Allow access if logged in
  // }

  const nameParam = route.paramMap.get('name')

  try {
    const xpert = await firstValueFrom(xpertService.getChatApp(nameParam))
    if (!xpert) {
      router.navigate(['/auth/login'], {
        queryParams: { returnUrl: state.url }
      })
      return false
    }
    // const xpert = result.xpert
    // // 将 User Token RefreshToken 保存至 localStorage
    // store.userId = result.user.id
    // store.token = result.token
    // store.refreshToken = result.refreshToken
    // store.user = result.user
    // store.selectedOrganization = result.xpert.organization
    route.data = { ...(route.data ?? {}), xpert }
    return true
  } catch (err) {
    // Redirect to login if not authenticated
    router.navigate(['/auth/login'], {
      queryParams: { returnUrl: state.url }
    })
  }

  return false // Prevent access to the route
}

export const redirectLegacyPublicChatkitRoute: RedirectFunction = ({ params, queryParams, fragment }) => {
  const router = inject(Router)
  const name = typeof params['name'] === 'string' ? params['name'] : ''
  const id = typeof params['id'] === 'string' ? params['id'] : null
  const commands = id ? ['/x-chatkit', 'x', name, 'c', id] : ['/x-chatkit', 'x', name]

  return router.createUrlTree(commands, {
    queryParams,
    fragment: fragment ?? undefined
  })
}

export const routes: Routes = [
  {
    path: ':name/c/:id',
    redirectTo: redirectLegacyPublicChatkitRoute
  },
  {
    path: ':name',
    redirectTo: redirectLegacyPublicChatkitRoute
  }
]
