import { IXpertProjectFile } from '@metad/contracts'
import { Column, Entity } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'

/**
 * @deprecated Use `attachments`
 */
@Entity('xpert_project_file')
export class XpertProjectFile extends XpertProjectBaseEntity implements IXpertProjectFile {
	@Column({ nullable: true })
	filePath: string

	@Column({ nullable: true })
	fileType: string

	@Column({ nullable: true })
	url: string

	@Column({ nullable: true })
	contents: string

	@Column({ nullable: true })
	description: string

	storageFileId?: string
}
