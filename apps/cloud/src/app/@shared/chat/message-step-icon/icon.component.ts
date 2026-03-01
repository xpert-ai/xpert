import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectOrganizationId } from '@metad/cloud/state'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepCategory } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
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
  readonly organizationId = injectOrganizationId()

  readonly step = input<{ type: ChatMessageStepCategory; toolset?: string; toolsetId?: string }>()

  readonly builtinProviderIconUrl = computed(() => {
    const toolset = this.step()?.toolset
    if (!toolset) {
      return null
    }

    const org = this.organizationId()
    const baseUrl = `/api/xpert-toolset/builtin-provider/${toolset}/icon`
    return org ? `${baseUrl}?org=${encodeURIComponent(org)}` : baseUrl
  })

  readonly #avatar = myRxResource({
    request: () => (['mcp', 'openapi'].includes(this.step()?.toolset) ? this.step() : null),
    loader: ({ request }) => {
      return request ? this.httpClient.get(`/api/xpert-toolset/${request.toolsetId}/avatar`) : of(null)
    }
  })

  readonly avatar = this.#avatar.value

  // constructor() {
  //   effect(() => {
  //     console.log(this.step())
  //   })
  // }
}
