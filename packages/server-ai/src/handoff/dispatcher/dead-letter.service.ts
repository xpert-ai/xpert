import { Injectable, Logger } from '@nestjs/common'
import { HandoffMessage } from '../processor/processor.interface'

@Injectable()
export class HandoffDeadLetterService {
	readonly #logger = new Logger(HandoffDeadLetterService.name)

	/**
	 * v1 仅记录日志；后续可接 DB 表或外部告警系统。
	 */
	async record(message: HandoffMessage, reason: string) {
		this.#logger.error(
			`Dead letter: type=${message.type}, id=${message.id}, traceId=${message.traceId}, reason=${reason}`
		)
	}
}

