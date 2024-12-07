import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { nonNullable } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { injectUser, IUser, IXpertWorkspace, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { UserProfileInlineComponent, UserRoleSelectComponent } from 'apps/cloud/src/app/@shared/user'
import { uniqBy } from 'lodash-es'
import { EMPTY, filter, switchMap } from 'rxjs'
import { UserPipe } from 'apps/cloud/src/app/@shared/pipes'

@Component({
  selector: 'xpert-workspace-members',
  standalone: true,
  imports: [CommonModule, UserPipe, TranslateModule, MatTooltipModule, UserProfileInlineComponent],
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss'
})
export class XpertWorkspaceMembersComponent {
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly #dialog = inject(MatDialog)
  readonly me = injectUser()

  // Inputs
  readonly workspace = input<IXpertWorkspace>()

  // States
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly owner = computed(() => this.workspace()?.owner)

  readonly members = signal<IUser[]>([])

  readonly allMembers = computed(() => this.owner() ? [this.owner(), ...this.members()] : this.members())

  private membersSub = toObservable(this.workspaceId)
    .pipe(
      filter(nonNullable),
      switchMap((id) => this.workspaceService.getMembers(id))
    )
    .subscribe((members) => this.members.set(members))

  updateMembers(users: IUser[]) {
    this.members.update((members) => {
      return uniqBy([...members, ...users], 'id')
    })
    return this.workspaceService.updateMembers(
      this.workspaceId(),
      this.members().map((user) => user.id)
    )
  }

  openAddUser() {
    this.#dialog
      .open(UserRoleSelectComponent, {
        data: {}
      })
      .afterClosed()
      .pipe(switchMap((result) => (result ? this.updateMembers(result.users) : EMPTY)))
      .subscribe()
  }

  removeMember(user: IUser) {
    this.members.update((members) => members.filter((m) => m.id !== user.id))
    this.workspaceService.updateMembers(
      this.workspaceId(),
      this.members().map((user) => user.id)
    )
  }
}
