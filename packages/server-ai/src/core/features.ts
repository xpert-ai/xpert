import { AiFeatureEnum, IFeatureCreateInput } from '@metad/contracts'
import { toggleFeatures } from '@metad/server-config'

const features = toggleFeatures

export const DEFAULT_FEATURES: Partial<IFeatureCreateInput>[] = [
	{
		name: 'Copilot',
		code: AiFeatureEnum.FEATURE_COPILOT,
		description: 'Enable Copilot',
		image: 'copilot.png',
		link: 'settings/copilot',
		isEnabled: features.FEATURE_COPILOT,
		icon: 'assistant',
		status: 'accent',
		children: [
			{
				name: 'Copilot Knowledgebase',
				code: AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE,
				description: 'Manage Knowledgebase of Copilot',
				link: 'settings/knowledgebase',
				isEnabled: features.FEATURE_COPILOT_KNOWLEDGEBASE,
				icon: 'file-text-outline',
				status: 'info'
			},
			{
				name: 'Copilot Chat',
				code: AiFeatureEnum.FEATURE_COPILOT_CHAT,
				description: 'Use Chat of Copilot',
				link: 'chat',
				isEnabled: features.FEATURE_COPILOT_CHAT,
				icon: 'chat',
				status: 'info'
			}
		]
	},
	{
		name: 'Xpert',
		code: AiFeatureEnum.FEATURE_XPERT,
		description: 'Enable Xpert',
		image: 'xpert.png',
		link: '/xpert',
		isEnabled: features.FEATURE_XPERT,
		icon: 'assistant',
		status: 'accent',
	}
]
