import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport';

@Injectable()
export class XpertAuthGuard extends PassportAuthGaurd(['xpert-token']) {
	constructor(
		private readonly _reflector: Reflector
	) {
		super();
	}

	canActivate(context: ExecutionContext) {
		// Make sure to check the authorization, for now, just return false to have a difference between public routes.
		return super.canActivate(context);
	}
}