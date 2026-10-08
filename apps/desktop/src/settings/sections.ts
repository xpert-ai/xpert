import { Cable, ChartNoAxesCombined, Palette, Settings2, Terminal, type LucideIcon } from 'lucide-react'

export type SettingsSection = 'general' | 'appearance' | 'usage' | 'connection' | 'shell'

export interface SettingsItem {
  id: SettingsSection
  label: string
  description: string
  icon: LucideIcon
  keywords: string[]
}

export const settingsGroups: { label: string; items: SettingsItem[] }[] = [
  {
    label: 'Basic settings',
    items: [
      {
        id: 'general',
        label: 'General',
        icon: Settings2,
        description: 'Set your language and everyday display preferences.',
        keywords: ['Language', 'Desktop font size', 'Assistant list density']
      },
      {
        id: 'appearance',
        label: 'Appearance',
        icon: Palette,
        description: 'Customize desktop and chat appearance in one place.',
        keywords: [
          'Visual style',
          'Appearance mode',
          'Follow system',
          'Light',
          'Dark',
          'Desktop appearance',
          'Chat appearance',
          'Desktop font',
          'Desktop corner radius',
          'Primary color',
          'Bubble mode',
          'Message display',
          'ChatKit',
          'ChatKit font',
          'Code font',
          'ChatKit corners',
          'ChatKit density',
          'Colors'
        ]
      },
      {
        id: 'usage',
        label: 'Usage & points',
        icon: ChartNoAxesCombined,
        description: 'View your current plan, point balances and usage history.',
        keywords: ['Current plan', 'Personal points', 'Points consumed', 'Usage analytics', 'Deduction details']
      }
    ]
  },
  {
    label: 'Connections & capabilities',
    items: [
      {
        id: 'connection',
        label: 'Service connection',
        icon: Cable,
        description: 'Manage the services your desktop connects to.',
        keywords: ['API service URL', 'Xpert web URL', 'ChatKit URL', 'Allow untrusted service certificates']
      },
      {
        id: 'shell',
        label: 'Local terminal',
        icon: Terminal,
        description: 'Manage command execution on this computer.',
        keywords: ['Desktop Shell', 'Execution permission', 'Shell', 'Default working directory', 'Computer name']
      }
    ]
  }
]

export const settingsItems = settingsGroups.flatMap((group) => group.items)
