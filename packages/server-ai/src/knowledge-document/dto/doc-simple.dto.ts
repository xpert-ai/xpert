import { IKnowledgeDocument, KBDocumentCategoryEnum, KBDocumentStatusEnum, KDocumentSourceType } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'

/**
 * Document simple dto
 */
@Exclude()
export class DocumentSimpleDTO implements Partial<IKnowledgeDocument> {
	@Expose()
	@ApiProperty({ type: () => String })
	id: string

	@Expose()
	@ApiProperty({ type: () => String })
	name: string

	@Expose()
	@ApiProperty({ type: () => String, enum: KDocumentSourceType })
	sourceType: KDocumentSourceType

	@Expose()
	@ApiProperty({ type: () => String, enum: KBDocumentCategoryEnum })
	category: KBDocumentCategoryEnum

	@Expose()
	@ApiProperty({ type: () => String, enum: KBDocumentStatusEnum })
	status: KBDocumentStatusEnum

	@Expose()
	@ApiProperty({ type: () => String, format: 'date-time' })
	createdAt: Date

	@Expose()
	@ApiProperty({ type: () => String, format: 'date-time' })
	updatedAt: Date

	@Expose()
	@ApiProperty({ type: () => String, description: 'The ID of the task that created this document' })
	taskId?: string

	@Expose()
	@ApiProperty({ type: () => String, description: 'The ID of the knowledgebase this document belongs to' })
	knowledgebaseId: string

	@Expose()
	@ApiProperty({ type: () => String })
	folder?: string

	constructor(partial: Partial<DocumentSimpleDTO>) {
		Object.assign(this, partial)
	}
}
