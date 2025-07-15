import { IPagination } from '@metad/contracts'
import { CrudController, ParseJsonPipe, UUIDValidationPipe } from '@metad/server-core'
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { FindManyOptions } from 'typeorm'
import { SemanticModelMember } from './member.entity'
import { SemanticModelMemberService } from './member.service'

@ApiTags('SemanticModelMember')
@ApiBearerAuth()
@Controller()
export class ModelMemberController extends CrudController<SemanticModelMember> {
	constructor(
		private readonly memberService: SemanticModelMemberService,
		private readonly commandBus: CommandBus
	) {
		super(memberService)
	}

	@Post('retrieve')
	async retrieveMembers(
		@Body()
		body: {
			modelId: string
			cube: string
			dimension?: string
			hierarchy?: string
			level?: string
			query: string
			k: number
		}
	) {
		const { modelId, cube, dimension, hierarchy, level, query, k } = body
		return await this.memberService.retrieveMembersWithScore(
			null,
			null,
			{
				modelId,
				cube,
				dimension,
				hierarchy,
				level
			},
			query,
			k
		)
	}

	@Get(':id')
	async findAllMembers(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) query: FindManyOptions
	): Promise<IPagination<SemanticModelMember>> {
		const { relations, where } = query
		return await this.memberService.findAll({
			where,
			relations
		})
	}
}
