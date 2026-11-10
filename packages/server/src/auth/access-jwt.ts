import type { AccessTokenClaims } from '@xpert-ai/contracts'
import { JsonWebTokenError, verify, type Secret } from 'jsonwebtoken'
import { EntityManager, IsNull } from 'typeorm'
import { PasswordReset } from '../password-reset/password-reset.entity'
import { tokenDigest } from '../password-reset/reset-token'

export const ACCESS_TOKEN_PURPOSE = 'access'

/** Call after signature verification. Only unmarked tokens may need the legacy reset lookup. */
export async function isAccessJwtAllowed(
	manager: EntityManager,
	token: string | null,
	purpose: unknown
): Promise<boolean> {
	if (!token) return false
	if (purpose === ACCESS_TOKEN_PURPOSE) return true
	if (purpose !== undefined) return false
	return !(await manager.existsBy(PasswordReset, { userId: IsNull(), token: tokenDigest(token) }))
}

export async function verifyAccessJwt(
	manager: EntityManager,
	token: string,
	secret: Secret
): Promise<Pick<AccessTokenClaims, 'id' | 'thirdPartyId' | 'tenantId' | 'role'>> {
	const claims = verify(token, secret)
	if (typeof claims === 'string' || !(await isAccessJwtAllowed(manager, token, claims.purpose))) {
		throw new JsonWebTokenError('Invalid access token')
	}
	const { id, thirdPartyId, tenantId, role } = claims
	return { id, thirdPartyId, tenantId, role }
}
