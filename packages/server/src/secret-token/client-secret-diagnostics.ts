// Why this exists: Passport can reject credentials before HTTP interceptors run.
// Never serialize errors or requests; credential IDs must be persisted UUIDs.
// Passport and the guard share one event and server-generated correlation ID per request.
import { ForbiddenException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { hostname } from 'node:os'

type FailureReason = 'expired' | 'not_found' | 'invalid' | 'scope_denied' | 'internal_error'
type FailureStage = 'credential_lookup' | 'credential_validation' | 'api_key' | 'principal' | 'route_binding' | 'grant'
const logger = new Logger('ClientSecretAuthentication')
const requests = new WeakMap<object, ClientSecretDiagnostics>()

function classifyFailure(error: unknown): FailureReason {
	if (error instanceof ForbiddenException) return 'scope_denied'
	if (error instanceof NotFoundException) return 'not_found'
	if (error instanceof UnauthorizedException) return 'invalid'
	return 'internal_error'
}

export class ClientSecretDiagnostics {
	readonly requestId = randomUUID()
	stage: FailureStage = 'credential_lookup'
	reason?: FailureReason
	credentialId?: string
	private reported = false

	fail(error: unknown, statusCode: number) {
		if (this.reported) return
		this.reported = true
		logger.warn(
			JSON.stringify({
				event: 'auth.client_secret.failed',
				requestId: this.requestId,
				stage: this.stage,
				reason: this.reason ?? classifyFailure(error),
				statusCode,
				...(typeof this.credentialId === 'string' && isUUID(this.credentialId)
					? { credentialId: this.credentialId }
					: {}),
				instance: hostname(),
				pid: process.pid
			})
		)
	}

	expose(response: Pick<ServerResponse, 'headersSent' | 'setHeader'>) {
		if (!response.headersSent) response.setHeader('X-Request-ID', this.requestId)
	}
}

export function clientSecretDiagnostics(request: object): ClientSecretDiagnostics {
	let diagnostics = requests.get(request)
	if (!diagnostics) {
		diagnostics = new ClientSecretDiagnostics()
		requests.set(request, diagnostics)
	}
	return diagnostics
}
