import { applyDecorators, SetMetadata } from '@nestjs/common'
import { HandoffProcessorMetadata } from './handoff.interface'
import { STRATEGY_META_KEY } from '../../types'

/**
 * Handoff Processor meta key。
 */
export const HANDOFF_PROCESSOR_STRATEGY = 'HANDOFF_PROCESSOR_STRATEGY'

/**
 * Declare on a provider:
 * 1) Which message types it handles
 * 2) Default execution policy (lane/timeout)
 */
export function HandoffProcessorStrategy(provider: string, metadata: HandoffProcessorMetadata) {
	if (!metadata?.types?.length) {
		throw new Error('HandoffProcessor requires at least one message type')
	}
	return applyDecorators(
		SetMetadata(HANDOFF_PROCESSOR_STRATEGY, provider),
		SetMetadata(STRATEGY_META_KEY, HANDOFF_PROCESSOR_STRATEGY)
	)
}
