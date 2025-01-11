import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatSidenav } from '@angular/material/sidenav'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { combineLatest, map } from 'rxjs'
import { KnowledgebaseService } from '../../../@core'
import { KnowledgebaseListComponent } from '../../../@shared/copilot'
import { AppService } from '../../../app.service'
import { Icons } from '../icons'
import { AboutXpertComponent } from '../../../@shared/xpert'
import { MatIconModule } from '@angular/material/icon'
import { ChatService } from '../../../xpert/chat.service'
import { ChatInputComponent } from '../../../xpert'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    MatIconModule,
    NgmCommonModule,
    ...Icons,
    KnowledgebaseListComponent,
  ],
  selector: 'pac-chat-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrl: 'toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatToolbarComponent {
  readonly chatService = inject(ChatService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly appService = inject(AppService)
  readonly #dialog = inject(MatDialog)

  readonly sidenav = input<MatSidenav>()
  readonly chatInput = input<ChatInputComponent>()

  readonly lang = this.appService.lang
  readonly _role = toSignal(this.chatService.xpert$)

  readonly allKnowledgebases = toSignal(
    combineLatest([this.knowledgebaseService.getMyAllInOrg(), this.knowledgebaseService.getAllByPublicInOrg()]).pipe(
      map(([my, publics]) => [...my.items, ...publics.items])
    )
  )

  readonly knowledgebaseList = computed(() =>
    this._role()?.id ? this._role().knowledgebases : this.allKnowledgebases()
  )
  readonly knowledgebases = this.chatService.knowledgebases

  readonly toolsetList = computed(() => this._role()?.toolsets)
  readonly toolsets = this.chatService.toolsets

  readonly xpert = this.chatService.xpert
  readonly disabled = computed(() => !!this.chatService.conversation()?.id)

  // constructor() {
  //   effect(() => console.log(this._role()))
  // }

  openAbout() {
    this.#dialog
      .open(AboutXpertComponent, {
        data: {
          xpert: this.xpert()
        }
      })
      .afterClosed()
      .subscribe((statement) => {
        if (statement) {
          this.chatInput().ask(statement)
        }
      })
  }
}
