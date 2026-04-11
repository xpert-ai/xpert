import { IUser } from '@xpert-ai/contracts'
import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { RequestContext } from '../../core/context'

export const CurrentUser = createParamDecorator((): IUser => {
	return RequestContext.currentUser()
})

export const EmployeeId = createParamDecorator((): string => {
	return RequestContext.currentUser()?.employeeId
})

export const WsUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
	const request = ctx.switchToWs().getClient().handshake
	return request.user
})
