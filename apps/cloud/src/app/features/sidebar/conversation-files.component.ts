import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatConversationService, IChatConversation } from '../../@core'
import { FileWorkbenchComponent, FileWorkbenchFilesLoader, FileWorkbenchFileLoader } from '../../@shared/files'

@Component({
  standalone: true,
  imports: [...XpDialogFrameImports, ZardButtonComponent, FileWorkbenchComponent, TranslateModule],
  template: `<section xpDialogLayout="wide" class="h-[min(740px,84dvh)] w-[min(1120px,calc(100vw-32px))]">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ conversation.title }}</h2>
      <button
        z-button
        zType="ghost"
        type="button"
        xpDialogCloseButton
        zSize="icon"
        [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
        (click)="dialog.close()"
      >
        <z-icon zType="x" aria-hidden="true" />
      </button>
    </header>
    <div xpDialogBody class="flex flex-col">
      <xp-file-workbench
        class="min-h-0 flex-1"
        [rootId]="conversation.id"
        [rootLabel]="'XP.Chat.AllFilesInTask' | translate"
        [filesLoader]="loadFiles"
        [fileLoader]="loadFile"
        [referenceable]="false"
      />
    </div>
    <footer xpDialogFooter>
      <button z-button zType="outline" type="button" (click)="dialog.close()">
        {{ 'XP.ACTIONS.Close' | translate: { Default: 'Close' } }}
      </button>
    </footer>
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarConversationFilesComponent {
  readonly conversation = inject<IChatConversation>(DIALOG_DATA)
  readonly dialog = inject(DialogRef)
  readonly #api = inject(ChatConversationService)
  readonly loadFiles: FileWorkbenchFilesLoader = (path) => this.#api.getFiles(this.conversation.id, path ?? '')
  readonly loadFile: FileWorkbenchFileLoader = (path) => this.#api.getFile(this.conversation.id, path)
}
