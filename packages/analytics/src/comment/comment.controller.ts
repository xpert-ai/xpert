import { CrudController } from '@xpert-ai/server-core'
import { Controller } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Comment } from './comment.entity'
import { CommentService } from './comment.service'

@ApiTags('Comment')
@ApiBearerAuth()
@Controller()
export class CommentController extends CrudController<Comment> {
	constructor(private readonly commentService: CommentService, private readonly commandBus: CommandBus) {
		super(commentService)
	}
}
