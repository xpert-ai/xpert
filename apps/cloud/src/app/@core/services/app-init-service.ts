import { Inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { Ability, AbilityBuilder } from '@casl/ability'
import { IUser } from '@xpert-ai/contracts'
import { CURRENT_USER_BOOTSTRAP_RELATIONS, CURRENT_USER_FULL_RELATIONS, UsersService } from '@xpert-ai/cloud/state'
import * as Sentry from "@sentry/angular";
import { NgxPermissionsService } from 'ngx-permissions'
import { firstValueFrom } from 'rxjs'
import { AuthStrategy } from '../../@core/auth/auth-strategy.service'
import { Store } from '../../@core/services/store.service'
import { AbilityActions, RolesEnum } from '../types'
import { ScopeService } from './scope.service'
import { TenantService } from './tenant.service'

@Injectable({ providedIn: 'root' })
export class AppInitService {
  user: IUser

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantService: TenantService,
    private readonly authStrategy: AuthStrategy,
    private readonly router: Router,
    private readonly store: Store,
    private readonly scopeService: ScopeService,
    private readonly ngxPermissionsService: NgxPermissionsService,
    @Inject(Ability) private readonly ability: Ability,
  ) {}

  async init() {
    try {
      const id = this.store.userId
      if (id) {
        this.user = await this.usersService.getMe([...CURRENT_USER_BOOTSTRAP_RELATIONS])

        //When a new user registers & logs in for the first time, he/she does not have tenantId.
        //In this case, we have to redirect the user to the onboarding page to create their first organization, tenant, role.
        if (!this.user?.tenantId) {
          this.router.navigate(['/onboarding/'])
          return
        }

        this.store.user = this.user

        const memberships = (this.user.organizations ?? []).filter(
          (membership) =>
            membership.isActive !== false &&
            !!membership.organization?.id &&
            membership.organization.isActive !== false
        )
        const organizations = memberships.map(({ organization }) => organization)
        const preferredOrganizationId =
          memberships.find((membership) => membership.isDefault)?.organizationId ?? null

        this.scopeService.initializeEntryScope(organizations, preferredOrganizationId)

        //tenant enabled/disabled features for relatives organizations
        const tenantFeatures = this.user.tenant?.featureOrganizations ?? []
        this.store.featureTenant = tenantFeatures.filter((item) => !item.organizationId)
        this.store.featureContextHydrated = Array.isArray(this.user.tenant?.featureOrganizations)
        this.store.featureContextHydrationLoading = false
        this.store.featureContextHydrationFailed = false

        //only enabled permissions assign to logged in user
        this.store.userRolePermissions = this.user.role.rolePermissions.filter((permission) => permission.enabled)

        if (this.user.preferredLanguage && !this.store.preferredLanguage) {
          this.store.preferredLanguage = this.user.preferredLanguage
        }

        const permissions = this.store.userRolePermissions.map(({ permission }) => permission)
        this.ngxPermissionsService.loadPermissions(permissions)

        this.updateAbility(this.user)

        // Sentry identify user
        Sentry.setUser({ id: this.user.id, email: this.user.email, username: this.user.username })

        if (!this.store.featureContextHydrated) {
          this.store.featureContextHydrationLoading = true
          this.store.featureContextHydrationFailed = false
          this.hydrateCurrentUserContextInBackground(id)
        }
      } else {
        const onboarded = await firstValueFrom(this.tenantService.getOnboard())
        if (onboarded.tenant) {
          this.store.tenantSettings = onboarded.tenant?.settings.reduce((acc, item) => {
            acc[item.name] = item.value
            return acc
          }, {})
        } else if (onboarded.error) {
          this.router.navigate(['/onboarding/unknown'])
          return
        } else {
          this.router.navigate(['/onboarding/'])
          return
        }
      }
    } catch (error) {
      console.log(error)
    }
  }

  private hydrateCurrentUserContextInBackground(userId: string) {
    void this.usersService
      .getMe([...CURRENT_USER_FULL_RELATIONS])
      .then((fullUser) => {
        if (this.store.userId !== userId || !this.store.user) {
          return
        }

        const currentUser = this.store.user
        this.store.user = {
          ...fullUser,
          ...currentUser,
          employee: fullUser.employee ?? currentUser.employee,
          role: fullUser.role ?? currentUser.role,
          tenant: fullUser.tenant ?? currentUser.tenant,
          organizations: fullUser.organizations ?? currentUser.organizations
        }

        const tenantFeatures = fullUser.tenant?.featureOrganizations ?? []
        this.store.featureTenant = tenantFeatures.filter((item) => !item.organizationId)
        this.store.featureContextHydrated = true
        this.store.featureContextHydrationLoading = false
        this.store.featureContextHydrationFailed = false
      })
      .catch((error) => {
        this.store.featureContextHydrationFailed = true
        this.store.featureContextHydrationLoading = false
        console.warn('Deferred current-user hydration failed', error)
      })
  }

  private updateAbility(user: IUser) {
    const { can, rules } = new AbilityBuilder(Ability)

    if (user.role.name === RolesEnum.SUPER_ADMIN) {
      can(AbilityActions.Manage, 'all')
      can(AbilityActions.Manage, 'Organization')
    } else {
      can('read', 'all')
      // can(AbilityActions.Manage, 'Story', { createdById: user.id })

      if (
        user.role.name === RolesEnum.ADMIN ||
        user.role.name === RolesEnum.AI_BUILDER ||
        user.role.name === RolesEnum.ANALYTICS_BUILDER ||
        user.role.name === RolesEnum.TRIAL
      ) {
        can(AbilityActions.Manage, 'Story')
        can(AbilityActions.Create, 'Story')
      }
    }

    this.ability.update(rules)
  }
}
