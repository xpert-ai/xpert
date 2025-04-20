import { IModelRole, ISemanticModel, IUser, MDX, RoleTypeEnum } from '@metad/contracts'
import { TenantOrganizationBaseEntity, User, UserPublicDTO } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsJSON, IsOptional, IsString, IsNumber } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, RelationId } from 'typeorm'
import { SemanticModel } from '../model.entity'

/**
 * Semantic Model Roles
 */
@Entity('model_role')
export class SemanticModelRole extends TenantOrganizationBaseEntity implements IModelRole {

	@IsString()
	@Column({ length: 10 })
    key: string

	@IsString()
	@Column({ length: 100 })
	name: string

	@IsString()
	@Column({ nullable: true })
	type: RoleTypeEnum

	@IsNumber()
	@Column({ nullable: true })
    index?: number

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => SemanticModel, (d) => d.cache, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	model?: ISemanticModel

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: SemanticModelRole) => it.model)
	@IsString()
	@IsOptional()
	@Column()
	readonly modelId: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options: MDX.Role

	// Model Role & Users
	@Transform(({ value }) => value?.map((user) => new UserPublicDTO(user)))
	@ManyToMany(() => User)
	@JoinTable({
		name: 'model_role_users'
	})
	users?: IUser[]
}
