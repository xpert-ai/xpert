import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { injectOrganization, Store } from '@metad/cloud/state'
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs'
import { distinctUntilChanged } from 'rxjs/operators'
import { NgxPermissionsService } from 'ngx-permissions'
import {
  IUser,
  PermissionsEnum,
  ROUTE_ANIMATIONS_ELEMENTS,
  RequestScopeLevel,
  routeAnimations
} from '../../../@core/index'
import { InviteMutationComponent } from '../../../@shared/invite'
import { TranslationBaseComponent } from '../../../@shared/language'
import { SharedUiModule } from '../../../@shared/ui.module'
import { userLabel } from '../../../@shared/pipes'
import { SharedModule } from '../../../@shared/shared.module'
import { UserMutationComponent, UserUploadComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  selector: 'pac-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, SharedUiModule]
})
export class PACUsersComponent<T extends IUser = IUser> extends TranslationBaseComponent {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS
  userLabel = userLabel

  private readonly store = inject(Store)
  private readonly router = inject(Router)
  private readonly _route = inject(ActivatedRoute)
  private readonly _dialog = inject(Dialog)
  private readonly permissionsService = inject(NgxPermissionsService)
  readonly organization = injectOrganization()

  openedLinks = signal<T[]>([])
  currentLink = signal<T | null>(null)
  readonly invitedEvent = new Subject<void>()

  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
  })
  readonly permissions = toSignal(this.permissionsService.permissions$.pipe(distinctUntilChanged()), {
    initialValue: this.permissionsService.getPermissions()
  })
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly canManageInvites = computed(() => {
    this.activeScope()
    this.permissions()

    return [PermissionsEnum.ORG_INVITE_VIEW, PermissionsEnum.ORG_INVITE_EDIT].some((permission) =>
      this.store.hasPermission(permission)
    )
  })
  readonly canCreateUsers = computed(
    () => {
      this.permissions()
      return this.isTenantScope() && this.store.hasPermission(PermissionsEnum.ALL_ORG_EDIT)
    }
  )
  readonly canBatchImport = this.canCreateUsers
  readonly canInviteUsers = computed(
    () => !this.isTenantScope() && !!this.organization()?.id && this.canManageInvites()
  )
  readonly showInviteTab = computed(
    () => !this.isTenantScope() && this.canManageInvites()
  )

  readonly refresh$ = new BehaviorSubject<void>(null)

  constructor() {
    super()

    effect(
      () => {
        if (this.currentLink()) {
          const links = this.openedLinks()
          const index = links.findIndex((item) => item.id === this.currentLink().id)
          if (index > -1) {
            if (links[index] !== this.currentLink()) {
              this.openedLinks.set([...links.slice(0, index), this.currentLink(), ...links.slice(index + 1)])
            }
          } else {
            this.openedLinks.set([...links, this.currentLink()])
          }
        }
      }
    )

    effect(
      () => {
        const scopeLevel = this.activeScope().level
        const childPath = this._route.firstChild?.snapshot.routeConfig?.path ?? ''

        if (scopeLevel !== RequestScopeLevel.TENANT && this.currentLink()) {
          this.currentLink.set(null)
        }

        const shouldResetToList =
          (scopeLevel === RequestScopeLevel.TENANT && childPath === 'invites') ||
          (scopeLevel === RequestScopeLevel.ORGANIZATION && childPath === ':id')

        if (!shouldResetToList) {
          return
        }

        queueMicrotask(() => {
          void this.router.navigate(['.'], { relativeTo: this._route, replaceUrl: true })
        })
      },
      { allowSignalWrites: true }
    )
  }

  trackById(index: number, item: T) {
    return item?.id
  }

  setCurrentLink(link: T) {
    this.currentLink.set(link)
  }

  removeOpenedLink(event: Event, link: T) {
    event.preventDefault()
    event.stopPropagation()
    this.currentLink.set(null)
    this.openedLinks.set(this.openedLinks().filter((item) => item.id !== link.id))
    this.router.navigate(['.'], { relativeTo: this._route })
  }

  navUser(user: IUser) {
    if (!this.isTenantScope()) {
      return
    }

    this.router.navigate(['/settings/users/', user.id])
  }

  async invite() {
    if (!this.canInviteUsers()) {
      return
    }

    const result = await firstValueFrom(
      this._dialog.open<{ total: number }>(InviteMutationComponent, {
        disableClose: true
      }).closed
    )

    if (result?.total) {
      this.invitedEvent.next()
    }
  }

  async addUser() {
    if (!this.canCreateUsers()) {
      return
    }

    const result = await firstValueFrom(
      this._dialog.open<{user: IUser;}>(UserMutationComponent, { 
        disableClose: true,
        data: { isAdmin: true }
      }).closed
    )
    if (result?.user) {
      this.router.navigate(['.', result.user.id], { relativeTo: this._route })
    }
  }

  batImport() {
    if (!this.canBatchImport()) {
      return
    }

    this._dialog.open(UserUploadComponent, {disableClose: true}).closed.subscribe({
      next: (users) => {
        if (users) {
          this.refresh$.next()
        }
      }
    })
  }
}
