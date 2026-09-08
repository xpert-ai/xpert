import { CONTEXT_COMPRESSION_MIDDLEWARE_NAME, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
    COMPRESSION_PRESERVE_THRESHOLD,
    PROTECTED_USER_TURNS
} from './context-compression-history'

export interface ContextCompressionMiddlewareOptions {
    /**
     * Compression threshold (fraction of model token limit)
     */
    threshold?: number
    /**
     * Fraction of history to preserve
     */
    preserveFraction?: number
    /**
     * Token budget for tool outputs
     */
    toolOutputBudget?: number
    /**
     * Number of lines to keep when truncating
     */
    truncateLines?: number
    /**
     * Whether to enable two-phase compression (prune first, then summarize)
     * Enabled by default
     */
    enableTwoPhaseCompression?: boolean
    /**
     * Prune protection threshold (tokens)
     */
    pruneProtectTokens?: number
    /**
     * Prune minimum threshold (tokens)
     */
    pruneMinimumTokens?: number
    /**
     * Number of user turns to protect
     */
    protectedUserTurns?: number
}

export interface ResolvedContextCompressionOptions {
    threshold: number
    preserveFraction: number
    toolOutputBudget: number
    enableTwoPhase: boolean
    pruneProtectTokens: number
    pruneMinimumTokens: number
    protectedUserTurns: number
    truncateLines?: number
}

export const CONTEXT_COMPRESSION_META: TAgentMiddlewareMeta = {
    name: CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
    label: {
        en_US: 'Context Compression Middleware',
        zh_Hans: '上下文压缩中间件'
    },
    icon: {
        type: 'svg',
        value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>`
    },
    description: {
        en_US: 'Two-phase context compression: first prunes old tool outputs, then generates summaries when needed. Preserves recent interactions and critical coding context.',
        zh_Hans: '双层上下文压缩：首先修剪旧工具输出，然后在需要时生成摘要。保留最近的交互和关键编码上下文。'
    },
    slashCommands: [
        {
            name: 'compact',
            aliases: ['compress'],
            label: {
                en_US: 'Compress',
                zh_Hans: '压缩'
            },
            description: {
                en_US: 'Compress this thread context',
                zh_Hans: '压缩此线程的上下文'
            },
            category: 'session',
            kind: 'command',
            action: {
                type: 'submit_prompt',
                template: '/compact'
            }
        }
    ],
    configSchema: {
        type: 'object',
        properties: {
            threshold: {
                type: 'number',
                default: DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
                title: {
                    en_US: 'Compression Threshold',
                    zh_Hans: '压缩阈值'
                },
                description: {
                    en_US: 'Trigger compression when token count exceeds this fraction of model limit (0.7 = 70%)',
                    zh_Hans: '当token数量超过模型限制的此比例时触发压缩（0.7 = 70%）'
                }
            },
            preserveFraction: {
                type: 'number',
                default: COMPRESSION_PRESERVE_THRESHOLD,
                title: {
                    en_US: 'Preserve Fraction',
                    zh_Hans: '保留比例'
                },
                description: {
                    en_US: 'Keep the last X% of history (0.3 = keep last 30%)',
                    zh_Hans: '保留最后X%的历史（0.3 = 保留最后30%）'
                }
            },
            enableTwoPhaseCompression: {
                type: 'boolean',
                default: true,
                title: {
                    en_US: 'Enable Two-Phase Compression',
                    zh_Hans: '启用双层压缩'
                },
                description: {
                    en_US: 'First prune old tool outputs, then generate summary if still over limit',
                    zh_Hans: '先修剪旧工具输出，如果仍超限则生成摘要'
                }
            },
            protectedUserTurns: {
                type: 'number',
                default: PROTECTED_USER_TURNS,
                title: {
                    en_US: 'Protected User Turns',
                    zh_Hans: '保护的用户回合数'
                },
                description: {
                    en_US: 'Number of recent user turns to protect from pruning',
                    zh_Hans: '保护最近多少个用户回合不被修剪'
                }
            }
        }
    }
}
