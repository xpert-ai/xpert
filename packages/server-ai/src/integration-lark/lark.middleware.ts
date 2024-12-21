import { IntegrationEnum } from '@metad/contracts'
import { NextFunction, Request, Response } from 'express'
import { Injectable, NestMiddleware } from '@nestjs/common'


@Injectable()
export class LarkMiddleware implements NestMiddleware {
	private logging = true

	/**
	 *
	 * @param request
	 * @param _response
	 * @param next
	 */
	async use(request: Request, _response: Response, next: NextFunction) {
		console.log(
			`Matched URL: ${request.method} ${request.url} - ${new Date().toISOString()}`
		)

		try {
			const integrationId = request.params['integrationId']

			if (integrationId) {
				const queryParameters = request.query

				// const tenantId = queryParameters.tenantId?.toString() ?? request.header('Tenant-Id');
				// const organizationId = queryParameters.organizationId?.toString() ?? request.header('Organization-Id');

				console.log(
					`Matched URL: ${request.method} ${request.url} - ${new Date().toISOString()} : ${integrationId}`
				)
			}
		} catch (error) {
			console.log(
				`Error while getting integration (${IntegrationEnum.LARK}) tenant inside middleware: %s`,
				error?.message
			)
			console.log(request.path, request.url)
		}

		// Continue to the next middleware or route handler
		next()
	}
}
