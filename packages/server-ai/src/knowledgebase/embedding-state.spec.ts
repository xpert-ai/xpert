import { BadRequestException } from '@nestjs/common'
import { ICopilotModel, KnowledgebaseStatusEnum } from '@xpert-ai/contracts'
import {
	createEmbeddingCollectionName,
	createEmbeddingFingerprint,
	resolveEmbeddingModelUpdateState
} from './embedding-state'

const activeModel = {
	id: 'active-model-id',
	model: 'embedding-a'
} satisfies Partial<ICopilotModel>

const pendingModel = {
	id: 'pending-model-id',
	model: 'embedding-b'
} satisfies Partial<ICopilotModel>

describe('embedding-state', () => {
	describe('createEmbeddingFingerprint', () => {
		it('creates a deterministic fingerprint from model, dimensions, options, and provider config', () => {
			const fingerprint = createEmbeddingFingerprint({
				provider: 'openai',
				model: 'text-embedding-3-large',
				dimensions: 3072,
				options: {
					encoding_format: 'float',
					projection: {
						name: 'default',
						enabled: true
					}
				},
				providerConfig: {
					baseUrl: 'https://api.openai.com/v1'
				}
			})
			const sameFingerprint = createEmbeddingFingerprint({
				provider: 'openai',
				model: 'text-embedding-3-large',
				dimensions: 3072,
				options: {
					projection: {
						enabled: true,
						name: 'default'
					},
					encoding_format: 'float'
				},
				providerConfig: {
					baseUrl: 'https://api.openai.com/v1'
				}
			})
			const differentDimensions = createEmbeddingFingerprint({
				provider: 'openai',
				model: 'text-embedding-3-large',
				dimensions: 1536,
				options: {
					encoding_format: 'float',
					projection: {
						name: 'default',
						enabled: true
					}
				},
				providerConfig: {
					baseUrl: 'https://api.openai.com/v1'
				}
			})

			expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
			expect(fingerprint).toBe(sameFingerprint)
			expect(fingerprint).not.toBe(differentDimensions)
		})
	})

	describe('createEmbeddingCollectionName', () => {
		it('uses a safe knowledgebase id and fingerprint hash instead of raw provider or model names', () => {
			const name = createEmbeddingCollectionName(
				'827bddba-23d6-4d3f-8243-9048567f3288',
				'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
			)

			expect(name).toBe('Kb_827bddba23d64d3f82439048567f3288_abcdef123456')
			expect(name).not.toContain('-')
			expect(name).not.toContain('text-embedding')
		})
	})

	describe('resolveEmbeddingModelUpdateState', () => {
		it('writes the target embedding model directly to active when no active collection exists', () => {
			const result = resolveEmbeddingModelUpdateState(
				{
					status: KnowledgebaseStatusEnum.READY,
					copilotModel: activeModel,
					copilotModelId: 'active-model-id',
					embeddingCollectionName: null,
					embeddingModelFingerprint: null,
					embeddingDimensions: null,
					embeddingRevision: null
				},
				{
					copilotModel: pendingModel,
					copilotModelId: 'pending-model-id',
					collectionName: 'Kb_827_pending',
					fingerprint: 'fingerprint-b',
					dimensions: 3072
				}
			)

			expect(result).toMatchObject({
				status: KnowledgebaseStatusEnum.READY,
				copilotModel: pendingModel,
				copilotModelId: 'pending-model-id',
				embeddingCollectionName: 'Kb_827_pending',
				embeddingModelFingerprint: 'fingerprint-b',
				embeddingDimensions: 3072,
				embeddingRevision: 1,
				pendingCopilotModel: null,
				pendingCopilotModelId: null,
				pendingEmbeddingCollectionName: null,
				pendingEmbeddingModelFingerprint: null,
				pendingEmbeddingDimensions: null,
				pendingEmbeddingRevision: null,
				embeddingRebuildError: null
			})
		})

		it('stages a pending embedding model when active collection already exists and fingerprint changes', () => {
			const result = resolveEmbeddingModelUpdateState(
				{
					status: KnowledgebaseStatusEnum.READY,
					copilotModel: activeModel,
					copilotModelId: 'active-model-id',
					embeddingCollectionName: 'Kb_827_active',
					embeddingModelFingerprint: 'fingerprint-a',
					embeddingDimensions: 1536,
					embeddingRevision: 3
				},
				{
					copilotModel: pendingModel,
					copilotModelId: 'pending-model-id',
					collectionName: 'Kb_827_pending',
					fingerprint: 'fingerprint-b',
					dimensions: 3072
				}
			)

			expect(result).toMatchObject({
				status: KnowledgebaseStatusEnum.REBUILD_REQUIRED,
				copilotModel: activeModel,
				copilotModelId: 'active-model-id',
				pendingCopilotModel: pendingModel,
				pendingCopilotModelId: 'pending-model-id',
				pendingEmbeddingCollectionName: 'Kb_827_pending',
				pendingEmbeddingModelFingerprint: 'fingerprint-b',
				pendingEmbeddingDimensions: 3072,
				pendingEmbeddingRevision: 4,
				embeddingRebuildError: null
			})
		})

		it('clears pending fields and restores ready when target fingerprint matches active', () => {
			const result = resolveEmbeddingModelUpdateState(
				{
					status: KnowledgebaseStatusEnum.REBUILD_REQUIRED,
					copilotModel: activeModel,
					copilotModelId: 'active-model-id',
					embeddingCollectionName: 'Kb_827_active',
					embeddingModelFingerprint: 'fingerprint-a',
					embeddingDimensions: 1536,
					embeddingRevision: 3,
					pendingCopilotModel: pendingModel,
					pendingCopilotModelId: 'pending-model-id',
					pendingEmbeddingCollectionName: 'Kb_827_pending',
					pendingEmbeddingModelFingerprint: 'fingerprint-b',
					pendingEmbeddingDimensions: 3072,
					pendingEmbeddingRevision: 4
				},
				{
					copilotModel: activeModel,
					copilotModelId: 'active-model-id',
					collectionName: 'Kb_827_active',
					fingerprint: 'fingerprint-a',
					dimensions: 1536
				}
			)

			expect(result).toMatchObject({
				status: KnowledgebaseStatusEnum.READY,
				pendingCopilotModel: null,
				pendingCopilotModelId: null,
				pendingEmbeddingCollectionName: null,
				pendingEmbeddingModelFingerprint: null,
				pendingEmbeddingDimensions: null,
				pendingEmbeddingRevision: null,
				embeddingRebuildError: null
			})
		})

		it('rejects embedding model changes while rebuild is running', () => {
			expect(() =>
				resolveEmbeddingModelUpdateState(
					{
						status: KnowledgebaseStatusEnum.REBUILDING,
						copilotModel: activeModel,
						copilotModelId: 'active-model-id',
						embeddingCollectionName: 'Kb_827_active',
						embeddingModelFingerprint: 'fingerprint-a',
						embeddingDimensions: 1536,
						embeddingRevision: 3
					},
					{
						copilotModel: pendingModel,
						copilotModelId: 'pending-model-id',
						collectionName: 'Kb_827_pending',
						fingerprint: 'fingerprint-b',
						dimensions: 3072
					}
				)
			).toThrow(BadRequestException)
		})
	})
})
