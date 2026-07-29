import { createHash } from 'crypto'
import { HttpException, HttpStatus, Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { t } from 'i18next'
import { REDIS_CLIENT } from '../core/redis/types'

type RedisClientLike = {
	eval?: (
		script: string,
		options: {
			keys: string[]
			arguments: string[]
		}
	) => Promise<unknown>
}

const VALIDATION_WINDOW_MS = 60_000
const VALIDATION_LIMIT = 30
const VALIDATION_RATE_LIMIT_PREFIX = 'referral:validation-rate:'
const INCREMENT_WITH_EXPIRY_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`

@Injectable()
export class ReferralValidationRateLimitService {
	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientLike
	) {}

	async assertAllowed(tenantId: string, identifier: string) {
		if (typeof this.redisClient.eval !== 'function') {
			throw new InternalServerErrorException(
				t('server-ai:Error.ReferralValidationRateLimitUnavailable', {
					defaultValue: 'Invitation code validation rate limiting is unavailable.'
				})
			)
		}

		const result = await this.redisClient.eval(INCREMENT_WITH_EXPIRY_SCRIPT, {
			keys: [this.buildKey(tenantId, identifier)],
			arguments: [String(VALIDATION_WINDOW_MS)]
		})
		const count = this.toCount(result)
		if (count > VALIDATION_LIMIT) {
			throw new HttpException(
				t('server-ai:Error.ReferralValidationRateLimited', {
					defaultValue: 'Too many invitation code validation attempts.'
				}),
				HttpStatus.TOO_MANY_REQUESTS
			)
		}
	}

	private buildKey(tenantId: string, identifier: string) {
		const identifierHash = createHash('sha256').update(identifier).digest('hex').slice(0, 32)
		return `${VALIDATION_RATE_LIMIT_PREFIX}${tenantId}:${identifierHash}`
	}

	private toCount(value: unknown) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value
		}
		if (typeof value === 'string') {
			const parsed = Number(value)
			if (Number.isFinite(parsed)) {
				return parsed
			}
		}
		throw new InternalServerErrorException(
			t('server-ai:Error.ReferralValidationRateLimitUnavailable', {
				defaultValue: 'Invitation code validation rate limiting is unavailable.'
			})
		)
	}
}
