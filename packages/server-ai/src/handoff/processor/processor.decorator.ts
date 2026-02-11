import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '@xpert-ai/plugin-sdk'
import { HandoffProcessorMetadata } from './processor.interface'

/**
 * Handoff Processor 装饰器元数据 key。
 */
export const HANDOFF_PROCESSOR_META = 'XPERT_HANDOFF_PROCESSOR_META'
export const HANDOFF_PROCESSOR_STRATEGY = 'XPERT_HANDOFF_PROCESSOR_STRATEGY'

/**
 * 在 provider 上声明：
 * 1) 处理哪些 message type
 * 2) 默认执行策略（lane/timeout）
 */
export function HandoffProcessor(metadata: HandoffProcessorMetadata) {
	if (!metadata?.types?.length) {
		throw new Error('HandoffProcessor requires at least one message type')
	}
	return applyDecorators(
		SetMetadata(HANDOFF_PROCESSOR_META, metadata),
		// 让插件管理模块可以识别并通过 StrategyBus 上报该 provider。
		SetMetadata(STRATEGY_META_KEY, HANDOFF_PROCESSOR_STRATEGY)
	)
}
