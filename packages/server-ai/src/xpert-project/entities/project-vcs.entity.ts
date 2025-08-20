import { IIntegration, IXpertProjectVCS } from '@metad/contracts'
import { Integration } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_vcs')
export class XpertProjectVCS extends XpertProjectBaseEntity implements IXpertProjectVCS {
	@ApiProperty({ type: () => Integration, readOnly: true })
	@ManyToOne(() => Integration, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn()
	@IsOptional()
	integration?: IIntegration

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: XpertProjectVCS) => it.integration)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	integrationId?: string

	@Exclude()
	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	auth?: {
		token_type?: string
		access_token?: string
	}

	@Column({ nullable: true })
	installationId?: string

	@Column({ nullable: true })
	repository?: string // e.g., 'owner/repo' for GitHub, 'namespace/project' for GitLab
}
