import { AiFeatureEnum, IFeatureCreateInput } from '@xpert-ai/contracts'
import { toggleFeatures } from '@xpert-ai/server-config'

const features = toggleFeatures
const XPERT_FEATURE_GROUP_CODE = 'GROUP_XPERT'

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
                name: 'Monitoring',
                code: AiFeatureEnum.FEATURE_COPILOT_MONITORING,
                description: 'Show Copilot usage and monitoring tabs',
                link: 'settings/copilot/overview',
                isEnabled: features.FEATURE_COPILOT_MONITORING,
                icon: 'browse_activity',
                status: 'info'
            }
        ]
    },
    {
        name: 'Xpert',
        code: XPERT_FEATURE_GROUP_CODE,
        description: 'Manage Xpert feature modules',
        image: 'xpert.png',
        link: '',
        isEnabled: false,
        icon: 'sparkles',
        status: 'accent',
        children: [
            {
                name: 'Digital Expert',
                code: AiFeatureEnum.FEATURE_XPERT,
                description: 'Enable Xpert',
                link: '/xpert',
                isEnabled: features.FEATURE_XPERT,
                icon: 'assistant',
                status: 'info'
            },
            {
                name: 'ClawXpert',
                code: AiFeatureEnum.FEATURE_XPERT_CLAWXPERT,
                description: 'Show the ClawXpert entry in chat sidebar',
                link: 'chat/clawxpert',
                isEnabled: true,
                icon: 'account-circle',
                status: 'info'
            },
            {
                name: 'ChatBI',
                code: AiFeatureEnum.FEATURE_XPERT_CHATBI,
                description: 'Show the ChatBI entry in main navigation',
                link: 'chatbi',
                isEnabled: true,
                icon: 'chat',
                status: 'info'
            },
            {
                name: 'CodeXpert',
                code: AiFeatureEnum.FEATURE_XPERT_CODEXPERT,
                description: 'Show the CodeXpert entry in main navigation',
                link: 'https://code.xpertai.cn/',
                isEnabled: true,
                icon: 'code',
                status: 'info'
            },
            {
                name: 'DeepResearch',
                code: AiFeatureEnum.FEATURE_XPERT_DEEP_RESEARCH,
                description: 'Show the DeepResearch entry in main navigation',
                link: 'https://research.xpertai.cn/',
                isEnabled: true,
                icon: 'search',
                status: 'info'
            },
            {
                name: 'Data & Ontology',
                code: AiFeatureEnum.FEATURE_XPERT_DATA_ONTOLOGY,
                description: 'Show the Data & Ontology entry in main navigation',
                link: 'https://data.xpertai.cn/',
                isEnabled: features.FEATURE_XPERT_DATA_ONTOLOGY,
                icon: 'schema',
                status: 'info'
            }
        ]
    }
]
