import { AiFeatureEnum, AssistantCode } from '../../@core'

export type AssistantRegistryItem = {
  code: AssistantCode
  featureKeys: AiFeatureEnum[]
  labelKey: string
  defaultLabel: string
  titleKey: string
  defaultTitle: string
  descriptionKey: string
  defaultDescription: string
}

export const ASSISTANT_REGISTRY: AssistantRegistryItem[] = [
  {
    code: AssistantCode.XPERT_SHARED,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT],
    labelKey: 'PAC.Assistant.XpertShared.Label',
    defaultLabel: 'Workspace Assistant',
    titleKey: 'PAC.Xpert.Assistant',
    defaultTitle: 'Assistant',
    descriptionKey: 'PAC.Assistant.XpertShared.Description',
    defaultDescription: 'Shared assistant used in the Xpert workspace and studio shell.'
  },
  {
    code: AssistantCode.CHATBI,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CHATBI],
    labelKey: 'PAC.Assistant.ChatBI.Label',
    defaultLabel: 'ChatBI Assistant',
    titleKey: 'PAC.ChatBI.Title',
    defaultTitle: 'Chat BI',
    descriptionKey: 'PAC.Assistant.ChatBI.Description',
    defaultDescription: 'Embedded assistant used by the ChatBI page.'
  }
]

export function getAssistantRegistryItem(code: AssistantCode) {
  return ASSISTANT_REGISTRY.find((item) => item.code === code) ?? null
}
