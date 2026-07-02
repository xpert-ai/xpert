import { Injectable, signal } from '@angular/core'

export type ClawXpertSkillTrialIntent = {
  workspaceId: string
  skillPackageId: string
  label?: string | null
  prompt?: string | null
  createdAt: number
}

const STORAGE_KEY = 'xpert.clawxpert.skillTrialIntent'
const INTENT_TTL_MS = 5 * 60 * 1000

@Injectable({ providedIn: 'root' })
export class ClawXpertSkillTrialIntentService {
  readonly #intent = signal<ClawXpertSkillTrialIntent | null>(readStoredIntent())

  set(intent: Omit<ClawXpertSkillTrialIntent, 'createdAt'>) {
    const next: ClawXpertSkillTrialIntent = {
      ...intent,
      createdAt: Date.now()
    }
    this.#intent.set(next)
    writeStoredIntent(next)
  }

  peek() {
    const intent = this.#intent()
    if (!isFreshIntent(intent)) {
      this.clear()
      return null
    }
    return intent
  }

  consume() {
    const intent = this.peek()
    if (intent) {
      this.clear()
    }
    return intent
  }

  clear() {
    this.#intent.set(null)
    removeStoredIntent()
  }
}

function isFreshIntent(intent: ClawXpertSkillTrialIntent | null): intent is ClawXpertSkillTrialIntent {
  return !!intent && Date.now() - intent.createdAt <= INTENT_TTL_MS
}

function readStoredIntent() {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return isIntentLike(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeStoredIntent(intent: ClawXpertSkillTrialIntent) {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent))
  } catch {
    // Session storage may be unavailable in private browsing contexts.
  }
}

function removeStoredIntent() {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Session storage may be unavailable in private browsing contexts.
  }
}

function isIntentLike(value: unknown): value is ClawXpertSkillTrialIntent {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record['workspaceId'] === 'string' &&
    typeof record['skillPackageId'] === 'string' &&
    (record['prompt'] === undefined || record['prompt'] === null || typeof record['prompt'] === 'string') &&
    typeof record['createdAt'] === 'number'
  )
}
