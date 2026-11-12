import type { ProjectConfigurationValues } from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'
import { XpertProjectBaseEntity } from '../entities/project.base'

@Entity('xpert_project_configuration')
@Index('IDX_project_configuration_project', ['projectId'], { unique: true })
export class XpertProjectConfiguration extends XpertProjectBaseEntity {
    @Column({ type: 'jsonb', default: {} }) values: ProjectConfigurationValues
    @Column({ type: 'int', default: 0 }) revision: number
}
