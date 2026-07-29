import { AiFeatureEnum, AssistantCode } from '../../@core'

export type AssistantManagement = 'system' | 'user'

export type AssistantRegistryItem = {
  code: AssistantCode
  featureKeys: AiFeatureEnum[]
  management: AssistantManagement
  labelKey: string
  defaultLabel: string
  titleKey: string
  defaultTitle: string
  descriptionKey: string
  defaultDescription: string
}

export const ASSISTANT_REGISTRY: AssistantRegistryItem[] = [
  {
    code: AssistantCode.CHAT_COMMON,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT],
    management: 'system',
    labelKey: 'XP.Assistant.ChatCommon.Label',
    defaultLabel: 'Common Assistant',
    titleKey: 'XP.Chat.Common',
    defaultTitle: 'Common',
    descriptionKey: 'XP.Assistant.ChatCommon.Description',
    defaultDescription: 'Embedded assistant used by the common chat page.'
  },
  {
    code: AssistantCode.XPERT_SHARED,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT],
    management: 'system',
    labelKey: 'XP.Assistant.XpertShared.Label',
    defaultLabel: 'Workspace Assistant',
    titleKey: 'XP.Xpert.Assistant',
    defaultTitle: 'Assistant',
    descriptionKey: 'XP.Assistant.XpertShared.Description',
    defaultDescription: 'Shared assistant used in the Xpert workspace and studio shell.'
  },
  {
    code: AssistantCode.CLAWXPERT,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT],
    management: 'user',
    labelKey: 'XP.Assistant.ClawXpert.Label',
    defaultLabel: 'ClawXpert',
    titleKey: 'XP.Chat.ClawXpert.Title',
    defaultTitle: 'ClawXpert',
    descriptionKey: 'XP.Assistant.ClawXpert.Description',
    defaultDescription: 'User-configured assistant used by the ClawXpert page.'
  }
]

export function getAssistantRegistryItem(code: AssistantCode) {
  return ASSISTANT_REGISTRY.find((item) => item.code === code) ?? null
}
