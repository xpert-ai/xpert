import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  DateRelativePipe,
  IChatConversation,
  injectProjectService,
  injectToastr,
  XpertToolsetService
} from '@cloud/app/@core'
import { UserPipe } from '@cloud/app/@shared/pipes'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { of, startWith } from 'rxjs'
import { ChatProjectHomeComponent } from '../home/home.component'
import { ChatProjectComponent } from '../project.component'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    ContentLoaderModule,
    MatTooltipModule,
    UserPipe,
    DateRelativePipe
  ],
  selector: 'chat-project-conversations',
  templateUrl: './conversations.component.html',
  styleUrl: 'conversations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectConversationsComponent {
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly projectSercice = injectProjectService()
  readonly toolsetService = inject(XpertToolsetService)
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #homeComponent = inject(ChatProjectHomeComponent)
  readonly #toastr = injectToastr()

  readonly id = this.#homeComponent.id
  readonly project = this.#projectComponent.project

  // Conversations
  readonly result = derivedAsync<{ loading?: boolean; items?: IChatConversation[] }>(() => {
    const id = this.id()
    return id ? this.projectSercice.getConversations(id).pipe(startWith({ loading: true })) : of(null)
  })
}
