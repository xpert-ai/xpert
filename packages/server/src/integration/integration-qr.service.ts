// Invariants: QR credentials never leave the server; sessions belong to one user and organization.
// Redis locks serialize polling, completion and cancellation across API instances.
import { createHash, randomUUID } from 'crypto'
import {
	Inject,
	Injectable,
	BadRequestException,
	BadGatewayException,
	ConflictException,
	NotFoundException
} from '@nestjs/common'
import type {
	TAvatar,
	TIntegrationQrCompletion,
	TIntegrationQrResult,
	TIntegrationQrSession
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { RedisClientType } from 'redis'
import { t } from 'i18next'
import { z } from 'zod'
import { REDIS_CLIENT } from '../core/redis/types'
import { RedisLockService } from '../core/redis/redis-lock.service'
import { IntegrationService } from './integration.service'

const metadataSchema = z.object({
	description: z.string().max(10000).nullish(),
	avatar: z
		.object({
			emoji: z
				.object({
					id: z.string(),
					set: z.enum(['', 'apple', 'google', 'twitter', 'facebook']).optional(),
					colons: z.string().optional(),
					unified: z.string().optional()
				})
				.optional(),
			useNotoColor: z.boolean().optional(),
			background: z.string().optional(),
			url: z.string().optional()
		})
		.transform((avatar) => avatar as TAvatar)
		.nullish()
})
const sessionSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().min(1),
	tenantId: z.string().min(1),
	organizationId: z.string().min(1),
	provider: z.string().min(1),
	context: z.object({ xpertId: z.string(), triggerProvider: z.string() }).optional(),
	name: z.string().min(1),
	metadata: metadataSchema.optional(),
	deviceCode: z.string(),
	expiresAt: z.number(),
	intervalSeconds: z.number(),
	nextPollAt: z.number(),
	status: z.enum(['waiting', 'authorized', 'expired', 'denied', 'failed']),
	options: z.record(z.unknown()).optional(),
	integrationId: z.string().uuid().optional()
})
type QrSession = z.infer<typeof sessionSchema>
const beginSchema = metadataSchema.extend({ name: z.string().trim().min(1).max(100) })

@Injectable()
export class IntegrationQrService {
	constructor(
		@Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
		private readonly locks: RedisLockService,
		private readonly integrations: IntegrationService
	) {}

	async begin(provider: string, input: unknown, context?: QrSession['context']): Promise<TIntegrationQrSession> {
		const parsed = beginSchema.safeParse(input)
		if (!parsed.success) throw this.invalid()
		const owner = this.owner()
		const strategy = this.strategy(provider)
		const purpose = context
			? `trigger:${createHash('sha256')
					.update(JSON.stringify([context.xpertId, context.triggerProvider]))
					.digest('hex')}`
			: 'integration'
		const activeKey = `integration:qr:active:${owner.tenantId}:${owner.organizationId}:${owner.userId}:${provider}:${purpose}`
		return this.lock(activeKey, async () => {
			const previous = await this.redis.get(activeKey)
			if (previous) await this.cancel(previous)
			const registration = await strategy.beginQrAuthorization().catch(() => {
				throw new BadGatewayException(
					t('server-ai:Error.IntegrationQrUnavailable', {
						defaultValue: 'Unable to start QR authorization. Please retry or use manual setup.'
					})
				)
			})
			const id = randomUUID()
			const expiresAt = Date.now() + Math.min(600, Math.max(30, registration.expiresInSeconds)) * 1000
			const intervalSeconds = Math.max(2, registration.intervalSeconds)
			await this.write({
				id,
				...owner,
				provider,
				context,
				name: parsed.data.name,
				metadata: { description: parsed.data.description, avatar: parsed.data.avatar },
				deviceCode: registration.deviceCode,
				expiresAt,
				intervalSeconds,
				nextPollAt: 0,
				status: 'waiting'
			})
			await this.redis.set(activeKey, id, { PX: expiresAt - Date.now() })
			return { id, authorizationUrl: registration.authorizationUrl, expiresAt, intervalSeconds }
		})
	}

	async poll(id: string): Promise<TIntegrationQrResult> {
		return this.lock(this.key(id), async () => {
			const session = await this.read(id)
			if (session.status !== 'waiting' || session.nextPollAt > Date.now()) return { status: session.status }
			const strategy = this.strategy(session.provider)
			session.nextPollAt = Date.now() + session.intervalSeconds * 1000
			await this.write(session)
			const result = await strategy.pollQrAuthorization(session.deviceCode).catch(() => {
				throw new BadGatewayException(
					t('server-ai:Error.IntegrationQrPollFailed', {
						defaultValue: 'Unable to check authorization. Please try again.'
					})
				)
			})
			session.status = result.status
			if (result.status === 'authorized') session.options = result.options
			await this.write(session)
			return { status: session.status }
		})
	}

