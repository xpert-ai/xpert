import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Employee, RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Repository, TreeRepository } from 'typeorm'
import { Comment } from './comment.entity'

@Injectable()
export class CommentService extends TenantOrganizationAwareCrudService<Comment> {
	constructor(
		@InjectRepository(Comment)
		commentRepository: Repository<Comment>,
	) {
		super(commentRepository)
	}

	
}
