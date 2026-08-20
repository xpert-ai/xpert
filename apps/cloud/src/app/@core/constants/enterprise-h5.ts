import { TEnterpriseH5Platform } from '@xpert-ai/contracts'

/** UI labels and configuration metadata for a supported enterprise H5 platform. */
type EnterpriseH5PlatformDefinition = {
  platform: TEnterpriseH5Platform
  appLabel: {
    key: string
    default: string
  }
  integrationPlaceholder: {
    key: string
    default: string
  }
  hint: {
    key: string
    default: string
  }
  linkLabel: {
    key: string
    default: string
  }
}

export const ENTERPRISE_H5_PLATFORM_DEFINITIONS = [
  {
    platform: 'dingtalk',
    appLabel: {
      key: 'XP.Xpert.DingTalkChatApp',
      default: 'DingTalk workbench app'
    },
    integrationPlaceholder: {
      key: 'XP.Xpert.SelectDingTalkIntegration',
      default: 'Select a DingTalk integration'
    },
    hint: {
      key: 'XP.Xpert.DingTalkChatAppHint',
      default:
        'The selected integration must contain the Corp ID of the same enterprise. Employees open the dedicated URL from DingTalk without an Xpert account.'
    },
    linkLabel: {
      key: 'XP.Xpert.DingTalkWorkbenchURL',
      default: 'DingTalk workbench URL'
    }
  }
] as const satisfies readonly EnterpriseH5PlatformDefinition[]
