import { CdkDragDrop } from '@angular/cdk/drag-drop'
import { Component, inject } from '@angular/core'
import { FormControl } from '@angular/forms'
import { MatButtonToggleChange } from '@angular/material/button-toggle'
import { MatDialog } from '@angular/material/dialog'
import { IModelRole, MDX, RoleTypeEnum } from 'apps/cloud/src/app/@core'
import { combineLatestWith, debounceTime, map, startWith, withLatestFrom } from 'rxjs/operators'
import { AccessControlStateService } from '../../access-control.service'
import { RoleStateService } from '../role.service'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserRoleSelectComponent } from 'apps/cloud/src/app/@shared/user'


@Component({
  selector: 'pac-model-access-role-overview',
  templateUrl: 'overview.component.html',
  styleUrls: ['overview.component.scss']
})
export class RoleOverviewComponent {
  Access = MDX.Access
  RoleTypeEnum = RoleTypeEnum

  private roleState = inject(RoleStateService)
  private accessControlState = inject(AccessControlStateService)
  private _dialog = inject(MatDialog)

  searchControl = new FormControl()
  displayedColumns: string[] = ['user', 'action']
  // Union role
  roleUsagesColumns = ['sort', 'name', 'type', 'action']

  public role: IModelRole
  public readonly schemaGrantAccess$ = this.roleState.schemaGrant$.pipe(map((schemaGrant) => schemaGrant?.access))
  public readonly users$ = this.roleState.roleUsers$.pipe(
    combineLatestWith(this.searchControl.valueChanges.pipe(debounceTime(300), startWith(''))),
    map(([users, text]) => {
      if (text.trim()) {
        text = text.trim().toLowerCase()
        return users.filter((user) => userLabel(user).toLowerCase().includes(text))
      }

      return users
    })
  )

  public readonly roleUsages$ = this.roleState.roleUsages$.pipe(
    withLatestFrom(this.accessControlState.roles$),
    map(([roleUsages, roles]) => roleUsages.map((roleUsage) => roles.find((item) => item.name === roleUsage)))
  )

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private roleSub = this.roleState.state$.pipe(takeUntilDestroyed()).subscribe((role) => {
    this.role = role
  })

  onAddUser() {
    this._dialog
      .open(UserRoleSelectComponent)
      .afterClosed()
      .subscribe((value) => {
        if (value) {
          this.roleState.addUsers(value.users)
        }
      })
  }

  changeAccess(event: MatButtonToggleChange) {
    this.roleState.updateSchemaGrant({
      access: event.value
    })
  }

  removeUser(id: string) {
    this.roleState.removeUser(id)
  }

  dropRole(event: CdkDragDrop<any[]>) {
    if (event.container === event.previousContainer) {
      this.roleState.moveItemInRoleUsages(event)
    } else {
      this.roleState.addRoleUsage({ roleName: event.item.data.name, currentIndex: event.currentIndex })
    }
  }

  removeRoleUsage(name: string) {
    this.roleState.removeRoleUsage(name)
  }
}
