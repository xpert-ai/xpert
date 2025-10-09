import { IDocumentChunk } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'
import { IsJSON, IsNotEmpty, IsString } from 'class-validator'

/**
 * Document chunk public dto
 */
@Exclude()
export class DocumentChunkDTO implements IDocumentChunk {

	@Expose()
	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	id: string

	@Expose()
	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	pageContent: string

	@Expose()
	@ApiProperty({ type: () => Object })
	@IsNotEmpty()
	@IsJSON()
	metadata: {
		knowledgeId?: string
		[key: string]: any | null
	}

	@Expose()
	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	collection_id: string

	constructor(partial: Partial<DocumentChunkDTO>) {
		Object.assign(this, partial)
		this.id = partial.id || partial.metadata.chunkId
	}
}
