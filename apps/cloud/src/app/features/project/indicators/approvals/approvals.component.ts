import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { ToastrService } from '@metad/cloud/state'
import { ButtonGroupDirective, DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  PermissionApprovalService,
  PermissionApprovalStatus,
  PermissionApprovalStatusTypesEnum,
  getDateLocale
} from 'apps/cloud/src/app/@core'
import { formatRelative } from 'date-fns'
import { assign, isNil, omitBy } from 'lodash-es'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { combineLatestWith, map, switchMap, tap } from 'rxjs/operators'
import { userLabel, UserPipe } from '../../../../@shared/pipes/'
import { UserAvatarComponent } from '../../../../@shared/user'
import { ProjectComponent } from '../../project/project.component'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

@Component({
  standalone: true,
  selector: 'pac-indicator-approvals',
  templateUrl: 'approvals.component.html',
  styleUrls: ['approvals.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    MaterialModule,
    ButtonGroupDirective,
    DensityDirective,
    UserPipe,
    UserAvatarComponent,
    NgmTableComponent
  ]
})
export class ApprovalsComponent extends TranslationBaseComponent {
  DisplayDensity = DisplayDensity
  PermissionApprovalStatus = PermissionApprovalStatus
  userLabel = userLabel

  private permissionApprovalService = inject(PermissionApprovalService)
  private toastrService = inject(ToastrService)
  private projectComponent = inject(ProjectComponent)

  public loading = false

  private action$ = new BehaviorSubject<{ id: string; loading: boolean; status?: PermissionApprovalStatusTypesEnum }>(
    null
  )
  public readonly approvals$ = this.projectComponent.projectId$.pipe(
    tap(() => (this.loading = true)),
    switchMap((projectId) =>
      this.permissionApprovalService.getAllByProject(projectId, ['indicator', 'userApprovals', 'userApprovals.user'])
    ),
    tap(() => (this.loading = false)),
    combineLatestWith(this.action$),
    map(([{ items }, action]) => {
      if (action) {
        const item = items.find((item) => item.id === action.id)
        if (item) {
          assign(item, omitBy(action, isNil))
        }
      }
      return items
    })
  )

  getDateAtPipe() {
    const currentLang = this.translateService.currentLang
    return (value: string) => {
      return formatRelative(new Date(value), new Date(), { locale: getDateLocale(currentLang) })
    }
  }

  async approval(id: string) {
    this.action$.next({
      id,
      loading: true
    })

    try {
      await firstValueFrom(this.permissionApprovalService.approval(id))
      this.action$.next({
        id,
        loading: false,
        status: PermissionApprovalStatusTypesEnum.APPROVED
      })
    } catch (err) {
      this.toastrService.error('更新')
      this.action$.next({
        id,
        loading: false
      })
    }
  }

  async refuse(id: string) {
    this.action$.next({
      id,
      loading: true
    })

    try {
      await firstValueFrom(this.permissionApprovalService.refuse(id))
      this.action$.next({
        id,
        loading: false,
        status: PermissionApprovalStatusTypesEnum.REFUSED
      })
    } catch (err) {
      this.toastrService.error(err)
      this.action$.next({
        id,
        loading: false
      })
    }
  }
}
