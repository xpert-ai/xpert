import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, Repository } from 'typeorm'
import { ChatMessage } from './chat-message.entity'

@Injectable()
export class ChatMessageService extends TenantOrganizationAwareCrudService<ChatMessage> {
	private readonly logger = new Logger(ChatMessageService.name)

	constructor(
		@InjectRepository(ChatMessage)
		repository: Repository<ChatMessage>,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async update(id: string, entity: Partial<ChatMessage>) {
		let record: ChatMessage | null = null
		try {
			record = await super.findOne(id)
		} catch (error: any) {
			if (isNotFoundError(error)) {
				this.logger.debug(`Scoped chat message lookup missed id=${id}, falling back to id-only lookup`)
				record = await this.findOneByIdAnyScope(id)
			} else {
				throw error
			}
		}

		if (!record) {
			throw new Error(`Chat message ${id} not found`)
		}

		Object.assign(record, entity)
		return await this.repository.save(record)
	}

	async findOneByIdAnyScope(id: string, options?: FindOneOptions<ChatMessage>): Promise<ChatMessage | null> {
		return this.repository.findOne({
			...(options ?? {}),
			where: {
				id,
				...((options?.where as Record<string, any>) ?? {})
			} as any
		})
	}

	async deleteByIds(ids: string[]) {
		for await (const id of ids) {
			await this.softRemove(id)
		}
	}
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false
	}
	const anyError = error as any
	return (
		anyError?.status === 404 ||
		anyError?.response?.statusCode === 404 ||
		`${anyError?.message ?? ''}`.toLowerCase().includes('requested record was not found')
	)
}
