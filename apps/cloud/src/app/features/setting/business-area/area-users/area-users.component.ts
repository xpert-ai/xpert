import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { BusinessAreaUserService } from '@metad/cloud/state'
import { BusinessAreaRole, IBusinessAreaUser, IUser } from '@metad/contracts'
import { NgmConfirmDeleteComponent, NgmSearchComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService } from 'apps/cloud/src/app/@core'
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  combineLatestWith,
  debounceTime,
  firstValueFrom,
  map,
  shareReplay,
  startWith,
  switchMap
} from 'rxjs'
import { EditBusinessAreaComponent } from '../business-area/business-area.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent, UserRoleSelectComponent } from 'apps/cloud/src/app/@shared/user'
import { Dialog } from '@angular/cdk/dialog'

@Component({
  standalone: true,
  selector: 'pac-area-users',
  templateUrl: './area-users.component.html',
  styleUrls: ['./area-users.component.scss'],
  imports: [
    CommonModule,
    MaterialModule,
    TranslateModule,
    UserProfileInlineComponent,
    NgmSearchComponent,
    NgmTableComponent
  ]
})
export class BusinessAreaUsersComponent extends TranslationBaseComponent {
  BusinessAreaRole = BusinessAreaRole
  userLabel = userLabel

  private _toastrService = inject(ToastrService)
  readonly #dialog = inject(Dialog)

  searchControl = new FormControl()

  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly businessAreaUsers$: Observable<Array<IBusinessAreaUser & { loading?: boolean }>> = combineLatest([
    toObservable(this.areaComponent.businessAreaId),
    this.refresh$
  ]).pipe(
    switchMap(([businessAreaId]) =>
      this.businessAreaUserService.getAllByBusinessArea(businessAreaId, ['user', 'businessArea'])
    ),
    map((users) =>
      users.map((user) => ({
        ...user,
        user: {
          ...user.user,
          fullName: userLabel(user.user)
        }
      }))
    ),
    combineLatestWith(this.searchControl.valueChanges.pipe(debounceTime(200), startWith(''))),
    map(([users, text]) => {
      if (text) {
        text = text.trim().toLowerCase()
        return users.filter((user) => user.user.fullName.toLowerCase().includes(text))
      }
      return users
    }),
    shareReplay(1)
  )

  public readonly businessArea = this.areaComponent.businessArea
  constructor(
    private areaComponent: EditBusinessAreaComponent,
    private businessAreaUserService: BusinessAreaUserService,
    private _dialog: MatDialog
  ) {
    super()
  }

  async removeUser(id: string, user: IUser) {
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: userLabel(user) } }).afterClosed()
    )
    if (confirm) {
      try {
        await firstValueFrom(this.businessAreaUserService.delete(id))
        this.refresh$.next()
        this._toastrService.success('PAC.BUSINESS_AREA.RemoveUser', { Default: 'Remove User' })
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }

  async addUser(businessArea, users) {
    try {
      await firstValueFrom(
        this.businessAreaUserService.createBatch(
          businessArea.id,
          users.map(({ id, role }) => ({ id, role }))
        )
      )

      this.refresh$.next()
    } catch (err) {
      this._toastrService.error(err)
    }
  }

  async openUserSelect() {
    const modelerLabel = this.getTranslation('PAC.BUSINESS_AREA.BusinessAreaRole', {
      Default: { Modeler: 'Modeler', Viewer: 'Viewer' }
    })
    const value = await firstValueFrom(
      this.#dialog
        .open<{users: IUser[]; role: string;}>(UserRoleSelectComponent, {
          data: {
            roles: [
              {
                value: BusinessAreaRole.Modeler,
                label: modelerLabel.Modeler
              },
              {
                value: BusinessAreaRole.Viewer,
                label: modelerLabel.Viewer
              }
            ]
          }
        })
        .closed
    )
    if (value) {
      const businessArea = this.businessArea()
      this.addUser(
        businessArea,
        value.users.map((user) => ({ ...user, role: value.role }))
      )
    }
  }
}
