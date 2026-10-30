import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ModelGatewayIdentity, ModelGatewayService } from './model-gateway.service'

// Request-local reuse avoids authenticating the same key in both the guard and protocol handler.
const identities = new WeakMap<object, Promise<ModelGatewayIdentity>>()
export function authenticateGatewayRequest(
    request: Request,
    service: ModelGatewayService
): Promise<ModelGatewayIdentity> {
    let identity = identities.get(request)
    if (!identity) {
        identity = service.authenticate(request.headers.authorization)
        identities.set(request, identity)
    }
    return identity
}

/** Public bypasses the default JWT guard; this guard authenticates the dedicated gateway key before permissions. */
@Injectable()
export class ModelGatewayAuthGuard implements CanActivate {
    constructor(private readonly service: ModelGatewayService) {}
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()
        try {
            const identity = await authenticateGatewayRequest(request, this.service)
            request.user = identity.user
            // Gateway scope comes exclusively from the authenticated key, never client-supplied scope headers.
            request.headers['tenant-id'] = identity.apiKey.tenantId
            request.headers['x-scope-level'] = identity.apiKey.organizationId ? 'organization' : 'tenant'
            if (identity.apiKey.organizationId) request.headers['organization-id'] = identity.apiKey.organizationId
            else delete request.headers['organization-id']
            return true
        } catch (error) {
            const status = error instanceof HttpException ? error.getStatus() : 500
            throw new HttpException(
                {
                    error: {
                        message: getErrorMessage(error),
                        type:
                            status === 401
                                ? 'authentication_error'
                                : status === 403
                                  ? 'permission_error'
                                  : 'upstream_error',
                        param: null,
                        code: null
                    }
                },
                status
            )
        }
    }
}
