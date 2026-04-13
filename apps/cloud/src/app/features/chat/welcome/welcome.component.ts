import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { RolesEnum, Store } from '../../../@core'
import { UserPipe } from '../../../@shared/pipes'
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

  readonly assistantsRoute = ['/settings/assistants']
  readonly user = toSignal(this.#store.user$, { initialValue: null })
  readonly promptControl = new FormControl('', { nonNullable: true })
  readonly prompt = toSignal(this.promptControl.valueChanges.pipe(startWith(this.promptControl.getRawValue())), {
    initialValue: this.promptControl.getRawValue()
  })
  readonly isComposing = signal(false)

  readonly canSubmit = computed(() => !!this.prompt().trim())
  readonly canManageAssistantSettings = computed(() => {
    const roleName = this.user()?.role?.name
    return roleName === RolesEnum.SUPER_ADMIN || roleName === RolesEnum.ADMIN
  })
  readonly showChangeSettingsAction = this.canManageAssistantSettings
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
    if (!input) {
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
