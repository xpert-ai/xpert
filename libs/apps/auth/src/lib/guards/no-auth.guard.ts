import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Store } from '@metad/cloud/state'
import { PacAuthService } from '../services'

/**
 * Use for routes which only need to be displayed if user is NOT logged in
 */
@Injectable()
export class NoAuthGuard  {
	constructor(
		private readonly router: Router,
		private readonly authService: PacAuthService,
		private readonly store: Store
	) {}

	private canAccessInviteRoute(route: ActivatedRouteSnapshot): boolean {
		return route.routeConfig?.path === 'accept-invite' &&
			route.queryParamMap.has('email') &&
			route.queryParamMap.has('token');
	}

	async canActivate(
		route: ActivatedRouteSnapshot,
		state: RouterStateSnapshot
	) {
		if (this.canAccessInviteRoute(route)) {
			return true;
		}

		if (!this.store.token) {
			// not logged in so return true
			return true;
		}

		const isAuthenticated = await this.authService.isAuthenticated();

		if (!isAuthenticated) {
			// not logged in so return true
			return true;
		}

		// logged in so redirect to home dashboard
		this.router.navigate(['/home']);

		return false;
	}
}
