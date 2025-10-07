import { IKnowledgeDocument, KBDocumentCategoryEnum, KBDocumentStatusEnum, KDocumentSourceType } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'

/**
 * Document variable dto
 */
@Exclude()
export class DocumentVariableDTO implements Partial<IKnowledgeDocument> {
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
	@ApiProperty({ type: () => String })
	fileUrl: string

	@Expose()
	@ApiProperty({ type: () => String })
	filePath: string

	@Expose()
	@ApiProperty({ type: () => String })
	mineType: string

	@Expose()
	@ApiProperty({ type: () => String })
	extension: string

	@Expose()
	@ApiProperty({ type: () => String })
	size: string

	@Expose()
	@ApiProperty({ type: () => String, enum: KBDocumentStatusEnum })
	status: KBDocumentStatusEnum

	constructor(partial: Partial<DocumentVariableDTO>) {
		Object.assign(this, partial)
		this.extension = partial?.name?.split('.').pop().toLowerCase()
	}
}
