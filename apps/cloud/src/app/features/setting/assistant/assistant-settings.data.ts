export type AssistantSettingsSection = 'personalization' | 'memory' | 'assistant'
export interface SettingsRow {
  key: string
  description?: string
  type: 'toggle' | 'action'
  value?: string | boolean
}
export interface SettingsBlock {
  rows: SettingsRow[]
}

export const SETTINGS_SECTIONS: { key: AssistantSettingsSection; title: string; icon: string }[] = [
  { key: 'personalization', title: 'Personalization', icon: 'sparkles' },
  { key: 'memory', title: 'Memory', icon: 'lightbulb' },
  { key: 'assistant', title: 'Assistant', icon: 'robot_2' }
]

export const SETTINGS_BLOCKS: Partial<Record<AssistantSettingsSection, SettingsBlock[]>> = {
  memory: [
    { rows: [{ key: 'GenerateMemory', description: 'GenerateMemoryDesc', type: 'toggle', value: true }] },
    { rows: [{ key: 'ManageMemory', description: 'ManageMemoryDesc', type: 'action', value: 'Import' }] }
  ]
}
