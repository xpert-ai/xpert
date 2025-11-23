import { ApiPropertyOptional } from '@nestjs/swagger'
import { CreateSemanticModelDTO } from './create-model.dto'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

/**
 * Model Update DTO
 *
 */
export class UpdateSemanticModelDTO extends CreateSemanticModelDTO {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	key: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	name: string
}
