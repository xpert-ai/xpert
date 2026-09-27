import type { BotActivity } from '../assistant-list-types'

export type AvatarConversationStatus = BotActivity['latestConversationStatus']

interface AvatarExpression {
  mood: 'smile' | 'focused' | 'relaxed' | 'resting' | 'questioning' | 'dejected'
  left: string
  right: string
  mouth: string
}

// Keep expressions inside the original face bounds so the gaze transforms can compose with every state.
const expressions: Record<NonNullable<AvatarConversationStatus>, AvatarExpression> = {
  idle: {
    mood: 'smile',
    left: 'M23 31 L39 46 L23 60',
    right: 'M78 35 L64 46 L78 59',
    mouth: 'M39 70 Q50 78 61 70'
  },
  busy: {
    mood: 'focused',
    left: 'M23 39 L39 46 L23 53',
    right: 'M78 39 L64 46 L78 53',
    mouth: 'M40 72 Q50 69 60 72'
  },
  pausing: {
    mood: 'relaxed',
    left: 'M23 44 Q31 53 39 44',
    right: 'M63 44 Q71 53 79 44',
    mouth: 'M41 70 Q50 75 59 70'
  },
  paused: {
    mood: 'resting',
    left: 'M23 47 Q31 54 39 47',
    right: 'M63 47 Q71 54 79 47',
    mouth: 'M44 72 L56 72'
  },
  interrupted: {
    mood: 'questioning',
    left: 'M24 45 Q31 30 38 45',
    right: 'M64 47 Q71 41 78 47',
    mouth: 'M45 72 C45 65 55 65 55 72 C55 79 45 79 45 72'
  },
  error: {
    mood: 'dejected',
    left: 'M23 50 Q31 49 39 39',
    right: 'M63 39 Q71 49 79 50',
    mouth: 'M39 78 Q50 -12 61 78'
  }
}

export function avatarExpression(status?: AvatarConversationStatus): AvatarExpression {
  return expressions[status ?? 'idle'] ?? expressions.idle
}
