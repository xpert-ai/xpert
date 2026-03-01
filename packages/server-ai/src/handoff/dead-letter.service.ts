import { Injectable, Logger } from '@nestjs/common'
import { HandoffMessage } from '@xpert-ai/plugin-sdk'

@Injectable()
export class HandoffDeadService {
	readonly #logger = new Logger(HandoffDeadService.name)

	/**
	 * v1 only logs data; it can be connected to a DB table or an external alarm system later.
	 */
	async record(message: HandoffMessage, reason: string) {
		this.#logger.error(
			`Dead letter: type=${message.type}, id=${message.id}, traceId=${message.traceId}, reason=${reason}`
		)
	}
}
