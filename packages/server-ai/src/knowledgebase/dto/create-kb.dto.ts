import {
	ICopilotModel,
	IKnowledgebase,
	KnowledgebaseParserConfig,
	KnowledgebasePermission,
	KnowledgebaseTypeEnum,
	TAvatar,
	TKBRecallParams
} from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsOptional, IsString, IsUUID } from 'class-validator'

@Expose()
export class CreateKnowledgebaseDTO implements Partial<IKnowledgebase> {
	@ApiProperty({ type: 'string', format: 'uuid', description: 'Integration ID of knowledge base system' })
	@IsUUID('4')
	@IsOptional()
	workspaceId?: string

	@ApiProperty({ example: 'Customer service knowledgebase', type: String })
	@IsString()
	@Expose()
	declare name: string

	@Expose()
	declare language?: 'Chinese' | 'English'

	@Expose()
	declare avatar?: TAvatar

	@ApiProperty({ type: String })
	@IsString()
	@IsOptional()
	@Expose()
	declare description?: string

	@ApiProperty({
		enum: KnowledgebasePermission,
		example: KnowledgebasePermission.Organization,
		description: 'Knowledgebase Permission',
		default: KnowledgebasePermission.Private
	})
	@Expose()
	declare permission?: KnowledgebasePermission

	@ApiProperty({
		enum: KnowledgebaseTypeEnum,
		example: KnowledgebaseTypeEnum.Standard,
		description: 'Knowledgebase Type',
		default: KnowledgebaseTypeEnum.Standard
	})
	type: KnowledgebaseTypeEnum

	@ApiProperty({
		type: () => Object,
		description: 'Recall Options',
		example: {
			topK: 10,
			score: 0.5
		}
	})
	recall?: TKBRecallParams

	@ApiProperty({
		type: () => Object,
		description: 'Parser Config',
		example: {
			chunkSize: 1000,
			chunkOverlap: 100,
			delimiter: '; , .'
		}
	})
	parserConfig?: KnowledgebaseParserConfig

	@ApiProperty({ type: 'string', format: 'uuid', description: 'Integration ID of knowledge base system' })
	@IsUUID('4')
	@IsOptional()
	integrationId?: string

	@ApiProperty({ type: String })
	@IsString()
	@IsOptional()
	extKnowledgebaseId?: string

	@ApiProperty({
		type: () => Object,
		description: 'Copilot embedding model',
		example: {
			copilotId: 'xxxx',
			modelType: 'text-embedding',
			model: 'text-embedding-v4',
		}
	})
	copilotModel?: ICopilotModel

	constructor(partial: IKnowledgebase) {
		Object.assign(this, partial)
	}
}
