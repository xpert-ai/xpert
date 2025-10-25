import { IDocChunkMetadata, IKnowledgeDocumentChunk } from '@metad/contracts'
import { DeepPartial } from '@metad/server-common'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'
import { IsJSON, IsNotEmpty, IsString } from 'class-validator'

/**
 * Document chunk public dto
 */
@Exclude()
export class DocumentChunkDTO implements IKnowledgeDocumentChunk {

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
	metadata: IDocChunkMetadata

	@Expose()
	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	collection_id: string

	constructor(partial: DeepPartial<DocumentChunkDTO>) {
		Object.assign(this, partial)
		this.id = partial.id || partial.metadata.chunkId
	}
}
