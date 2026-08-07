import { Injectable } from '@nestjs/common'
import { IApiPrincipal, IUser } from '@xpert-ai/contracts'
import { type ActorTokenAct, type ActorTokenRequest, type ActorTokenResult } from '@xpert-ai/plugin-sdk'
import { environment as env } from '@xpert-ai/server-config'
import { randomUUID } from 'crypto'
import { sign } from 'jsonwebtoken'
import { RequestContext } from '../core/context'

const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60
const DEFAULT_ACTOR_TOKEN_AUDIENCE = 'xpert'

export type OutboundActorTokenAct = ActorTokenAct

export interface OutboundActorTokenRequest extends ActorTokenRequest {
	user?: IUser | null
	tenantId?: string | null
	organizationId?: string | null
	roles?: string[] | null
	clientId?: string | null
}

export abstract class OutboundActorTokenProvider {
	abstract mint(input?: OutboundActorTokenRequest): ActorTokenResult
	isAvailable?(): boolean
}

@Injectable()
export class LocalOutboundActorTokenProvider extends OutboundActorTokenProvider {
	isAvailable(): boolean {
		return Boolean(readSigningSecret())
	}

	mint(input: OutboundActorTokenRequest = {}): ActorTokenResult {
		const secret = readSigningSecret()
		if (!secret) {
			throw new Error('JWT_SECRET is required to mint outbound actor tokens')
		}

		const user = input.user ?? RequestContext.currentUser()
		const delegatedUserId = normalizeString(user?.id)
		const tenantId = normalizeString(input.tenantId) ?? normalizeString(user?.tenantId)
		const organizationId = normalizeString(input.organizationId)

		if (!delegatedUserId || !tenantId) {
			throw new Error('outbound actor token is missing tenant or user identity')
		}

		const ttlSeconds = readTokenTtlSeconds(input.ttlSeconds)
		const audience = readTokenAudience(
			input.audience,
			process.env.XPERT_OUTBOUND_ACTOR_TOKEN_AUDIENCE,
			DEFAULT_ACTOR_TOKEN_AUDIENCE
		)
		const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

		const token = sign(
			pruneUndefined({
				typ: 'actor',
				id: delegatedUserId,
				tenantId,
				employeeId: normalizeString(user?.employeeId) ?? null,
				client_id: normalizeString(input.clientId) ?? 'xpert',
				email: normalizeString(user?.email),
				name: readUserDisplayName(user, delegatedUserId),
				preferred_username: normalizeString(user?.username) ?? normalizeString(user?.email),
				role: normalizeString(user?.role?.name),
				roles: readRoles(input.roles, user),
				permissions: readPermissions(user),
				tenant_id: tenantId,
				org_id: organizationId,
				act: buildAct(input.act, RequestContext.currentApiPrincipal())
			}),
			secret,
			{
				algorithm: 'HS256',
				audience,
				expiresIn: ttlSeconds,
				jwtid: randomUUID(),
				subject: delegatedUserId
			}
		)

		return {
			token,
			expiresAt,
			audience
		}
	}
}

function buildAct(
	inputAct: OutboundActorTokenAct | null | undefined,
	principal: IApiPrincipal | null
): OutboundActorTokenAct | undefined {
	const act = pruneUndefined({
		...(inputAct ?? {}),
		...(principal?.principalType ? { principal_type: principal.principalType } : {}),
		...(principal?.apiKey?.id ? { api_key_id: principal.apiKey.id } : {}),
		...(principal?.apiKey?.type ? { api_key_type: principal.apiKey.type } : {}),
		...(principal?.apiKey?.entityId ? { api_key_entity_id: principal.apiKey.entityId } : {}),
		...(principal?.clientSecretBindingType
			? { client_secret_binding_type: principal.clientSecretBindingType }
			: {}),
		...(principal?.clientSecretId ? { client_secret_id: principal.clientSecretId } : {}),
		...(principal?.apiKeyUserId ? { technical_user_id: principal.apiKeyUserId } : {}),
		...(principal?.requestedUserId ? { requested_user_id: principal.requestedUserId } : {})
	})

	return Object.keys(act).length ? act : undefined
}

function readTokenAudience(
	inputAudience?: string | string[] | null,
	envAudience?: string | null,
	defaultAudience?: string | null
): string | string[] {
	if (Array.isArray(inputAudience)) {
		const values = inputAudience.map((item) => normalizeString(item)).filter((item): item is string => !!item)
		if (values.length) {
			return values.length === 1 ? values[0] : values
		}
	}

	const raw = normalizeString(inputAudience) ?? normalizeString(envAudience) ?? normalizeString(defaultAudience)
	const audiences = raw
		?.split(',')
		.map((item) => item.trim())
		.filter(Boolean)

	if (!audiences?.length) {
		return DEFAULT_ACTOR_TOKEN_AUDIENCE
	}

	return audiences.length === 1 ? audiences[0] : audiences
}

function readTokenTtlSeconds(inputTtl?: number | null): number {
	const rawValue =
		inputTtl ?? Number.parseInt(normalizeString(process.env.XPERT_OUTBOUND_ACTOR_TOKEN_TTL_SECONDS) ?? '', 10)
	if (!Number.isFinite(rawValue) || rawValue <= 0) {
		return DEFAULT_TOKEN_TTL_SECONDS
	}

	return Math.min(Math.floor(rawValue), DEFAULT_TOKEN_TTL_SECONDS)
}

function readRoles(inputRoles: string[] | null | undefined, user: IUser | null | undefined): string[] | undefined {
	const roles = (inputRoles ?? (user?.role?.name ? [user.role.name] : []))
		.map((role) => normalizeString(role))
		.filter((role): role is string => !!role)
	return roles.length ? [...new Set(roles)] : undefined
}

function readPermissions(user: IUser | null | undefined): string[] | undefined {
	const permissions = user?.role?.rolePermissions
		?.filter((rolePermission) => rolePermission?.enabled && rolePermission?.permission)
		.map((rolePermission) => rolePermission.permission)
	return permissions?.length ? [...new Set(permissions)] : undefined
}

function readUserDisplayName(user: IUser | null | undefined, fallback: string): string {
	const nameParts = [user?.firstName, user?.lastName].filter(Boolean)
	return (
		normalizeString(nameParts.join(' ')) ??
		normalizeString(user?.name) ??
		normalizeString(user?.fullName) ??
		normalizeString(user?.username) ??
		normalizeString(user?.email) ??
		fallback
	)
}

function readSigningSecret(): string | null {
	return normalizeString(process.env.JWT_SECRET) ?? normalizeString(env.JWT_SECRET)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T
}

function normalizeString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
