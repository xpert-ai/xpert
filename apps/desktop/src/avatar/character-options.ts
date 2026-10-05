import type { TAssistantAppearance, TAssistantCharacterConfig } from '@xpert-ai/contracts'

export type Character = Extract<TAssistantAppearance, { kind: 'character' }>
export type CharacterConfig = TAssistantCharacterConfig
export const shapeOptions: { id: CharacterConfig['shape']; label: string }[] = [
  { id: 'round', label: 'Round' },
  { id: 'pebble', label: 'Pebble' },
  { id: 'pill', label: 'Capsule' },
  { id: 'drop', label: 'Drop' },
  { id: 'flame', label: 'Flame' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'square', label: 'Soft square' },
  { id: 'bag', label: 'Bag' },
  { id: 'star', label: 'Star' },
  { id: 'heart', label: 'Heart' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'clover', label: 'Clover' }
]
export const expressionOptions: { id: string; label: string; patch: Partial<CharacterConfig> }[] = [
  { id: 'bright', label: 'Bright', patch: { eyes: 'oval', brows: 'none' } },
  { id: 'toon', label: 'Curious', patch: { eyes: 'toon', brows: 'raised' } },
  { id: 'worried', label: 'Concerned', patch: { eyes: 'toon', brows: 'worried' } },
  { id: 'determined', label: 'Determined', patch: { eyes: 'toon', brows: 'angry' } },
  { id: 'pill', label: 'Calm', patch: { eyes: 'pill', brows: 'none' } },
  { id: 'dot', label: 'Dot eyes', patch: { eyes: 'dot', brows: 'none' } },
  { id: 'ring', label: 'Surprised', patch: { eyes: 'ring', brows: 'none' } },
  { id: 'happy', label: 'Happy', patch: { eyes: 'happy', brows: 'none' } },
  { id: 'smiling', label: 'Delighted', patch: { eyes: 'happy', brows: 'flat' } },
  { id: 'plus', label: 'Spark', patch: { eyes: 'plus', brows: 'none' } },
  { id: 'sleepy', label: 'Relaxed', patch: { eyes: 'sleepy', brows: 'none' } },
  { id: 'slash', label: 'Shy', patch: { eyes: 'slash', brows: 'none' } },
  { id: 'squint', label: 'Playful', patch: { eyes: 'squint', brows: 'none' } },
  { id: 'wink', label: 'Wink', patch: { eyes: 'wink', brows: 'none' } }
]
export const browOptions: { id: NonNullable<CharacterConfig['brows']>; label: string }[] = [
  { id: 'none', label: 'No brows' },
  { id: 'flat', label: 'Straight' },
  { id: 'angry', label: 'Determined' },
  { id: 'worried', label: 'Concerned' },
  { id: 'raised', label: 'Curious' }
]
export const mouthOptions: { id: CharacterConfig['mouth']; label: string }[] = [
  { id: 'none', label: 'No mouth' },
  { id: 'smile', label: 'Smile' },
  { id: 'open', label: 'Laugh' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'o', label: 'Surprised' }
]
export const motionOptions: { id: CharacterConfig['motion']; label: string }[] = [
  { id: 'float', label: 'Float' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'sway', label: 'Sway' },
  { id: 'none', label: 'Still' }
]
export const activityOptions = [
  { id: 'idle', label: 'Ready' },
  { id: 'listening', label: 'Listening' },
  { id: 'review', label: 'Thinking' },
  { id: 'running', label: 'Working' },
  { id: 'waving', label: 'Success' },
  { id: 'waiting', label: 'Waiting for confirmation' },
  { id: 'failed', label: 'Failed' },
  { id: 'sleeping', label: 'Asleep' }
]
export const studioColors = [
  '#18cbb7',
  '#3690f5',
  '#7460e8',
  '#ad68e6',
  '#ee77bc',
  '#f95464',
  '#f78540',
  '#ffc629',
  '#9bce49',
  '#4fbd84',
  '#8cbce6',
  '#b6c3d6',
  '#ac7955',
  '#50566d',
  '#20212c',
  '#e9e5dc'
]
export const studioPresets: { label: string; color: string; patch: Partial<CharacterConfig> }[] = [
  { label: 'Ember', color: '#f95464', patch: { shape: 'flame', eyes: 'toon', brows: 'worried', motion: 'sway' } },
  { label: 'Nova', color: '#ffc629', patch: { shape: 'star', eyes: 'toon', mouth: 'none', motion: 'bounce' } },
  { label: 'Scout', color: '#ac7955', patch: { shape: 'bag', eyes: 'toon', brows: 'flat', mouth: 'none' } },
  { label: 'Wave', color: '#3690f5', patch: { shape: 'triangle', eyes: 'toon', mouth: 'none' } },
  { label: 'Mint', color: '#18cbb7', patch: { shape: 'round', eyes: 'happy', mouth: 'none' } },
  { label: 'Bloom', color: '#ad68e6', patch: { shape: 'clover', eyes: 'wink', motion: 'sway' } }
]
