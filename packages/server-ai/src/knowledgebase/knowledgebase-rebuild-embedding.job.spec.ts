import { ForbiddenException } from '@nestjs/common'
import { UserService } from '@xpert-ai/server-core'
import { Job } from 'bull'
import { KnowledgebaseRebuildEmbeddingConsumer } from './knowledgebase-rebuild-embedding.job'
import { KnowledgebaseService } from './knowledgebase.service'
import { TKnowledgebaseRebuildEmbeddingJob } from './types'

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

jest.mock('./knowledgebase.service', () => ({
	KnowledgebaseService: class KnowledgebaseService {}
}))

describe('KnowledgebaseRebuildEmbeddingConsumer', () => {
	it('loads and rebuilds the knowledgebase inside the rebuild request context', async () => {
		const knowledgebaseService = {
			findOne: jest.fn(async () => {
				if (!mockContextActive) {
					throw new ForbiddenException('Tenant context is required.')
				}
				return {
					id: 'knowledgebase-id',
					organizationId: 'organization-id'
				}
			}),
			processEmbeddingRebuildJob: jest.fn(async () => ({
				id: 'knowledgebase-id'
			})),
			markEmbeddingRebuildFailed: jest.fn()
		}
		const userService = {
			findOne: jest.fn(async () => ({
				id: 'user-id',
				tenantId: 'tenant-id',
				preferredLanguage: 'zh-Hans'
			}))
		}
		const consumer = new KnowledgebaseRebuildEmbeddingConsumer(
			knowledgebaseService as unknown as KnowledgebaseService,
			userService as unknown as UserService
		)
		const job = {
			data: {
				userId: 'user-id',
				tenantId: 'tenant-id',
				organizationId: 'organization-id',
				knowledgebaseId: 'knowledgebase-id',
				rebuildTaskId: 'rebuild-task-id',
				pendingEmbeddingRevision: 2
			}
		} as Job<TKnowledgebaseRebuildEmbeddingJob>

		await expect(consumer.process(job)).resolves.toEqual({ id: 'knowledgebase-id' })

		expect(knowledgebaseService.findOne).toHaveBeenCalled()
		expect(knowledgebaseService.processEmbeddingRebuildJob).toHaveBeenCalledWith(job.data)
		expect(knowledgebaseService.markEmbeddingRebuildFailed).not.toHaveBeenCalled()
	})

	it('marks rebuild failed when job execution fails after entering request context', async () => {
		const error = new Error('chunk missing pageContent')
		const knowledgebaseService = {
			findOne: jest.fn(async () => ({ id: 'knowledgebase-id' })),
			processEmbeddingRebuildJob: jest.fn(async () => {
				throw error
			}),
			markEmbeddingRebuildFailed: jest.fn(async () => undefined)
		}
		const userService = {
			findOne: jest.fn(async () => ({
				id: 'user-id',
				tenantId: 'tenant-id',
				preferredLanguage: 'zh-Hans'
			}))
		}
		const consumer = new KnowledgebaseRebuildEmbeddingConsumer(
			knowledgebaseService as unknown as KnowledgebaseService,
			userService as unknown as UserService
		)
		const job = {
			data: {
				userId: 'user-id',
				tenantId: 'tenant-id',
				organizationId: 'organization-id',
				knowledgebaseId: 'knowledgebase-id',
				rebuildTaskId: 'rebuild-task-id',
				pendingEmbeddingRevision: 2
			}
		} as Job<TKnowledgebaseRebuildEmbeddingJob>

		await expect(consumer.process(job)).rejects.toThrow(error)

		expect(knowledgebaseService.markEmbeddingRebuildFailed).toHaveBeenCalledWith(job.data, 'chunk missing pageContent')
	})
})
