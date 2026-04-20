import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { AssistantCode, IXpert, RolesEnum, Store } from '../../../@core'
import { provideOcap } from '../../../@core/providers/ocap'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '../../../xpert'
import { TranslateModule } from '@ngx-translate/core'
import { provideOcapCore } from '@xpert-ai/ocap-angular/core'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantBindingRuntimeState } from '../../assistant/assistant-chatkit.runtime'
import { ChatHomeService } from '../home.service'
import { ChatXpertsComponent } from '../xperts/xperts.component'
import { ChatCommonService } from './common-chat.service'

@Component({
  standalone: true,
  selector: 'pac-chat-common-assistant',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    EmojiAvatarComponent,
    XpertChatAppComponent,
    ChatXpertsComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './common.component.html',
  providers: [
    ChatCommonService,
    { provide: ChatService, useExisting: ChatCommonService },
    provideOcapCore(),
    provideOcap(),
    XpertOcapService
  ]
})
export class ChatCommonAssistantComponent {
  readonly #homeService = inject(ChatHomeService)
  readonly #chatService = inject(ChatCommonService)
  readonly #store = inject(Store)

  readonly definition = getAssistantRegistryItem(AssistantCode.CHAT_COMMON) ?? {
    code: AssistantCode.CHAT_COMMON,
    featureKeys: [],
    management: 'system',
    labelKey: 'PAC.Assistant.ChatCommon.Label',
    defaultLabel: 'Common Assistant',
    titleKey: 'PAC.Chat.Common',
    defaultTitle: 'Common',
    descriptionKey: 'PAC.Assistant.ChatCommon.Description',
    defaultDescription: 'Embedded assistant used by the common chat page.'
  }
  readonly assistantsRoute = ['/settings/assistants']
  readonly assistantCode = signal(AssistantCode.CHAT_COMMON)
  readonly user = toSignal(this.#store.user$, { initialValue: null })
  readonly currentXpert = this.#chatService.xpert
  readonly xperts = this.#homeService.sortedXperts
  readonly searchControl = new FormControl('', { nonNullable: true })
  readonly searchText = signal('')
  readonly runtime = injectAssistantBindingRuntimeState({
    assistantCode: this.assistantCode.asReadonly()
  })

  readonly status = this.runtime.status
  readonly canManageAssistantSettings = computed(() => {
    const roleName = this.user()?.role?.name
    return roleName === RolesEnum.SUPER_ADMIN || roleName === RolesEnum.ADMIN
  })
  readonly showChangeSettingsAction = this.canManageAssistantSettings
  readonly filteredXperts = computed(() => {
    const allXperts = this.xperts() || []
    const searchText = this.searchText().toLowerCase()

    if (!searchText) {
      return allXperts
    }

    return allXperts.filter(
      (xpert) =>
        xpert.name?.toLowerCase().includes(searchText) ||
        xpert.title?.toLowerCase().includes(searchText) ||
        xpert.description?.toLowerCase().includes(searchText)
    )
  })
  readonly hasNoPublishedXperts = computed(() => !this.searchText() && this.filteredXperts().length === 0)

  constructor() {
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchText.set(value || '')
    })

    effect(() => {
      void this.#chatService.setAssistantId(this.runtime.config()?.assistantId ?? null)
    })
  }

  newConv() {
    this.#chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.#chatService.newConv(xpert)
  }
}
