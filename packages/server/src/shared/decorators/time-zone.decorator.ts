import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const TimeZone = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest()
	const headers = request.headers
	return headers['time-zone']
})