	async complete(id: string): Promise<TIntegrationQrCompletion> {
		return this.lock(this.key(id), async () => {
			const session = await this.read(id)
			if (session.status !== 'authorized') throw this.invalid()
			// The session id also identifies the new integration, making retries idempotent after a crash.
			let integration = await this.integrations.readOneById(session.integrationId ?? id)
			if (integration) {
				if (
					integration.tenantId !== session.tenantId ||
					integration.organizationId !== session.organizationId ||
					integration.provider !== session.provider
				) {
					throw this.invalid()
				}
			} else {
				if (!session.options) throw this.invalid()
				const strategy = this.strategy(session.provider)
				const identify = strategy.getQrAuthorizationIdentity?.bind(strategy)
				const identity = identify?.(session.options)
				const save = async () => {
					const candidates = identity
						? await this.integrations.findAll({
								where: {
									provider: session.provider,
									tenantId: session.tenantId,
									organizationId: session.organizationId
								},
								order: { createdAt: 'ASC', id: 'ASC' }
							})
						: null
					const existing = candidates?.items.find((item) => identify?.(item.options) === identity)
					const input = await this.integrations.applyStrategyValidation({
						...(!existing ? session.metadata : {}),
						provider: session.provider,
						name: existing?.name ?? session.name,
						options: { ...existing?.options, ...session.options },
						features: existing?.features ?? strategy.meta.features ?? [],
						tenantId: session.tenantId,
						organizationId: session.organizationId
					})
					if (existing) {
						await this.integrations.update(existing.id, { options: input.options })
						const updated = await this.integrations.readOneById(existing.id)
						if (!updated) throw this.invalid()
						await this.integrations.runStrategyUpdateHook(existing, updated)
						return updated
					}
					return this.integrations.create({ ...input, id })
				}
				integration = identity
					? await this.lock(
							`integration:qr:account:${session.tenantId}:${session.organizationId}:${session.provider}:${createHash('sha256').update(identity).digest('hex')}`,
							save
						)
					: await save()
			}
			session.integrationId = integration.id
			session.options = undefined
			session.deviceCode = ''
			await this.write(session)
			return {
				id: integration.id,
				name: integration.name,
				slug: integration.slug,
				provider: integration.provider,
				outcome: integration.id === id ? 'created' : 'reused'
			}
		})
	}

	async cancel(id: string): Promise<void> {
		await this.lock(this.key(id), async () => {
			const session = await this.read(id, true)
			if (session) await this.redis.del(this.key(id))
		})
	}

	async assertContext(id: string, xpertId: string, triggerProvider: string) {
		const session = await this.read(id)
		if (session.context?.xpertId !== xpertId || session.context?.triggerProvider !== triggerProvider)
			throw this.invalid()
	}

	private strategy(provider: string) {
		const strategy = this.integrations.getIntegrationStrategy(provider)
		if (!strategy?.meta.setup?.qrAuthorization || !strategy.beginQrAuthorization || !strategy.pollQrAuthorization) {
			throw this.invalid()
		}
		return strategy
	}

	private owner() {
		const userId = RequestContext.currentUserId()
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		if (!userId || !tenantId || !organizationId) throw this.invalid()
		return { userId, tenantId, organizationId }
	}

	private async read(id: string, allowMissing = false): Promise<QrSession | null> {
		const owner = this.owner()
		const raw = await this.redis.get(this.key(id))
		const parsed = raw ? sessionSchema.safeParse(JSON.parse(raw)) : null
		if (!parsed?.success || parsed.data.expiresAt <= Date.now()) {
			if (allowMissing) return null
			throw new NotFoundException(
				t('server-ai:Error.IntegrationQrExpired', {
					defaultValue: 'QR authorization expired. Please refresh the code.'
				})
			)
		}
		const session = parsed.data
		if (
			session.userId !== owner.userId ||
			session.tenantId !== owner.tenantId ||
			session.organizationId !== owner.organizationId
		) {
			throw new NotFoundException(
				t('server-ai:Error.IntegrationQrExpired', {
					defaultValue: 'QR authorization expired. Please refresh the code.'
				})
			)
		}
		return session
	}

	private async write(session: QrSession) {
		const ttl = session.expiresAt - Date.now()
		if (ttl <= 0)
			throw new NotFoundException(
				t('server-ai:Error.IntegrationQrExpired', {
					defaultValue: 'QR authorization expired. Please refresh the code.'
				})
			)
		await this.redis.set(this.key(session.id), JSON.stringify(session), { PX: ttl })
	}

	private key(id: string) {
		if (!z.string().uuid().safeParse(id).success) throw this.invalid()
		return `integration:qr:session:${id}`
	}

	private async lock<T>(key: string, operation: () => Promise<T>): Promise<T> {
		const result = await this.locks.runWithLock(`${key}:lock`, 60000, operation)
		if (result.acquired === false)
			throw new ConflictException(
				t('server-ai:Error.IntegrationQrBusy', { defaultValue: 'Authorization is busy. Please retry shortly.' })
			)
		return result.value
	}

	private invalid() {
		return new BadRequestException(
			t('server-ai:Error.IntegrationQrInvalid', {
				defaultValue: 'QR authorization is not available for this request.'
			})
		)
	}
}
