import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Component, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepCategory } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from '../../avatar/emoji-avatar/avatar.component'
import { of } from 'rxjs'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, EmojiAvatarComponent],
  selector: 'chat-message-step-icon',
  templateUrl: 'icon.component.html',
  styleUrls: ['icon.component.scss']
})
export class ChatMessageStepIconComponent {
  eChatMessageStepCategory = ChatMessageStepCategory

  readonly httpClient = inject(HttpClient)

  readonly step = input<{ type: ChatMessageStepCategory; toolset?: string; toolsetId?: string }>()

  readonly #avatar = myRxResource({
    request: () => (this.step()?.toolset === 'mcp' ? this.step().toolsetId : null),
    loader: ({ request }) => {
      return request ? this.httpClient.get(`/api/xpert-toolset/mcp/${request}/avatar`) : of(null)
    }
  })

  readonly avatar = this.#avatar.value

  // constructor() {
  //   effect(() => {
  //     console.log(this.step())
  //   })
  // }
}
