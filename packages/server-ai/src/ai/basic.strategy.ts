// import { Injectable, UnauthorizedException } from '@nestjs/common'
// import { PassportStrategy } from '@nestjs/passport'
// import { IncomingMessage } from 'http'
// import { Strategy } from 'passport'

// @Injectable()
// export class XpertTokenStrategy extends PassportStrategy(Strategy, 'xpert-token') {
// 	constructor() {
// 		super()
// 	}

// 	authenticate(req: IncomingMessage, options: { session: boolean }) {
// 		const authHeader = req.headers['authorization']
// 		if (!authHeader || !authHeader.startsWith('Bearer ')) {
// 			return this.fail(new UnauthorizedException('Authorization header not provided or invalid'))
// 		}

// 		const token = authHeader.split(' ')[1]
// 		this.validateToken(token)
// 			.then((user) => {
// 				if (!user) {
// 					return this.fail(new UnauthorizedException('Invalid token'))
// 				}
// 				this.success(user)
// 			})
// 			.catch((err) => {
// 				console.error(err)
// 				return this.error(new UnauthorizedException('Unauthorized', err.message))
// 			})
// 	}

// 	async validateToken(token: string) {
// 		console.log(token)
// 		return true
// 	}
// }
