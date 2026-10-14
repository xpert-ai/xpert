import { Injectable } from '@nestjs/common'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

@Injectable()
export class CoreAuthGuard extends PassportAuthGaurd(['api-key', 'jwt', 'basic']) {
	override getAuthenticateOptions() {
		// Management APIs accept personal credentials, never resource-bound application keys.
		return { personalOnly: true }
	}
}
