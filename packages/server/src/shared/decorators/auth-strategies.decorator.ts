import { SetMetadata } from '@nestjs/common'

export const AUTH_STRATEGIES_METADATA = 'authStrategies'
export type AuthenticationStrategy = 'jwt' | 'basic' | 'api-key'

/** Method strategies replace class strategies; explicit authentication takes precedence over Public. */
export const AuthStrategies = (...strategies: [AuthenticationStrategy, ...AuthenticationStrategy[]]) =>
	SetMetadata(AUTH_STRATEGIES_METADATA, strategies)
