import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { nonNullable } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { injectUser, IUser, IXpertProject, XpertProjectService } from 'apps/cloud/src/app/@core'
import { UserPipe } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent, UserRoleSelectComponent } from 'apps/cloud/src/app/@shared/user'
import { uniqBy } from 'lodash-es'
import { EMPTY, filter, switchMap } from 'rxjs'

@Component({
  selector: 'chat-project-members',
  standalone: true,
  imports: [CommonModule, UserPipe, TranslateModule, MatTooltipModule, UserProfileInlineComponent],
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss'
})
export class ChatProjectMembersComponent {
  readonly projectsService = inject(XpertProjectService)
  readonly #dialog = inject(Dialog)
  readonly me = injectUser()

  // Inputs
  readonly project = input<Partial<IXpertProject>>()

  // States
  readonly projectId = computed(() => this.project()?.id)
  readonly owner = computed(() => this.project()?.owner)

  readonly members = signal<IUser[]>([])

  readonly allMembers = computed(() => (this.owner() ? [this.owner(), ...this.members()] : this.members()))

  private membersSub = toObservable(this.projectId)
    .pipe(
      filter(nonNullable),
      switchMap((id) => this.projectsService.getMembers(id))
    )
    .subscribe((members) => this.members.set(members))
  
  // constructor() {
  //   effect(() => {
  //     console.log(this.owner())
  //   })
  // }

  updateMembers(users: IUser[]) {
    this.members.update((members) => {
      return uniqBy([...members, ...users], 'id')
    })
    return this.projectsService.updateMembers(
      this.projectId(),
      this.members().map((user) => user.id)
    )
  }

  openAddUser() {
    this.#dialog
      .open<{ users: IUser[] }>(UserRoleSelectComponent, {
        data: {}
      })
      .closed.pipe(switchMap((result) => (result ? this.updateMembers(result.users) : EMPTY)))
      .subscribe()
  }

  removeMember(user: IUser) {
    this.members.update((members) => members.filter((m) => m.id !== user.id))
    this.projectsService
      .updateMembers(
        this.projectId(),
        this.members().map((user) => user.id)
      )
      .subscribe()
  }
}
