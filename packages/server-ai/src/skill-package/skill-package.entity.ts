import { ISkillPackage, SkillMetadata, TSkillPackage } from '@metad/contracts'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'
import { SkillRepositoryIndex } from '../core/entities/internal'

@Entity('skill_package')
export class SkillPackage extends WorkspaceBaseEntity implements ISkillPackage {
	@Column({ nullable: true })
	@RelationId((it: SkillPackage) => it.skillIndex)
	skillIndexId?: string // unique per skill name

	@ManyToOne(() => SkillRepositoryIndex, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn()
	skillIndex?: SkillRepositoryIndex

	@Column({ type: 'json', nullable: true })
	name?: any

	@Column({ default: 'private' })
	visibility: 'private' | 'team' | 'tenant'

	@Column({ nullable: true })
	packagePath?: string

	@Column({ type: 'json', nullable: true })
	metadata: SkillMetadata

	@Column({ type: 'json', nullable: true })
	instructions: TSkillPackage['instructions']
}
