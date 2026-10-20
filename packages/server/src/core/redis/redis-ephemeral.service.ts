// Invariants: tickets are consumed once across API replicas; leases are owned.
// Redis failures propagate so security-sensitive callers fail closed.
import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { REDIS_CLIENT } from './types'

const CONSUME = `local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v`
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0`
const RENEW = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end; return 0`
const TRANSFER = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3]); return 1`
const TOUCH_ACTIVITY = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
local latest = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
redis.call('PEXPIRE', KEYS[1], math.ceil(tonumber(latest[2]) - now))
return 1`
const ACTIVITY_REMAINING = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local latest = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
if #latest == 0 then return 0 end
return math.max(0, math.ceil(tonumber(latest[2]) - now))`

@Injectable()
export class RedisEphemeralService {
	constructor(@Inject(REDIS_CLIENT) private readonly redis: Pick<RedisClientType, 'set' | 'get' | 'eval' | 'zRem'>) {}

	async issueTicket(namespace: string, payload: string, ttlMs = 30_000): Promise<string> {
		assertTtl(ttlMs, 300_000)
		if (Buffer.byteLength(payload) > 64 * 1024) throw new Error('Ticket payload exceeds 64 KiB')
		const ticket = randomBytes(32).toString('hex')
		const stored = await this.redis.set(this.ticketKey(namespace, ticket), payload, { PX: ttlMs, NX: true })
		if (stored !== 'OK') throw new Error('Unable to issue connection ticket')
		return ticket
	}

	async consumeTicket(namespace: string, ticket: string): Promise<string | null> {
		if (!/^[a-f0-9]{64}$/.test(ticket)) return null
		const value = await this.redis.eval(CONSUME, { keys: [this.ticketKey(namespace, ticket)], arguments: [] })
		return typeof value === 'string' ? value : null
	}

	async acquireLease(resource: string, owner: string, ttlMs: number): Promise<boolean> {
		assertTtl(ttlMs)
		assertOwner(owner)
		return (await this.redis.set(this.key('lease', resource), owner, { NX: true, PX: ttlMs })) === 'OK'
	}

	async leaseOwner(resource: string): Promise<string | null> {
		return this.redis.get(this.key('lease', resource))
	}

	async renewLease(resource: string, owner: string, ttlMs: number): Promise<boolean> {
		assertTtl(ttlMs)
		assertOwner(owner)
		return (
			(await this.redis.eval(RENEW, {
				keys: [this.key('lease', resource)],
				arguments: [owner, String(ttlMs)]
			})) === 1
		)
	}

	async transferLease(resource: string, owner: string, nextOwner: string, ttlMs: number): Promise<boolean> {
		assertTtl(ttlMs)
		assertOwner(owner)
		assertOwner(nextOwner)
		return (
			(await this.redis.eval(TRANSFER, {
				keys: [this.key('lease', resource)],
				arguments: [owner, nextOwner, String(ttlMs)]
			})) === 1
		)
	}

	async releaseLease(resource: string, owner: string): Promise<boolean> {
		assertOwner(owner)
		return (
			(await this.redis.eval(RELEASE, {
				keys: [this.key('lease', resource)],
				arguments: [owner]
			})) === 1
		)
	}

	async touchActivity(resource: string, owner: string, ttlMs: number): Promise<void> {
		assertTtl(ttlMs)
		assertOwner(owner)
		await this.redis.eval(TOUCH_ACTIVITY, {
			keys: [this.key('activity', resource)],
			arguments: [owner, String(ttlMs)]
		})
	}

	async releaseActivity(resource: string, owner: string): Promise<void> {
		assertOwner(owner)
		await this.redis.zRem(this.key('activity', resource), owner)
	}

	async activityRemainingMs(resource: string): Promise<number> {
		const value = await this.redis.eval(ACTIVITY_REMAINING, {
			keys: [this.key('activity', resource)],
			arguments: []
		})
		if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid activity lease response')
		return Math.max(0, value)
	}

	private ticketKey(namespace: string, ticket: string): string {
		return this.key('ticket', `${namespace}:${ticket}`)
	}

	private key(kind: string, resource: string): string {
		if (!resource || resource.length > 4096) throw new Error('Invalid ephemeral resource')
		return `xpert:ephemeral:${kind}:${createHash('sha256').update(resource).digest('hex')}`
	}
}

function assertOwner(owner: string): void {
	if (!owner || owner.length > 4096) throw new Error('Invalid lease owner')
}

function assertTtl(ttlMs: number, maximum = 24 * 60 * 60 * 1000): void {
	if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > maximum) throw new Error('Invalid lease lifetime')
}
