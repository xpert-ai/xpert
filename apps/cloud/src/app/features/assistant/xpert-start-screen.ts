import type { CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import type { IXpert } from '@xpert-ai/contracts'

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
  const questions: string[] = []
  const seen = new Set<string>()
  const append = (question: string) => {
    const text = question.trim().replace(/\s+/g, ' ')
    const key = text.toLowerCase()
    if (!text || seen.has(key)) return
    seen.add(key)
    questions.push(text)
  }
  for (const question of (opener?.enabled ? opener.questions : xpert.starters) ?? []) {
    if (typeof question === 'string') append(question)
  }
  for (const question of automaticQuestions) {
    if (questions.length >= 5) break
    if (typeof question === 'string') append(question)
  }
  if (!greeting && !questions.length) return null

  return {
    ...(greeting ? { greeting } : {}),
    prompts: questions.map((question) => ({ label: question, prompt: question }))
  }
}
