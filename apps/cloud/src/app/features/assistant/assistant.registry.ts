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
    labelKey: 'PAC.Assistant.ChatCommon.Label',
    defaultLabel: 'Common Assistant',
    titleKey: 'PAC.Chat.Common',
    defaultTitle: 'Common',
    descriptionKey: 'PAC.Assistant.ChatCommon.Description',
    defaultDescription: 'Embedded assistant used by the common chat page.'
  },
  {
    code: AssistantCode.XPERT_SHARED,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT],
    management: 'system',
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
    management: 'system',
    labelKey: 'PAC.Assistant.ChatBI.Label',
    defaultLabel: 'ChatBI Assistant',
    titleKey: 'PAC.ChatBI.Title',
    defaultTitle: 'Chat BI',
    descriptionKey: 'PAC.Assistant.ChatBI.Description',
    defaultDescription: 'Embedded assistant used by the ChatBI page.'
  },
  {
    code: AssistantCode.CLAWXPERT,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT],
    management: 'user',
    labelKey: 'PAC.Assistant.ClawXpert.Label',
    defaultLabel: 'ClawXpert',
    titleKey: 'PAC.Chat.ClawXpert.Title',
    defaultTitle: 'ClawXpert',
    descriptionKey: 'PAC.Assistant.ClawXpert.Description',
    defaultDescription: 'User-configured assistant used by the ClawXpert page.'
  },
  {
    code: AssistantCode.PROJECT_MAIN,
    featureKeys: [AiFeatureEnum.FEATURE_XPERT],
    management: 'user',
    labelKey: 'PAC.Assistant.ProjectMain.Label',
    defaultLabel: 'Project Main Agent',
    titleKey: 'PAC.Project.MainAgentTitle',
    defaultTitle: 'Project Main Agent',
    descriptionKey: 'PAC.Assistant.ProjectMain.Description',
    defaultDescription: 'User-configured assistant used as the main coordinating agent for a project.'
  }
]

export function getAssistantRegistryItem(code: AssistantCode) {
  return ASSISTANT_REGISTRY.find((item) => item.code === code) ?? null
}
