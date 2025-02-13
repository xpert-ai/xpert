import { Component, inject } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { ToastrService, UsersService } from '@metad/cloud/state'
import { IUser, RolesEnum } from '@metad/contracts'
import { NgmConfirmDeleteComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { MtxCheckboxGroupModule } from '@ng-matero/extensions/checkbox-group'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { includes } from 'lodash-es'
import { BehaviorSubject, firstValueFrom, map, startWith, switchMap } from 'rxjs'
import { PACUsersComponent } from '../users.component'
import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { RouterModule } from '@angular/router'
import { CdkMenuModule } from '@angular/cdk/menu'

@Component({
  standalone: true,
  selector: 'pac-manage-user',
  templateUrl: './manage-user.component.html',
  styleUrls: ['./manage-user.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    // Standard components
    MtxCheckboxGroupModule,
    // OCAP Modules
    OcapCoreModule,
    UserProfileInlineComponent,
    NgmSearchComponent,
    UserProfileInlineComponent
  ]
})
export class ManageUserComponent extends TranslationBaseComponent {
  private usersComponent = inject(PACUsersComponent)
  private userService = inject(UsersService)
  private _dialog = inject(MatDialog)
  private toastrService = inject(ToastrService)

  ROLES = Object.keys(RolesEnum)
  roles$ = new BehaviorSubject<string[]>([])
  get roles() {
    return this.roles$.value
  }
  set roles(value) {
    this.roles$.next(value)
  }

  private search$ = new BehaviorSubject<string>('')
  get search() {
    return this.search$.value
  }
  set search(value) {
    this.search$.next(value)
  }

  private refresh$ = new BehaviorSubject<void>(null)
  public readonly users$ = this.refresh$.pipe(
    switchMap(() => this.userService.getAll(['role'])),
    switchMap((users) =>
      this.roles$.pipe(
        map((roles) => (roles?.length ? users.filter((user) => includes(roles, user.role.name)) : users))
      )
    ),
    switchMap((users) => {
      return this.search$.pipe(
        startWith(this.search),
        map((text: string) => {
          text = text?.toLowerCase()
          return text
            ? users.filter(
                (user) =>
                  user.name?.toLowerCase().includes(text) ||
                  user.lastName?.toLowerCase().includes(text) ||
                  user.firstName?.toLowerCase().includes(text) ||
                  user.email?.toLowerCase().includes(text)
              )
            : users
        })
      )
    })
  )

  async add() {
    await this.usersComponent.addUser()
  }

  /**
   * 对比下面函数的写法
   */
  async remove(user: IUser) {
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: userLabel(user) } }).afterClosed()
    )
    if (confirm) {
      try {
        await firstValueFrom(this.userService.delete(user.id,))
        this.toastrService.success('PAC.NOTES.USERS.UserDelete', {
          name: userLabel(user)
        })
        this.refresh$.next()
      } catch (err) {
        this.toastrService.error('PAC.NOTES.USERS.UserDelete', '', {
          name: userLabel(user)
        })
      }
    }
  }
}
