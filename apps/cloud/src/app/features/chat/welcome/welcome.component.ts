import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { AssistantCode, RolesEnum, Store } from '../../../@core'
import { UserPipe } from '../../../@shared/pipes'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import { clearChatCommonPendingInput, storeChatCommonPendingInput } from '../common/pending-input.util'
import { ChatXpertsComponent } from '../xperts/xperts.component'

@Component({
  standalone: true,
  selector: 'pac-chat-common-welcome',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, ChatXpertsComponent, UserPipe],
  templateUrl: './welcome.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCommonWelcomeComponent {
  readonly #router = inject(Router)
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
  readonly assistantCode = signal(AssistantCode.CHAT_COMMON)
  readonly assistantsRoute = ['/settings/assistants']
  readonly user = toSignal(this.#store.user$, { initialValue: null })
  readonly promptControl = new FormControl('', { nonNullable: true })
  readonly prompt = toSignal(this.promptControl.valueChanges.pipe(startWith(this.promptControl.getRawValue())), {
    initialValue: this.promptControl.getRawValue()
  })
  readonly isComposing = signal(false)

  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle,
    history: {
      enabled: false,
      showDelete: false,
      showRename: false
    }
  })

  readonly status = this.runtime.status
  readonly showComposer = computed(() => this.status() === 'ready')
  readonly showAssistantCard = computed(() => this.status() !== 'ready')
  readonly canSubmit = computed(() => this.status() === 'ready' && !!this.prompt().trim())
  readonly canManageAssistantSettings = computed(() => {
    const roleName = this.user()?.role?.name
    return roleName === RolesEnum.SUPER_ADMIN || roleName === RolesEnum.ADMIN
  })
  readonly showChangeSettingsAction = computed(() => this.showComposer() && this.canManageAssistantSettings())
  readonly showStatusTitle = computed(() => this.status() !== 'ready')
  readonly statusTitleKey = computed(() => {
    switch (this.status()) {
      case 'loading':
        return 'PAC.Xpert.AssistantLoading'
      case 'disabled':
        return 'PAC.Assistant.DisabledTitle'
      case 'error':
        return 'PAC.Assistant.LoadFailed'
      case 'missing':
        return 'PAC.Assistant.MissingTitle'
      default:
        return ''
    }
  })
  readonly statusTitleDefault = computed(() => {
    switch (this.status()) {
      case 'loading':
        return 'Preparing assistant…'
      case 'disabled':
        return 'Assistant disabled'
      case 'error':
        return 'Failed to load assistant configuration.'
      case 'missing':
        return 'Assistant not configured'
      default:
        return ''
    }
  })
  readonly statusIcon = computed(() => {
    switch (this.status()) {
      case 'loading':
        return 'ri-loader-4-line animate-spin'
      case 'disabled':
        return 'ri-pause-circle-line'
      case 'error':
        return 'ri-error-warning-line'
      case 'missing':
        return 'ri-settings-3-line'
      default:
        return 'ri-robot-line'
    }
  })
  readonly greeting = computed(() => {
    const now = new Date()
    const hours = now.getHours()

    if (hours >= 5 && hours < 12) {
      return 'Good morning'
    }
    if (hours >= 12 && hours < 18) {
      return 'Good afternoon'
    }
    if (hours >= 18 && hours < 22) {
      return 'Good evening'
    }

    return 'Good'
  })

  newConv() {
    this.promptControl.setValue('')
  }

  async submit() {
    const input = this.prompt().trim()
    if (!input || this.status() !== 'ready') {
      return
    }

    this.promptControl.setValue('')
    storeChatCommonPendingInput(input)

    try {
      const navigated = await this.#router.navigate(['/chat/x/common'], { state: { input } })
      if (!navigated) {
        clearChatCommonPendingInput()
      }
    } catch (error) {
      clearChatCommonPendingInput()
      throw error
    }
  }

  submitFromForm(event: Event) {
    event.preventDefault()
    void this.submit()
  }

  triggerFun(event: KeyboardEvent) {
    if (this.isComposing() || (event.isComposing && event.key === 'Enter') || event.shiftKey) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      void this.submit()
    }
  }

  onCompositionStart() {
    this.isComposing.set(true)
  }

  onCompositionEnd() {
    this.isComposing.set(false)
  }
}
