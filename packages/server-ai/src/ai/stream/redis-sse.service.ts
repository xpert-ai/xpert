import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { REDIS_CLIENT } from '@metad/server-core'
import type { RedisClientType } from 'redis'
import { randomUUID } from 'crypto'
import { Observable } from 'rxjs'

interface StreamEntry {
	id: string
	data: unknown
}

export interface SseMessageEvent {
	data: unknown
	id?: string
	event?: string
	retry?: number
}

interface CreateSseStreamOptions {
	threadId: string
	runId: string
	lastEventId?: string
	mode: 'create' | 'join'
}

@Injectable()
export class RedisSseStreamService implements OnModuleInit, OnModuleDestroy {
	readonly #logger = new Logger(RedisSseStreamService.name)
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
			this.#logger.warn(`Failed to close Redis read client: ${error}`)
		}
	}

	getStreamKey(threadId: string, runId: string) {
		return `ai:sse:thread:${threadId}:run:${runId}`
	}

	getLockKey(threadId: string, runId: string) {
		return `ai:sse:lock:thread:${threadId}:run:${runId}`
	}

	async appendEvent(threadId: string, runId: string, data: unknown) {
		const streamKey = this.getStreamKey(threadId, runId)
		const maxLen = this.getStreamMaxLen()
		const ttlSeconds = this.getStreamTtlSeconds()

		try {
			const payload = JSON.stringify(data ?? null)
			const args = ['XADD', streamKey, 'MAXLEN', '~', `${maxLen}`, '*', 'data', payload]
			const id = (await this.redis.sendCommand(args)) as string
			if (ttlSeconds > 0) {
				await this.redis.expire(streamKey, ttlSeconds)
			}
			return id
		} catch (error) {
			this.#logger.warn(`Failed to append SSE event: ${error}`)
			return null
		}
	}

	async createSseStream(options: CreateSseStreamOptions) {
		const { threadId, runId } = options
		const streamKey = this.getStreamKey(threadId, runId)
		const lockKey = this.getLockKey(threadId, runId)
		const lockTtl = this.getLockTtlMs()
		const lockId = await this.acquireLock(lockKey, lockTtl)

		if (!lockId) {
			return {
				lockId: null,
				stream: new Observable<SseMessageEvent>((subscriber) => {
					subscriber.error(new Error('STREAM_LOCKED'))
				})
			}
		}

		const stream = new Observable<SseMessageEvent>((subscriber) => {
			let active = true
			let lastId = this.normalizeStartId(options.lastEventId, options.mode)
			const readBlockMs = this.getReadBlockMs()
			const readCount = this.getReadCount()

			const refreshInterval = setInterval(() => {
				this.refreshLock(lockKey, lockId, lockTtl).catch((err) => {
					this.#logger.warn(`Failed to refresh SSE lock: ${err}`)
				})
			}, Math.max(Math.floor(lockTtl / 2), 1000))

			const run = async () => {
				try {
					if (lastId !== '$') {
						const replayEntries = await this.readRange(streamKey, lastId, readCount)
						for (const entry of replayEntries) {
							if (!active) return
							subscriber.next({ id: entry.id, data: entry.data })
							lastId = entry.id
						}
					}

					while (active) {
						const entries = await this.readNewEntries(streamKey, lastId, readCount, readBlockMs)
						if (!entries.length) {
							continue
						}
						for (const entry of entries) {
							if (!active) return
							subscriber.next({ id: entry.id, data: entry.data })
							lastId = entry.id
						}
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
				clearInterval(refreshInterval)
			}
		})

		return { lockId, stream }
	}

	async releaseLock(threadId: string, runId: string, lockId: string) {
		const lockKey = this.getLockKey(threadId, runId)
		return this.releaseLockByKey(lockKey, lockId)
	}

	private async readRange(streamKey: string, lastId: string, count: number): Promise<StreamEntry[]> {
		const client = this.readClient ?? this.redis
		const rangeArgs = ['XRANGE', streamKey, `(${lastId}`, '+', 'COUNT', `${count}`]
		const response = (await client.sendCommand(rangeArgs)) as Array<[string, string[]]> | null
		if (!response || response.length === 0) {
			return []
		}
		return response.map(([id, fields]) => ({ id, data: this.extractData(fields) }))
	}

	private async readNewEntries(streamKey: string, lastId: string, count: number, blockMs: number): Promise<StreamEntry[]> {
		const client = this.readClient ?? this.redis
		const args = ['XREAD', 'COUNT', `${count}`, 'BLOCK', `${blockMs}`, 'STREAMS', streamKey, lastId]
		const response = (await client.sendCommand(args)) as Array<[string, Array<[string, string[]]>]> | null
		if (!response || response.length === 0) {
			return []
		}

		const [, entries] = response[0] ?? []
		if (!entries) {
			return []
		}

		return entries.map(([id, fields]) => ({ id, data: this.extractData(fields) }))
	}

	private extractData(fields: string[]) {
		let raw: string | null = null
		for (let i = 0; i < fields.length; i += 2) {
			if (fields[i] === 'data') {
				raw = fields[i + 1]
				break
			}
		}
		if (!raw) {
			return null
		}
		try {
			return JSON.parse(raw)
		} catch (error) {
			return raw
		}
	}

	private normalizeStartId(lastEventId: string | undefined, mode: 'create' | 'join') {
		return '0-0'
	}

	private async acquireLock(key: string, ttl: number): Promise<string | null> {
		const lockId = randomUUID()
		const result = (await this.redis.set(key, lockId, { PX: ttl, NX: true })) as string | null
		return result ? lockId : null
	}

	private async refreshLock(key: string, lockId: string, ttl: number) {
		const script = `
			if redis.call("get", KEYS[1]) == ARGV[1] then
				return redis.call("pexpire", KEYS[1], ARGV[2])
			else
				return 0
			end
		`
		await this.redis.eval(script, { keys: [key], arguments: [lockId, `${ttl}`] })
	}

	private async releaseLockByKey(key: string, lockId: string) {
		const script = `
			if redis.call("get", KEYS[1]) == ARGV[1] then
				return redis.call("del", KEYS[1])
			else
				return 0
			end
		`
		const result = await this.redis.eval(script, { keys: [key], arguments: [lockId] })
		return result === 1
	}

	private getStreamMaxLen() {
		return Number(process.env.AI_SSE_STREAM_MAXLEN ?? 10000)
	}

	private getStreamTtlSeconds() {
		return Number(process.env.AI_SSE_STREAM_TTL_SECONDS ?? 86400)
	}

	private getLockTtlMs() {
		return Number(process.env.AI_SSE_LOCK_TTL_MS ?? 30000)
	}

	private getReadBlockMs() {
		return Number(process.env.AI_SSE_READ_BLOCK_MS ?? 200)
	}

	private getReadCount() {
		return Number(process.env.AI_SSE_READ_COUNT ?? 500)
	}
}
