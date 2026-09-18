import { effect, inject, Signal, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import type { CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import type { IXpert } from '@xpert-ai/contracts'
import { injectLanguage } from '../../../@core/providers/translate'
import { XpertFrequentQuestionsService } from '../../../@core/services/xpert-frequent-questions.service'
import { Store } from '../../../@core/state/store.service'
import { buildXpertStartScreen } from '../../assistant/xpert-start-screen'

export function injectFrequentQuestionsStartScreen(input: {
  xpert: Signal<IXpert | null>
  active: Signal<boolean>
}): Signal<CreateChatKitOptions['startScreen'] | null> {
  const api = inject(XpertFrequentQuestionsService)
  const store = inject(Store)
  const organizationId = toSignal(store.selectOrganizationId(), { initialValue: store.organizationId ?? null })
  const language = injectLanguage()
  const startScreen = signal<CreateChatKitOptions['startScreen'] | null>(null)

  effect((onCleanup) => {
    const xpert = input.xpert()
    const active = input.active()
    const organization = organizationId()
    const locale = language() || 'en'
    const build = (questions: readonly string[] = []) => {
      const content = active ? buildXpertStartScreen(xpert, questions) : null
      return content ? { ...content, promptsLayout: 'list' as const } : null
    }
    const configuredStartScreen = build()
    startScreen.set(configuredStartScreen)

    if (!active || !organization || !xpert?.id || !xpert.features?.frequentQuestions?.enabled) {
      return
    }

    const subscription = api.get(xpert.id, locale).subscribe({
      next: ({ questions }) => startScreen.set(build(questions)),
      // Optional suggestions must not prevent starting or loading a conversation.
      error: () => startScreen.set(configuredStartScreen)
    })
    onCleanup(() => subscription.unsubscribe())
  })

  return startScreen.asReadonly()
}
