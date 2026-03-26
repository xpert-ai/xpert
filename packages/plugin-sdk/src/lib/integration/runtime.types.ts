export type IntegrationViewTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type IntegrationViewItemType = 'text' | 'boolean' | 'datetime' | 'paragraph' | 'badge'

export type IntegrationActionVariant = 'flat' | 'stroked' | 'raised'

export type IntegrationActionColor = 'primary' | 'warn' | 'default'

export interface IntegrationViewItem {
  key: string
  type: IntegrationViewItemType
  label?: string
  value: string | number | boolean | null
  emphasis?: boolean
}

export interface IntegrationAction {
  key: string
  label: string
  variant: IntegrationActionVariant
  color?: IntegrationActionColor
  requiresSaved?: boolean
  hiddenWhenDirty?: boolean
  confirmText?: string
}

export interface IntegrationViewSection {
  key: string
  title: string
  tone: IntegrationViewTone
  items?: IntegrationViewItem[]
  messages?: string[]
  actions?: IntegrationAction[]
}

export interface IntegrationTestView {
  webhookUrl?: string
  mode?: string
  sections: IntegrationViewSection[]
}

export interface IntegrationRuntimeView {
  supported: boolean
  state?: string
  connected?: boolean
  sections: IntegrationViewSection[]
  actions?: IntegrationAction[]
}
