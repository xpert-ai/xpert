import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

@Injectable()
export class LarkAuthGuard extends PassportAuthGaurd(['lark-token']) {
	constructor(private readonly _reflector: Reflector) {
		super()
	}

	override canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const data = request.body

		// Allow url_verification requests to pass through without authentication
		// This is required for Lark webhook URL verification (challenge)
		if (data?.type === 'url_verification') {
			return true
		}

		return super.canActivate(context)
	}
}
