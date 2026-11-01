import type { CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import { toXpertOpenerPrompt, type IXpert, type TXpertOpenerQuestion } from '@xpert-ai/contracts'

/** Manual configuration remains authoritative; generated questions only fill unused slots. */
export function buildXpertStartScreen(
  xpert: IXpert | null,
  automaticQuestions: readonly string[] = [],
  fallbackGreeting?: string
): CreateChatKitOptions['startScreen'] | null {
  if (!xpert) return null

  const opener = xpert.features?.opener
  const greeting = [
    opener?.enabled ? opener.message : null,
    xpert.description,
    xpert.title,
    xpert.titleCN,
    xpert.name,
    xpert.slug,
    fallbackGreeting
  ]
    .find((value) => typeof value === 'string' && !!value.trim())
    ?.trim()
  const questions: Array<{ label: string; prompt: string }> = []
  const seen = new Set<string>()
  const append = (question: TXpertOpenerQuestion) => {
    const item = toXpertOpenerPrompt(question)
    const key = item.prompt.trim().replace(/\s+/g, ' ').toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    // Structured prompts are author instructions: preserve formatting and content verbatim.
    const prompt = typeof question === 'string' ? item.prompt.trim().replace(/\s+/g, ' ') : item.prompt
    questions.push({ label: item.label.trim() || prompt, prompt })
  }
  for (const question of (opener?.enabled ? opener.questions : xpert.starters) ?? []) {
    append(question)
  }
  for (const question of automaticQuestions) {
    if (questions.length >= 5) break
    if (typeof question === 'string') append(question)
  }
  if (!greeting && !questions.length) return null

  return {
    ...(greeting ? { greeting } : {}),
    prompts: questions
  }
}
