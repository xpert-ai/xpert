import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, Routes } from '@angular/router'
import { Store } from '@metad/cloud/state'
import { firstValueFrom } from 'rxjs'
import { XpertService } from '../@core'
import { ChatHomeComponent } from './home/home.component'

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const xpertService = inject(XpertService)
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

export const routes: Routes = [
  {
    path: ':name',
    children: [
      {
        path: 'c/:id',
        component: ChatHomeComponent
      },
      {
        path: '**',
        component: ChatHomeComponent
      }
    ],
    canActivate: [authGuard]
  }
]
