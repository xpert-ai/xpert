import {
  Cable,
  ChartNoAxesCombined,
  Palette,
  Settings2,
  Terminal,
  PanelTop,
  PanelRight,
  MousePointer2,
  type LucideIcon
} from 'lucide-react'

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'usage'
  | 'connection'
  | 'shell'
  | 'island'
  | 'dock'
  | 'computer'

export interface SettingsItem {
  id: SettingsSection
  label: string
  description: string
  icon: LucideIcon
  macOnly?: boolean
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
        id: 'island',
        label: 'Activity Island',
        icon: PanelTop,
        macOnly: true,
        description: 'Choose which activity appears at the top of your displays.',
        keywords: ['Behavior', 'Force Touch feedback', 'Width', 'Height']
      },
      {
        id: 'dock',
        label: 'Agent Dock',
        icon: PanelRight,
        macOnly: true,
        description: 'Choose where your shortcuts appear and which assistants to keep nearby.',
        keywords: ['Screen edge', 'Display', 'Dock size', 'Automatically hide Agent Dock', 'Show completed work']
      },
      {
        id: 'computer',
        label: 'Computer Use',
        icon: MousePointer2,
        macOnly: true,
        description: 'Manage macOS permissions for local window control.',
        keywords: ['System permissions', 'Accessibility', 'Screen Recording', 'Local window control']
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
