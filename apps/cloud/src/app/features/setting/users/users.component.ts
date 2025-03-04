import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { injectOrganization, Store } from '@metad/cloud/state'
import { BehaviorSubject, Subject, firstValueFrom, map } from 'rxjs'
import { Group, IUser, ROUTE_ANIMATIONS_ELEMENTS, routeAnimations } from '../../../@core/index'
import { InviteMutationComponent } from '../../../@shared/invite'
import { TranslationBaseComponent } from '../../../@shared/language'
import { MaterialModule } from '../../../@shared/material.module'
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
  imports: [SharedModule, MaterialModule]
})
export class PACUsersComponent<T extends IUser = IUser> extends TranslationBaseComponent {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS
  userLabel = userLabel

  private readonly store = inject(Store)
  private router = inject(Router)
  private _route = inject(ActivatedRoute)
  private _dialog = inject(Dialog)
  readonly organization = injectOrganization()

  openedLinks = signal<T[]>([])
  currentLink = signal<T | null>(null)

  public readonly organizationName$ = this.store.selectedOrganization$.pipe(map((org) => org?.name))

  public readonly invitedEvent = new Subject<void>()

  readonly invitesAllowed = computed(() => this.organization()?.invitesAllowed)

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

  removeOpenedLink(link: T) {
    this.currentLink.set(null)
    this.openedLinks.set(this.openedLinks().filter((item) => item.id !== link.id))
    this.router.navigate(['.'], { relativeTo: this._route })
  }

  checkChange(e: boolean): void {
    console.log(e)
  }

  navUser(user: IUser) {
    this.router.navigate(['/settings/users/', user.id])
  }

  navGroup(group: Group) {
    this.router.navigate(['/settings/groups/', group.id])
  }

  manageInvites() {
    this.router.navigate(['/settings/users/invites/'])
  }

  async invite() {
    const result = await firstValueFrom(this._dialog.open<{total: number}>(InviteMutationComponent).closed)

    // Number of successful invites
    if (result?.total) {
      this.invitedEvent.next()
      this.router.navigate(['invites'], { relativeTo: this._route })
    }
  }

  async addUser() {
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
    this._dialog.open(UserUploadComponent, {disableClose: true}).closed.subscribe({
      next: (users) => {
        if (users) {
          this.refresh$.next()
        }
      }
    })
  }
}
