import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatConversationService, IChatConversation } from '../../@core'
import { FileWorkbenchComponent, FileWorkbenchFilesLoader, FileWorkbenchFileLoader } from '../../@shared/files'

@Component({
  standalone: true,
  imports: [FileWorkbenchComponent, TranslateModule],
  template: `
    <section class="flex h-[min(48rem,85vh)] w-[min(70rem,92vw)] min-w-0 flex-col">
      <header class="flex items-center gap-3 border-b border-border px-5 py-3">
        <i class="ri-folder-open-line text-xl text-text-secondary" aria-hidden="true"></i>
        <h2 class="min-w-0 flex-1 truncate font-semibold text-text-primary">{{ conversation.title }}</h2>
        <button
          class="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-hover-bg hover:text-text-primary"
          type="button"
          (click)="dialog.close()"
          [attr.aria-label]="'XP.Sidebar.CloseConversationFolder' | translate"
        >
          <i class="ri-close-line text-xl" aria-hidden="true"></i>
        </button>
      </header>
      <xp-file-workbench
        class="min-h-0 flex-1"
        [rootId]="conversation.id"
        [rootLabel]="'XP.Chat.AllFilesInTask' | translate"
        [filesLoader]="loadFiles"
        [fileLoader]="loadFile"
        [referenceable]="false"
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarConversationFilesComponent {
  readonly conversation = inject<IChatConversation>(DIALOG_DATA)
  readonly dialog = inject(DialogRef)
  readonly #api = inject(ChatConversationService)
  readonly loadFiles: FileWorkbenchFilesLoader = (path) => this.#api.getFiles(this.conversation.id, path ?? '')
  readonly loadFile: FileWorkbenchFileLoader = (path) => this.#api.getFile(this.conversation.id, path)
}
