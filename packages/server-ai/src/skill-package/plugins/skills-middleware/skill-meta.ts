import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { SKILLS_MIDDLEWARE_NAME } from '../../types'
import {
    DEFAULT_AUTO_DISCOVERY_SEARCH_LIMIT,
    MAX_AUTO_DISCOVERY_SEARCH_LIMIT,
    DEFAULT_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN,
    MAX_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN
} from './skill-types'

export const skillsMiddlewareMeta: TAgentMiddlewareMeta = {
    name: SKILLS_MIDDLEWARE_NAME,
    label: {
        en_US: 'Skills Middleware',
        zh_Hans: '技能中间件'
    },
    icon: {
        type: 'svg',
        value: `<svg class="svg-icon" style="fill: currentColor;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M448.512 479.232a54.272 54.272 0 1 1 56.32-55.296 55.296 55.296 0 0 1-56.32 55.296z m343.04 91.136l-73.728-110.592V450.56a245.76 245.76 0 0 0-244.736-245.76 225.28 225.28 0 0 0-58.368 7.168A244.736 244.736 0 0 0 228.352 450.56a224.256 224.256 0 0 0 36.864 130.048c43.008 61.44 71.68 110.592 54.272 177.152a47.104 47.104 0 0 0 9.216 43.008 45.056 45.056 0 0 0 36.864 18.432h200.704a48.128 48.128 0 0 0 48.128-38.912 51.2 51.2 0 0 0 2.048-12.288 24.576 24.576 0 0 1 24.576-20.48H655.36a48.128 48.128 0 0 0 48.128-34.816 422.912 422.912 0 0 0 15.36-98.304h52.224a28.672 28.672 0 0 0 22.528-16.384 29.696 29.696 0 0 0-2.048-27.648z m-202.752-86.016l-10.24 16.384a22.528 22.528 0 0 1-18.432 9.216 24.576 24.576 0 0 1-7.168-1.024l-26.624-10.24a118.784 118.784 0 0 1-39.936 22.528l-5.12 29.696a20.48 20.48 0 0 1-20.48 16.384h-20.48a20.48 20.48 0 0 1-20.48-16.384l-4.096-29.696a102.4 102.4 0 0 1-37.888-20.48l-28.672 10.24a24.576 24.576 0 0 1-8.192 1.024 21.504 21.504 0 0 1-17.408-10.24l-10.24-16.384a19.456 19.456 0 0 1 5.12-25.6l23.552-19.456a103.424 103.424 0 0 1-3.072-21.504 96.256 96.256 0 0 1 3.072-20.48l-23.552-20.48a19.456 19.456 0 0 1-5.12-25.6l10.24-17.408a20.48 20.48 0 0 1 18.432-10.24 24.576 24.576 0 0 1 7.168 2.048l28.672 10.24a117.76 117.76 0 0 1 37.888-21.504L419.84 286.72a19.456 19.456 0 0 1 20.48-16.384h20.48a19.456 19.456 0 0 1 20.48 15.36l5.12 29.696a115.712 115.712 0 0 1 37.888 20.48l28.672-10.24a24.576 24.576 0 0 1 7.168-2.048 21.504 21.504 0 0 1 18.432 10.24l10.24 16.384a20.48 20.48 0 0 1-5.12 26.624l-23.552 19.456a98.304 98.304 0 0 1 2.048 21.504 96.256 96.256 0 0 1-2.048 20.48l23.552 19.456a20.48 20.48 0 0 1 5.12 26.624z"  /></svg>`,
        color: '#00d2e6'
    },
    description: {
        en_US: 'A middleware that add skills to the agent. Requires the File toolset to be used together.',
        zh_Hans: '一个中间件，允许向智能体添加技能。需要配合 File 工具集一起使用。'
    },
    features: ['sandbox'],
    configSchema: {
        type: 'object',
        properties: {
            skills: {
                type: 'array',
                title: {
                    en_US: 'Default Skills',
                    zh_Hans: '默认技能'
                },
                description: {
                    en_US: 'Skills loaded by default. Users can turn them off from ChatKit runtime selection.',
                    zh_Hans: '默认加载的技能。用户可以在 ChatKit 运行时选择中取消勾选。'
                },
                default: [],
                items: {
                    type: 'string'
                },
                'x-ui': {
                    component: 'skills-select',
                    span: 2
                }
            },
            systemPrompt: {
                type: 'string',
                title: {
                    en_US: 'System Prompt',
                    zh_Hans: '系统提示'
                },
                description: {
                    en_US: 'Custom system prompt to prepend to the default todo list middleware prompt.',
                    zh_Hans: '自定义系统提示，添加到默认的待办事项中间件提示之前。'
                },
                'x-ui': {
                    component: 'textarea',
                    span: 2
                }
            },
            autoDiscovery: {
                type: 'object',
                title: {
                    en_US: 'Auto Skill Discovery',
                    zh_Hans: '自动发现技能'
                },
                description: {
                    en_US: 'Let the agent search indexed repositories and install relevant skills in the current Project, or authoring Workspace outside a Project, for future reuse.',
                    zh_Hans: '允许智能体搜索已索引的技能仓库，安装到当前项目；无项目时安装到资源工作空间，供后续复用。'
                },
                'x-ui': {
                    cols: 2,
                    span: 2
                },
                properties: {
                    enabled: {
                        type: 'boolean',
                        default: false,
                        title: {
                            en_US: 'Enable Auto Discovery',
                            zh_Hans: '启用自动发现'
                        },
                        description: {
                            en_US: 'Disabled by default to preserve existing agent behavior.',
                            zh_Hans: '默认关闭，以保持现有智能体行为不变。'
                        }
                    },
                    repositoryIds: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        title: {
                            en_US: 'Repository Scope',
                            zh_Hans: '仓库范围'
                        },
                        description: {
                            en_US: 'Optional repository allowlist. Leave empty to search all visible indexed repositories.',
                            zh_Hans: '可选仓库白名单。留空则搜索所有当前可见且已索引的仓库。'
                        },
                        'x-ui': {
                            component: 'remoteSelect',
                            selectUrl: '/api/skill-repository/select-options',
                            multiple: true,
                            span: 2
                        }
                    },
                    searchLimit: {
                        type: 'integer',
                        default: DEFAULT_AUTO_DISCOVERY_SEARCH_LIMIT,
                        minimum: 1,
                        maximum: MAX_AUTO_DISCOVERY_SEARCH_LIMIT,
                        title: {
                            en_US: 'Search Limit',
                            zh_Hans: '搜索数量'
                        },
                        description: {
                            en_US: 'Maximum number of skills returned by each repository search.',
                            zh_Hans: '每次技能仓库搜索最多返回的技能数量。'
                        }
                    },
                    maxInstallPerRun: {
                        type: 'integer',
                        default: DEFAULT_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN,
                        minimum: 1,
                        maximum: MAX_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN,
                        title: {
                            en_US: 'Install Limit',
                            zh_Hans: '安装上限'
                        },
                        description: {
                            en_US: 'Maximum number of skills the agent can install in one tool call.',
                            zh_Hans: '智能体单次工具调用最多可安装的技能数量。'
                        }
                    }
                }
            }
        }
    }
}
