import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

@Injectable()
export class LarkAuthGuard extends PassportAuthGaurd(['lark-token']) {
	constructor(private readonly _reflector: Reflector) {
		super()
	}

	canActivate(context: ExecutionContext) {
		return super.canActivate(context)
	}
}
