import { CdkMenuModule } from '@angular/cdk/menu'
import { Dialog, DialogModule } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core'
import { Router, RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ChatConversationService, IChatConversation, getErrorMessage } from '../../@core'
import { formatConversationUpdatedAt } from './cloud-sidebar-assistants.utils'

@Component({
  standalone: true,
  selector: 'xp-sidebar-conversation',
  imports: [CdkMenuModule, DialogModule, RouterModule, TranslateModule],
  templateUrl: './cloud-sidebar-conversation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' }
})
export class CloudSidebarConversationComponent {
  readonly conversation = input.required<IChatConversation>()
  readonly route = input.required<string[]>()
  readonly active = input(false)
  readonly compact = input(false)
  readonly preserveQueryParams = input(false)
  readonly selected = output<void>()
  readonly busy = signal(false)
  readonly error = signal('')
  readonly menuOpen = signal(false)
  readonly #api = inject(ChatConversationService)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly title = computed(
    () => this.conversation().title?.trim() || this.#translate.instant('XP.Sidebar.UntitledConversation')
  )
  readonly updatedAt = computed(() => formatConversationUpdatedAt(this.conversation().updatedAt))
  readonly hoverLabel = computed(() => [this.title(), this.updatedAt()].filter(Boolean).join(' · '))

  async togglePin() {
    await this.run(() =>
      firstValueFrom(
        this.#api.updateSidebarState(this.conversation(), {
          pinned: !this.conversation().sidebar?.pinned
        })
      )
    )
  }

  async toggleArchive() {
    await this.run(() =>
      firstValueFrom(
        this.#api.updateSidebarState(this.conversation(), {
          archived: !this.conversation().sidebar?.archived
        })
      )
    )
  }

  async openFolder() {
    const { SidebarConversationFilesComponent } = await import('./conversation-files.component')
    this.#dialog.open(SidebarConversationFilesComponent, {
      data: this.conversation(),
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
  }

  async rename() {
    const { SidebarConversationEditComponent } = await import('./conversation-edit.component')
    const title = await firstValueFrom(
      this.#dialog.open<string>(SidebarConversationEditComponent, {
        data: { mode: 'rename', title: this.title() },
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      }).closed
    )
    if (!title || title === this.title()) return
    await this.run(async () => {
      await firstValueFrom(this.#api.update(this.conversation().id, { title }))
      this.#api.refreshSidebar(this.conversation())
    })
  }

  async remove() {
    const { SidebarConversationEditComponent } = await import('./conversation-edit.component')
    const confirmed = await firstValueFrom(
      this.#dialog.open<boolean>(SidebarConversationEditComponent, {
        data: { mode: 'delete', title: this.title() },
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      }).closed
    )
    if (!confirmed) return
    await this.run(async () => {
      await firstValueFrom(this.#api.delete(this.conversation().id))
      this.#api.refreshSidebar(this.conversation(), true)
      if (this.active()) await this.#router.navigate(this.route().slice(0, -1))
    })
  }

  private async run(action: () => Promise<unknown>) {
    if (this.busy()) return
    this.busy.set(true)
    this.error.set('')
    try {
      await action()
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}
