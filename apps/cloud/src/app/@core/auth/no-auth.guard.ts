import { Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router'
import { AuthService } from '@xpert-ai/cloud/state'

/**
 * Use for routes which only need to be displayed if user is NOT logged in
 */
@Injectable()
export class NoAuthGuard  {
  constructor(private readonly router: Router, private readonly authService: AuthService) {}

  async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    const isAuthenticated = await this.authService.isAuthenticated()

    if (!isAuthenticated) {
      // not logged in so return true
      return true
    }

    // logged in so redirect to dashboard
    this.router.navigate(['/pages/dashboard'])

    return false
  }
}
