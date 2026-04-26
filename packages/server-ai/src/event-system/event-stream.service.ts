import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import {
	isXpertEvent,
	matchesXpertEventFilter,
	XpertEvent,
	XpertEventFilter,
	XpertEventRecord
} from '@xpert-ai/contracts'
import type { RedisClientType } from 'redis'
import { Observable } from 'rxjs'

interface StreamEntry {
	id: string
	data: XpertEvent
}

export interface XpertEventStreamMessage {
	id?: string
	data: XpertEventRecord
}

export interface XpertEventStreamOptions {
	tenantId: string
	filter?: XpertEventFilter
	lastEventId?: string
}

@Injectable()
export class XpertEventStreamService implements OnModuleInit, OnModuleDestroy {
	readonly #logger = new Logger(XpertEventStreamService.name)
	private readClient?: RedisClientType

	constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

	async onModuleInit() {
		this.readClient = this.redis.duplicate()
		await this.readClient.connect()
	}

	async onModuleDestroy() {
		try {
			if (this.readClient) {
				await this.readClient.quit()
			}
		} catch (error) {
			this.#logger.warn(`Failed to close Xpert event read client: ${error}`)
		}
	}

	getStreamKey(tenantId: string) {
		return `xpert:event:${tenantId}`
	}

	async appendEvent(tenantId: string, event: XpertEvent): Promise<XpertEventRecord | null> {
		const streamKey = this.getStreamKey(tenantId)
		const maxLen = this.getStreamMaxLen()
		const ttlSeconds = this.getStreamTtlSeconds()

		try {
			const id = (await this.redis.sendCommand([
				'XADD',
				streamKey,
				'MAXLEN',
				'~',
				`${maxLen}`,
				'*',
				'data',
				JSON.stringify(event)
			])) as string
			if (ttlSeconds > 0) {
				await this.redis.expire(streamKey, ttlSeconds)
			}
			return {
				...event,
				streamId: id
			}
		} catch (error) {
			this.#logger.warn(`Failed to append Xpert event: ${error}`)
			return null
		}
	}

	async replay(options: XpertEventStreamOptions & { limit?: number }): Promise<XpertEventRecord[]> {
		const streamKey = this.getStreamKey(options.tenantId)
		const limit = this.normalizeReadLimit(options.limit)
		const entries = await this.readRange(streamKey, options.lastEventId ?? options.filter?.afterId ?? '0-0', limit)
		return this.toRecords(entries, options.filter).slice(0, limit)
	}

	createEventStream(options: XpertEventStreamOptions): Observable<XpertEventStreamMessage> {
		const streamKey = this.getStreamKey(options.tenantId)
		const filter = options.filter
		const readCount = this.getReadCount()
		const readBlockMs = this.getReadBlockMs()

		return new Observable<XpertEventStreamMessage>((subscriber) => {
			let active = true
			let lastId = options.lastEventId?.trim() || '$'

			const emitEntries = (entries: StreamEntry[]) => {
				for (const entry of entries) {
					if (!active) {
						return
					}
					lastId = entry.id
					const record = {
						...entry.data,
						streamId: entry.id
					}
					if (!matchesXpertEventFilter(record, filter)) {
						continue
					}
					subscriber.next({
						id: record.streamId,
						data: record
					})
				}
			}

			const run = async () => {
				try {
					if (lastId !== '$') {
						emitEntries(await this.readRange(streamKey, lastId, readCount))
					}

					while (active) {
						const entries = await this.readNewEntries(streamKey, lastId, readCount, readBlockMs)
						if (!entries.length) {
							continue
						}
						emitEntries(entries)
					}
				} catch (error) {
					if (active) {
						subscriber.error(error)
					}
				}
			}

			run()

			return () => {
				active = false
			}
		})
	}

	private async readRange(streamKey: string, lastId: string, count: number): Promise<StreamEntry[]> {
		const client = this.readClient ?? this.redis
		const response = await client.sendCommand(['XRANGE', streamKey, `(${lastId}`, '+', 'COUNT', `${count}`])
		return this.parseRangeResponse(response)
	}

	private async readNewEntries(
		streamKey: string,
		lastId: string,
		count: number,
		blockMs: number
	): Promise<StreamEntry[]> {
		const client = this.readClient ?? this.redis
		const response = await client.sendCommand([
			'XREAD',
			'COUNT',
			`${count}`,
			'BLOCK',
			`${blockMs}`,
			'STREAMS',
			streamKey,
			lastId
		])
		return this.parseReadResponse(response)
	}

	private parseRangeResponse(response: unknown): StreamEntry[] {
		if (!Array.isArray(response)) {
			return []
		}
		return response.flatMap((entry) => this.parseEntry(entry))
	}

	private parseReadResponse(response: unknown): StreamEntry[] {
		if (!Array.isArray(response)) {
			return []
		}
		return response.flatMap((streamResponse) => {
			if (!Array.isArray(streamResponse) || !Array.isArray(streamResponse[1])) {
				return []
			}
			return streamResponse[1].flatMap((entry) => this.parseEntry(entry))
		})
	}

	private parseEntry(entry: unknown): StreamEntry[] {
		if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
			return []
		}
		const data = this.extractData(entry[1])
		if (!data) {
			return []
		}
		return [
			{
				id: entry[0],
				data
			}
		]
	}

	private extractData(fields: unknown[]): XpertEvent | null {
		let raw: string | null = null
		for (let i = 0; i < fields.length; i += 2) {
			const value = fields[i + 1]
			if (fields[i] === 'data' && typeof value === 'string') {
				raw = value
				break
			}
		}
		if (!raw) {
			return null
		}
		try {
			const parsed: unknown = JSON.parse(raw)
			return isXpertEvent(parsed) ? parsed : null
		} catch (error) {
			this.#logger.warn(`Failed to parse Xpert event payload: ${error}`)
			return null
		}
	}

	private toRecords(entries: StreamEntry[], filter?: XpertEventFilter): XpertEventRecord[] {
		return entries
			.map((entry) => ({
				...entry.data,
				streamId: entry.id
			}))
			.filter((event) => matchesXpertEventFilter(event, filter))
	}

	private normalizeReadLimit(limit?: number) {
		if (!limit || !Number.isFinite(limit)) {
			return this.getReadCount()
		}
		return Math.min(Math.max(Math.trunc(limit), 1), this.getMaxReplayLimit())
	}

	private getStreamMaxLen() {
		return Number(process.env.XPERT_EVENT_STREAM_MAXLEN ?? 50000)
	}

	private getStreamTtlSeconds() {
		return Number(process.env.XPERT_EVENT_STREAM_TTL_SECONDS ?? 86400)
	}

	private getReadBlockMs() {
		return Number(process.env.XPERT_EVENT_READ_BLOCK_MS ?? 200)
	}

	private getReadCount() {
		return Number(process.env.XPERT_EVENT_READ_COUNT ?? 500)
	}

	private getMaxReplayLimit() {
		return Number(process.env.XPERT_EVENT_REPLAY_MAX_LIMIT ?? 1000)
	}
}
