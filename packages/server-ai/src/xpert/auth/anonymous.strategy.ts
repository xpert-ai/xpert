import { Inject, Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { Strategy } from 'passport-strategy'
import { v4 as uuidv4 } from 'uuid'
import { XpertService } from '../xpert.service'

@Injectable()
export class AnonymousStrategy extends PassportStrategy(Strategy, 'xpert') {
	@Inject(XpertService)
	readonly xpertService: XpertService

	authenticate(req: Request) {
		this.xpertService
			.findBySlug(req.params.name)
			.then((xpert) => {
				if (xpert.app?.enabled) {
					req.headers['organization-id'] = xpert.organizationId
					const user = xpert.user || xpert.createdBy
					// Check if an anonymous user ID exists
					const anonymousId = req.cookies['anonymous.id']
					if (!anonymousId) {
						// Generate a new anonymous user ID
						const newId = uuidv4()
						req.res.cookie('anonymous.id', newId, { httpOnly: true, maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax', secure: true }) // 1 年
						this.success({ ...user, thirdPartyId: newId })
					} else {
						this.success({ ...user, thirdPartyId: anonymousId })
					}
				} else {
					this.fail('x', 404)
				}
			})
			.catch((err) => this.fail('x', 404))
	}
}
