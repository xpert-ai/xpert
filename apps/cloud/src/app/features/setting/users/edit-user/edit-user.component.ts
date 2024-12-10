import { Component, OnDestroy, effect, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { Store, UsersService } from '@metad/cloud/state'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { RolesEnum, routeAnimations } from '../../../../@core'
import { PACUserOrganizationsComponent } from '../organizations/organizations.component'
import { UserBasicComponent } from '../user-basic/user-basic.component'
import { PACUsersComponent } from '../users.component'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'

@Component({
  standalone: true,
  selector: 'pac-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.scss'],
  animations: [routeAnimations],
  imports: [SharedModule, MaterialModule, UserBasicComponent, PACUserOrganizationsComponent]
})
export class PACEditUserComponent implements OnDestroy {
  RolesEnum = RolesEnum

  readonly store = inject(Store)
  private userService = inject(UsersService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private usersComponent = inject(PACUsersComponent)

  readonly me = this.store.user

  public readonly userId$ = this.route.params.pipe(
    startWith(this.route.snapshot.params),
    map((params) => params?.id),
    filter((id) => !!id),
    distinctUntilChanged()
  )

  public readonly user = toSignal(this.userId$.pipe(switchMap((userId) => this.userService.getUserById(userId))))

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

  ngOnDestroy(): void {
    this.usersComponent.setCurrentLink(null)
  }
}
