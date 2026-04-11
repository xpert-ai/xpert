import { IDocChunkMetadata } from '@xpert-ai/contracts'
import { DeepPartial } from '@xpert-ai/server-common'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'
import { IsJSON, IsNotEmpty, IsString } from 'class-validator'
import { DocumentSimpleDTO } from './doc-simple.dto'

/**
 * Document chunk public dto
 */
@Exclude()
export class DocumentChunkDTO {
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

	@Expose()
	document?: DocumentSimpleDTO

	constructor(partial: DeepPartial<DocumentChunkDTO>) {
		Object.assign(this, partial)
		this.id = partial.id || partial.metadata.chunkId
		if (partial.document) {
			this.document = new DocumentSimpleDTO(partial.document)
		}
	}
}
