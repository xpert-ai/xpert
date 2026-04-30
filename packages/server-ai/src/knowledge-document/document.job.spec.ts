import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { IKnowledgeDocument, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { UserService } from '@xpert-ai/server-core'
import { Job } from 'bull'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeDocumentService } from './document.service'

let mockContextActive = false

jest.mock('@xpert-ai/server-core', () => {
	const actual = jest.requireActual('@xpert-ai/server-core')
	return {
		...actual,
		runWithRequestContext: (_req: unknown, next: () => unknown) => {
			mockContextActive = true
			try {
				return next()
			} finally {
				mockContextActive = false
			}
		}
	}
})

jest.mock('../knowledgebase', () => ({
	KnowledgebaseService: class KnowledgebaseService {},
	KnowledgeDocumentStore: class KnowledgeDocumentStore {}
}))

jest.mock('./document.service', () => ({
	KnowledgeDocumentService: class KnowledgeDocumentService {}
}))

describe('KnowledgeDocumentConsumer', () => {
	it('loads the knowledgebase inside the queued document request context', async () => {
		const doc = {
			id: 'doc-id',
			tenantId: 'tenant-id',
			organizationId: 'organization-id',
			knowledgebaseId: 'knowledgebase-id',
			status: KBDocumentStatusEnum.RUNNING
		} satisfies Partial<IKnowledgeDocument>

		const knowledgebaseService = {
			findOne: jest.fn(async () => {
				if (!mockContextActive) {
					throw new ForbiddenException('Tenant context is required.')
				}
				return {
					id: 'knowledgebase-id',
					organizationId: 'organization-id'
				}
			})
		}
		const documentService = {
			update: jest.fn()
		}
		const userService = {
			findOne: jest.fn(async () => ({
				id: 'user-id',
				tenantId: 'tenant-id',
				preferredLanguage: 'zh-Hans'
			}))
		}
		const commandBus = {}
		const consumer = new KnowledgeDocumentConsumer(
			null,
			knowledgebaseService as unknown as KnowledgebaseService,
			documentService as unknown as KnowledgeDocumentService,
			userService as unknown as UserService,
			commandBus as unknown as CommandBus
		)
		const processJob = jest.spyOn(consumer, '_processJob').mockResolvedValue({})
		const job = {
			data: {
				userId: 'user-id',
				docs: [doc]
			}
		} as Job<{ userId: string; docs: IKnowledgeDocument[] }>

		await expect(consumer.process(job)).resolves.toEqual({})

		expect(knowledgebaseService.findOne).toHaveBeenCalled()
		expect(processJob).toHaveBeenCalled()
		expect(documentService.update).not.toHaveBeenCalled()
	})
})
