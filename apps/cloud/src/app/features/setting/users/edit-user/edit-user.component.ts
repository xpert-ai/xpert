import { CommonModule } from '@angular/common'
import { Component, effect, inject, OnDestroy, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { Store, UsersService } from '@metad/cloud/state'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { of } from 'rxjs'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { getErrorMessage, injectToastr, RolesEnum, routeAnimations } from '../../../../@core'
import { PACUserOrganizationsComponent } from '../organizations/organizations.component'
import { UserBasicComponent } from '../user-basic/user-basic.component'
import { PACUsersComponent } from '../users.component'

@Component({
  standalone: true,
  selector: 'pac-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.scss'],
  animations: [routeAnimations],
  imports: [CommonModule, TranslateModule, NgmSpinComponent, UserBasicComponent, PACUserOrganizationsComponent]
})
export class PACEditUserComponent implements OnDestroy {
  RolesEnum = RolesEnum

  readonly store = inject(Store)
  private userService = inject(UsersService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private toastr = injectToastr()
  private usersComponent = inject(PACUsersComponent)
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()

  readonly me = this.store.user

  public readonly userId$ = this.route.params.pipe(
    startWith(this.route.snapshot.params),
    map((params) => params?.id),
    filter((id) => !!id),
    distinctUntilChanged()
  )

  public readonly user = toSignal(this.userId$.pipe(switchMap((userId) => this.userService.getUserById(userId))))

  readonly loading = signal(false)

  constructor() {
    effect(
      () => {
        this.usersComponent.setCurrentLink(this.user())
      },
      { allowSignalWrites: true }
    )
  }

  navigate(url) {
    this.router.navigate([url], { relativeTo: this.route })
  }

  deleteUser() {
    this.confirmDelete(
      {
        value: userLabel(this.user()),
        information: this.#translate.instant('PAC.USERS_PAGE.DeleteUserDesc', {
          Default: 'Delete this user and its associated data'
        })
      },
      of(true).pipe(
        switchMap(() => {
          this.loading.set(true)
          return this.userService.delete(this.user().id)
        })
      )
    ).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastr.success('PAC.USERS_PAGE.UserDeletedSuccessfully', { Default: 'User deleted successfully' })
        this.router.navigate(['..'], { relativeTo: this.route })
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
  }

  ngOnDestroy(): void {
    this.usersComponent.setCurrentLink(null)
  }
}
