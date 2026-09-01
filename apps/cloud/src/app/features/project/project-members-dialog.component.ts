import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type {
  IXpertProjectInvitation,
  IUser,
  TXpertProjectMemberRole,
  TXpertProjectMemberSummary
} from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, ToastrService } from '../../@core'
import { UsersOrganizationsService } from '../../@core/services/users-organizations.service'
import { XpertProjectApiService } from './project-api.service'

type ProjectMembersDialogData = {
  projectId: string
  canTransferOwnership: boolean
  canInviteOrganizationMembers: boolean
}

@Component({
  standalone: true,
  selector: 'xp-project-members-dialog',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <section class="flex max-h-[84vh] min-w-0 flex-col">
      <header class="flex items-start justify-between border-b border-divider-subtle pb-4">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">{{ 'XP.XProject.ProjectMembers' | translate }}</h2>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectMembersDescription' | translate }}</p>
        </div>
        <button z-button zType="ghost" zSize="sm" type="button" (click)="close()">
          <i class="ri-close-line"></i>
        </button>
      </header>

      <div class="min-h-0 space-y-6 overflow-y-auto py-5">
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold text-text-primary">{{ 'XP.XProject.CurrentMembers' | translate }}</h3>
            <z-badge zType="outline">{{ members().length }}</z-badge>
          </div>
          <div class="divide-y divide-divider-subtle rounded-xl border border-divider-subtle">
            @for (member of members(); track member.id) {
              <div class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-text-primary">{{ displayUser(member) }}</p>
                  <p class="truncate text-xs text-text-tertiary">{{ member.email }}</p>
                </div>
                <div class="flex items-center gap-2">
                  @if (member.projectRole === 'owner') {
                    <z-badge zType="secondary">{{ 'XP.XProject.RoleOwner' | translate }}</z-badge>
                  } @else {
                    @if (data.canTransferOwnership) {
                      <button
                        z-button
                        zType="outline"
                        zSize="sm"
                        type="button"
                        [disabled]="busy()"
                        (click)="transferOwnership(member)"
                      >
                        {{ 'XP.XProject.TransferOwnership' | translate }}
                      </button>
                    }
                    <z-select
                      class="w-32"
                      [zValue]="member.projectRole"
                      [zDisabled]="busy()"
                      (zSelectionChange)="changeRole(member, $event)"
                    >
                      @for (role of roles; track role) {
                        <z-select-item [zValue]="role">{{ roleLabel(role) | translate }}</z-select-item>
                      }
                    </z-select>
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-label]="'XP.XProject.RemoveMember' | translate"
                      (click)="remove(member)"
                    >
                      <i class="ri-delete-bin-line text-text-destructive"></i>
                    </button>
                  }
                </div>
              </div>
            } @empty {
              <p class="p-5 text-center text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectMembers' | translate }}</p>
            }
          </div>
        </section>

        <section class="space-y-3 border-t border-divider-subtle pt-5">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">
              {{ 'XP.XProject.AddOrganizationMember' | translate }}
            </h3>
            <p class="mt-1 text-xs text-text-secondary">
              {{ 'XP.XProject.AddOrganizationMemberDescription' | translate }}
            </p>
          </div>
          <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <z-select
              [zValue]="selectedUserId()"
              [zDisabled]="busy() || !availableUsers().length"
              [zPlaceholder]="'XP.XProject.SelectMember' | translate"
              (zSelectionChange)="selectUser($event)"
            >
              @for (user of availableUsers(); track user.id) {
                <z-select-item [zValue]="user.id">{{ displayUser(user) }}</z-select-item>
              }
            </z-select>
            <z-select [zValue]="selectedRole()" [zDisabled]="busy()" (zSelectionChange)="selectRole($event)">
              @for (role of roles; track role) {
                <z-select-item [zValue]="role">{{ roleLabel(role) | translate }}</z-select-item>
              }
            </z-select>
            <button z-button zType="default" type="button" [disabled]="busy() || !selectedUserId()" (click)="add()">
              {{ 'XP.XProject.AddMember' | translate }}
            </button>
          </div>
        </section>

        <section class="space-y-3 border-t border-divider-subtle pt-5">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">{{ 'XP.XProject.InviteByEmail' | translate }}</h3>
            <p class="mt-1 text-xs text-text-secondary">{{ 'XP.XProject.InviteByEmailDescription' | translate }}</p>
          </div>
          @if (data.canInviteOrganizationMembers) {
            <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <input
                z-input
                type="email"
                [ngModel]="inviteEmail()"
                (ngModelChange)="inviteEmail.set($event)"
                [placeholder]="'XP.XProject.EmailAddress' | translate"
              />
              <z-select [zValue]="inviteRole()" [zDisabled]="busy()" (zSelectionChange)="selectInviteRole($event)">
                @for (role of roles; track role) {
                  <z-select-item [zValue]="role">{{ roleLabel(role) | translate }}</z-select-item>
                }
              </z-select>
              <button
                z-button
                zType="outline"
                type="button"
                [disabled]="busy() || !inviteEmail().trim()"
                (click)="invite()"
              >
                {{ 'XP.XProject.SendInvitation' | translate }}
              </button>
            </div>
          } @else {
            <p
              class="rounded-lg border border-divider-subtle bg-background-default-subtle p-3 text-xs text-text-secondary"
            >
              {{ 'XP.XProject.OrganizationInvitationPermissionRequired' | translate }}
            </p>
          }
          @if (pendingInvitations().length) {
            <div class="space-y-2 rounded-xl border border-divider-subtle p-3">
              @for (invitation of pendingInvitations(); track invitation.id) {
                <div class="flex items-center justify-between gap-3 text-xs">
                  <span class="min-w-0 truncate text-text-secondary">{{ invitation.email }}</span>
                  <div class="flex items-center gap-2">
                    <z-badge zType="outline">{{ roleLabel(invitation.role) | translate }}</z-badge>
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      [disabled]="busy()"
                      (click)="revoke(invitation)"
                    >
                      {{ 'XP.XProject.RevokeInvitation' | translate }}
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </section>
      </div>

      <footer class="flex justify-end border-t border-divider-subtle pt-4">
        <button z-button zType="outline" type="button" (click)="close()">{{ 'XP.XProject.Done' | translate }}</button>
      </footer>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectMembersDialogComponent {
  readonly #dialogRef = inject<ZardDialogRef<XpertProjectMembersDialogComponent>>(ZardDialogRef)
  readonly #api = inject(XpertProjectApiService)
  readonly #organizationMembers = inject(UsersOrganizationsService)
  readonly #toastr = inject(ToastrService)
  readonly data = inject<ProjectMembersDialogData>(Z_MODAL_DATA)
  readonly roles: TXpertProjectMemberRole[] = ['manager', 'editor', 'member']
  readonly members = signal<TXpertProjectMemberSummary[]>([])
  readonly organizationUsers = signal<IUser[]>([])
  readonly invitations = signal<IXpertProjectInvitation[]>([])
  readonly selectedUserId = signal('')
  readonly selectedRole = signal<TXpertProjectMemberRole>('member')
  readonly inviteEmail = signal('')
  readonly inviteRole = signal<TXpertProjectMemberRole>('member')
  readonly busy = signal(false)
  readonly availableUsers = computed(() => {
    const memberIds = new Set(this.members().map((member) => member.id))
    return this.organizationUsers().filter((user) => !memberIds.has(user.id))
  })
  readonly pendingInvitations = computed(() => this.invitations().filter((item) => item.status === 'pending'))

  constructor() {
    void this.load()
  }

  async load() {
    this.busy.set(true)
    try {
      const [members, invitations, organizationMemberships] = await Promise.all([
        firstValueFrom(this.#api.members(this.data.projectId)),
        firstValueFrom(this.#api.invitations(this.data.projectId)),
        firstValueFrom(this.#organizationMembers.getAllInOrg(['user'], { isActive: true }))
      ])
      this.members.set(members)
      this.invitations.set(invitations)
      this.organizationUsers.set(
        organizationMemberships.items.map((item) => item.user).filter((user): user is IUser => !!user)
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  selectUser(value: string | number | Array<string | number>) {
    this.selectedUserId.set(normalizeSelection(value))
  }

  selectRole(value: string | number | Array<string | number>) {
    this.selectedRole.set(normalizeRole(value))
  }

  selectInviteRole(value: string | number | Array<string | number>) {
    this.inviteRole.set(normalizeRole(value))
  }

  async add() {
    const userId = this.selectedUserId()
    if (!userId) return
    await this.runMutation(async () => {
      await firstValueFrom(this.#api.addMember(this.data.projectId, { userId, role: this.selectedRole() }))
      this.selectedUserId.set('')
      await this.load()
    })
  }

  async changeRole(member: TXpertProjectMemberSummary, value: string | number | Array<string | number>) {
    if (member.projectRole === 'owner') return
    const role = normalizeRole(value)
    if (role === member.projectRole) return
    await this.runMutation(async () => {
      await firstValueFrom(this.#api.updateMember(this.data.projectId, member.id, role))
      this.members.update((items) =>
        items.map((item) => (item.id === member.id ? { ...item, projectRole: role } : item))
      )
    })
  }

  async remove(member: TXpertProjectMemberSummary) {
    if (member.projectRole === 'owner') return
    await this.runMutation(async () => {
      await firstValueFrom(this.#api.removeMember(this.data.projectId, member.id))
      this.members.update((items) => items.filter((item) => item.id !== member.id))
    })
  }

  async transferOwnership(member: TXpertProjectMemberSummary) {
    if (!this.data.canTransferOwnership || member.projectRole === 'owner') return
    const confirmed = await firstValueFrom(
      this.#toastr.confirm({
        code: 'XP.XProject.TransferOwnershipConfirmation',
        params: { name: this.displayUser(member) }
      })
    )
    if (!confirmed) return
    await this.runMutation(async () => {
      await firstValueFrom(this.#api.transferOwnership(this.data.projectId, member.id))
      this.#dialogRef.close()
    })
  }

  async invite() {
    if (!this.data.canInviteOrganizationMembers) return
    const email = this.inviteEmail().trim()
    if (!email) return
    await this.runMutation(async () => {
      const invitation = await firstValueFrom(this.#api.invite(this.data.projectId, { email, role: this.inviteRole() }))
      this.invitations.update((items) => [
        invitation,
        ...items.filter((item) => item.normalizedEmail !== invitation.normalizedEmail)
      ])
      this.inviteEmail.set('')
    })
  }

  async revoke(invitation: IXpertProjectInvitation) {
    await this.runMutation(async () => {
      await firstValueFrom(this.#api.revokeInvitation(this.data.projectId, invitation.id))
      this.invitations.update((items) => items.filter((item) => item.id !== invitation.id))
    })
  }

  roleLabel(role: 'owner' | TXpertProjectMemberRole) {
    return `XP.XProject.Role${role.charAt(0).toUpperCase()}${role.slice(1)}`
  }

  displayUser(user: IUser) {
    return user.fullName || user.username || user.email || user.id
  }

  close() {
    this.#dialogRef.close()
  }

  private async runMutation(operation: () => Promise<void>) {
    this.busy.set(true)
    try {
      await operation()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}

function normalizeSelection(value: string | number | Array<string | number>) {
  const selected = Array.isArray(value) ? value[0] : value
  return selected == null ? '' : String(selected)
}

function normalizeRole(value: string | number | Array<string | number>): TXpertProjectMemberRole {
  const selected = normalizeSelection(value)
  return selected === 'manager' || selected === 'editor' ? selected : 'member'
}
