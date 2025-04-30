import { IXpertProjectFile } from '@metad/contracts'
import { Column, Entity } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_file')
export class XpertProjectFile extends XpertProjectBaseEntity implements IXpertProjectFile {
	@Column({ nullable: true })
	filePath: string

	@Column({ nullable: true })
	fileType: string

	@Column({ nullable: true })
	fileUrl: string

	@Column({ nullable: true })
	fileContents: string

	storageFileId?: string
}
