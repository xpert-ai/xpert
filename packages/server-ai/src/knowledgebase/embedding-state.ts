import { BadRequestException } from '@nestjs/common'
import { KnowledgebaseStatusEnum, TCopilotModel } from '@xpert-ai/contracts'
import { createHash } from 'crypto'

export type TEmbeddingFingerprintInput = {
	provider?: string | null
	model?: string | null
	dimensions?: number | null
	options?: unknown
	providerConfig?: unknown
}

export type TEmbeddingModelState = {
	status?: KnowledgebaseStatusEnum | string | null
	copilotModel?: Partial<TCopilotModel> | null
	copilotModelId?: string | null
	embeddingCollectionName?: string | null
	embeddingModelFingerprint?: string | null
	embeddingDimensions?: number | null
	embeddingRevision?: number | null
	pendingCopilotModel?: Partial<TCopilotModel> | null
	pendingCopilotModelId?: string | null
	pendingEmbeddingCollectionName?: string | null
	pendingEmbeddingModelFingerprint?: string | null
	pendingEmbeddingDimensions?: number | null
	pendingEmbeddingRevision?: number | null
}

export type TResolvedEmbeddingModelTarget = {
	copilotModel: Partial<TCopilotModel> | null
	copilotModelId?: string | null
	collectionName: string
	fingerprint: string
	dimensions: number
}

export type TEmbeddingModelUpdatePatch = {
	status: KnowledgebaseStatusEnum
	copilotModel?: Partial<TCopilotModel> | null
	copilotModelId?: string | null
	embeddingCollectionName?: string | null
	embeddingModelFingerprint?: string | null
	embeddingDimensions?: number | null
	embeddingRevision?: number | null
	pendingCopilotModel: Partial<TCopilotModel> | null
	pendingCopilotModelId: string | null
	pendingEmbeddingCollectionName: string | null
	pendingEmbeddingModelFingerprint: string | null
	pendingEmbeddingDimensions: number | null
	pendingEmbeddingRevision: number | null
	rebuildTaskId: string | null
	embeddingRebuildError: string | null
}

function normalizeForFingerprint(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => normalizeForFingerprint(item))
	}

	if (value && typeof value === 'object') {
		const entries = Object.entries(value)
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))

		return Object.fromEntries(entries.map(([key, entryValue]) => [key, normalizeForFingerprint(entryValue)]))
	}

	return value
}

export function createEmbeddingFingerprint(input: TEmbeddingFingerprintInput) {
	const payload = normalizeForFingerprint({
		provider: input.provider ?? null,
		model: input.model ?? null,
		dimensions: input.dimensions ?? null,
		options: input.options ?? null,
		providerConfig: input.providerConfig ?? null
	})

	return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function createEmbeddingCollectionName(knowledgebaseId: string, fingerprint: string) {
	const safeKnowledgebaseId = knowledgebaseId.replace(/[^a-zA-Z0-9]/g, '') || 'unknown'
	return `Kb_${safeKnowledgebaseId}_${fingerprint.slice(0, 12)}`
}

function clearedPendingFields() {
	return {
		pendingCopilotModel: null,
		pendingCopilotModelId: null,
		pendingEmbeddingCollectionName: null,
		pendingEmbeddingModelFingerprint: null,
		pendingEmbeddingDimensions: null,
		pendingEmbeddingRevision: null,
		rebuildTaskId: null,
		embeddingRebuildError: null
	}
}

export function resolveEmbeddingModelUpdateState(
	current: TEmbeddingModelState,
	target: TResolvedEmbeddingModelTarget
): TEmbeddingModelUpdatePatch {
	if (current.status === KnowledgebaseStatusEnum.REBUILDING) {
		throw new BadRequestException('Embedding rebuild is running')
	}

	if (current.embeddingCollectionName && current.embeddingModelFingerprint === target.fingerprint) {
		return {
			status: KnowledgebaseStatusEnum.READY,
			copilotModel: current.copilotModel,
			copilotModelId: current.copilotModelId ?? null,
			embeddingCollectionName: current.embeddingCollectionName,
			embeddingModelFingerprint: current.embeddingModelFingerprint,
			embeddingDimensions: current.embeddingDimensions ?? target.dimensions,
			embeddingRevision: current.embeddingRevision ?? 1,
			...clearedPendingFields()
		}
	}

	const nextRevision = (current.embeddingRevision ?? 0) + 1

	if (!current.embeddingCollectionName) {
		return {
			status: KnowledgebaseStatusEnum.READY,
			copilotModel: target.copilotModel,
			copilotModelId: target.copilotModelId ?? null,
			embeddingCollectionName: target.collectionName,
			embeddingModelFingerprint: target.fingerprint,
			embeddingDimensions: target.dimensions,
			embeddingRevision: nextRevision,
			...clearedPendingFields()
		}
	}

	return {
		status: KnowledgebaseStatusEnum.REBUILD_REQUIRED,
		copilotModel: current.copilotModel,
		copilotModelId: current.copilotModelId ?? null,
		embeddingCollectionName: current.embeddingCollectionName,
		embeddingModelFingerprint: current.embeddingModelFingerprint ?? null,
		embeddingDimensions: current.embeddingDimensions ?? null,
		embeddingRevision: current.embeddingRevision ?? null,
		pendingCopilotModel: target.copilotModel,
		pendingCopilotModelId: target.copilotModelId ?? null,
		pendingEmbeddingCollectionName: target.collectionName,
		pendingEmbeddingModelFingerprint: target.fingerprint,
		pendingEmbeddingDimensions: target.dimensions,
		pendingEmbeddingRevision: nextRevision,
		rebuildTaskId: null,
		embeddingRebuildError: null
	}
}
