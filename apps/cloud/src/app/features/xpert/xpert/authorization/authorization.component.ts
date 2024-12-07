import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, injectToastr, injectUser, injectWorkspaceService, injectXpertService, IUser } from 'apps/cloud/src/app/@core'
import { UserProfileInlineComponent, UserRoleSelectComponent } from 'apps/cloud/src/app/@shared'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import { XpertComponent } from '../xpert.component'
import { derivedAsync } from 'ngxtension/derived-async'

@Component({
  standalone: true,
  selector: 'xpert-authorization',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    DragDropModule,
    MatTooltipModule,
    NgmSpinComponent,
    UserProfileInlineComponent
  ]
})
export class XpertAuthorizationComponent {
  readonly xpertService = injectXpertService()
  readonly workspaceService = injectWorkspaceService()
  readonly xpertComponent = inject(XpertComponent)
  readonly me = injectUser()
  readonly #dialog = inject(MatDialog)
  readonly #toastr = injectToastr()

  readonly xpert = this.xpertComponent.xpert
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly #managers = signal<IUser[]>([])
  readonly loading = signal(false)

  readonly managersSub = this.refresh$
    .pipe(switchMap(() => this.xpertService.getXpertManagers(this.xpertComponent.xpertId())))
    .subscribe((value) => {
      this.#managers.set(value)
    })

  readonly workspaceMembers = derivedAsync(() => {
    return this.workspaceId() ? this.workspaceService.getMembers(this.workspaceId()) : null
  })

  readonly members = computed(() => {
    return [
      ...(this.workspaceMembers() ?? []).map((u) => ({type: 'workspace', user: u})),
      ...(this.#managers() ?? []).map((u) => ({type: 'manager', user: u})),
    ]
  })

  openAddUser() {
    this.#dialog
      .open(UserRoleSelectComponent, {
        data: {}
      })
      .afterClosed()
      .pipe(switchMap((result) => (result ? this.addManagers(result.users) : EMPTY)))
      .subscribe()
  }

  addManagers(users: IUser[]) {
    this.loading.set(true)
    const newMembers = users.filter((u) => !this.members().some((_) => _.user.id === u.id))
    this.#managers.update((state) => {
      return [...state, ...newMembers]
    })
    return this.xpertService.updateXpertManagers(
      this.xpertComponent.xpertId(),
      this.#managers().map((u) => u.id)
    ).pipe(
      tap({
        next: () => {
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
    )
  }

  removeManager(u: IUser) {
    this.loading.set(true)
    this.xpertService.removeXpertManager(this.xpertComponent.xpertId(), u.id).subscribe({
      next: () => {
        this.#managers.update((state) => state.filter((_) => _.id !== u.id))
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
