jest.mock('@xpert-ai/server-core', () => ({
	StorageFile: class StorageFile {},
	TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {}
}))

jest.mock('../core/entities/internal', () => ({
	ChatMessage: class ChatMessage {},
	ProjectCore: class ProjectCore {},
	Xpert: class Xpert {},
	XpertTask: class XpertTask {}
}))

import 'reflect-metadata'
import { getMetadataArgsStorage } from 'typeorm'
import { ChatConversation } from './conversation.entity'
import { ProjectCore } from '../core/entities/internal'

describe('ChatConversation entity', () => {
	it('soft-binds project scope to project_core metadata', () => {
		const relation = getMetadataArgsStorage().relations.find(
			(metadata) => metadata.target === ChatConversation && metadata.propertyName === 'project'
		)
		const column = getMetadataArgsStorage().columns.find(
			(metadata) => metadata.target === ChatConversation && metadata.propertyName === 'projectId'
		)

		expect(relation).toBeDefined()
		expect(relation?.type()).toBe(ProjectCore)
		expect(relation?.options.createForeignKeyConstraints).toBe(false)
		expect(column?.options.type).toBe('uuid')
	})
})
