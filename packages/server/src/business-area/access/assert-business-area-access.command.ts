import type { TBusinessAreaAction } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

/** Authorize the current actor against one business area, preserving current tenant and organization boundaries. */
export class AssertBusinessAreaAccessCommand extends Command<void> {
	constructor(
		public readonly businessAreaId: string,
		public readonly action: TBusinessAreaAction
	) {
		super()
	}
}
