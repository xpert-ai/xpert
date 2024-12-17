import { CrudController, TransformInterceptor } from '@metad/server-core'
import {
	CallHandler,
	CanActivate,
	Controller,
	ExecutionContext,
	Injectable,
	NestInterceptor,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { ChatMessageFeedback } from './feedback.entity'
import { ChatMessageFeedbackService } from './feedback.service'

@Injectable()
class CleanJobGuard implements CanActivate {
	constructor(
		private reflector: Reflector,
		private readonly feedbackService: ChatMessageFeedbackService
	) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const method = request.method
		let id: string | undefined

		if (['DELETE'].includes(method)) {
			id = request.params.id || request.body.id
			if (id) {
				try {
					await this.feedbackService.deleteSummary(id)
				} catch (err) {
					console.error(err)
					return false
				}
			}
		}
		return true
	}
}

@Injectable()
class ResponseInterceptor implements NestInterceptor {
	constructor(private readonly feedbackService: ChatMessageFeedbackService) {}
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		return next.handle().pipe(
			tap((data) => {
				const request = context.switchToHttp().getRequest()
				const method = request.method
				let id: string | undefined
				if (['POST'].includes(method)) {
					id = data.id
				} else if (method === 'PUT') {
					id = request.params.id
				}
				if (id) {
					this.feedbackService.triggerSummary(id).catch((err) => {
						console.error(err)
					})
				}
			})
		)
	}
}

@ApiTags('ChatMessageFeedback')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor, ResponseInterceptor)
@UseGuards(CleanJobGuard)
@Controller()
export class ChatMessageFeedbackController extends CrudController<ChatMessageFeedback> {
	constructor(
		private readonly service: ChatMessageFeedbackService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}
}
