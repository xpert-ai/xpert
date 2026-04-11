import { ISemanticModel, IUser, MDX, RoleTypeEnum } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsArray, IsOptional, IsString } from 'class-validator'
import { SemanticModel } from '../../model.entity'

export class SemanticModelRoleDTO {
	@IsString()
	id: string

	@IsString()
	key: string

	@IsString()
	name: string

	@IsString()
	type: RoleTypeEnum | string

	@IsNumber()
	index?: number

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	model?: ISemanticModel

	@ApiProperty({ type: () => String, readOnly: true })
	@IsString()
	@IsOptional()
	readonly modelId: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	options: MDX.Role

	// Model Role & Users
	@IsArray()
    @IsOptional()
	users?: IUser[]

    constructor(partial: Partial<SemanticModelRoleDTO>) {
        Object.assign(this, partial);

        this.users = partial.users?.map((user) => new UserPublicDTO(user))
    }
}
