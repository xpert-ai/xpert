import { createHash, randomUUID } from 'node:crypto'
import {
	DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION,
	DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA,
	type IDataXLiveArtifactManifest,
	type IDataXLiveArtifactVersionMetadata,
	type IDataXLiveArtifactVisualizationPayload
} from '@xpert-ai/contracts'
import {
	ArtifactsRuntimeCapability,
	type ArtifactRecord,
	type ArtifactVersionRecord,
	type IAgentMiddlewareContext,
	WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import {
	DATA_X_LIVE_ARTIFACT_DEFAULT_CACHE_TTL_SECONDS,
	DATA_X_LIVE_ARTIFACT_PLUGIN_NAME,
	DATA_X_LIVE_ARTIFACT_RESOURCE_TYPE,
	DATA_X_LIVE_ARTIFACT_VISUALIZATION_META_KEY
} from './constants'
import { DataXLiveArtifactManifestSchema } from './schemas'
import { validateAndPrepareLiveArtifactHtml } from './html'
import type {
	CreateLiveArtifactInput,
	OpenLiveArtifactInput,
	UpdateLiveArtifactInput,
	ValidateLiveArtifactInput
} from './schemas'

type DraftInput = {
	title: string
	description?: string
	htmlPath: string
	manifest: IDataXLiveArtifactManifest
	changeSummary?: string
	draftId: string
}

export class DataXLiveArtifactSession {
	constructor(private readonly context: IAgentMiddlewareContext) {}

	async validate(input: ValidateLiveArtifactInput) {
		const draft = normalizeDraftInput(input)
		const prepared = await this.prepare(draft)
		return JSON.stringify({
			ok: prepared.validation.ok,
			issues: prepared.validation.issues,
			warnings: prepared.validation.warnings,
			bytes: prepared.sourceBytes,
			bindingIds: draft.manifest.bindings.map((binding) => binding.id)
		})
	}

	async create(input: CreateLiveArtifactInput) {
		const draftId = input.draftId ?? randomUUID()
		const draft = normalizeDraftInput(input)
		return this.persist({
			...draft,
			draftId
		})
	}

	async update(input: UpdateLiveArtifactInput) {
		const draftId = requiredString(input.draftId, 'draftId')
		const baseVersionId = requiredString(input.baseVersionId, 'baseVersionId')
		const draft = normalizeDraftInput(input)
		const artifacts = this.requireArtifacts()
		const artifact = await artifacts.findArtifactBySource({
			pluginName: DATA_X_LIVE_ARTIFACT_PLUGIN_NAME,
			resourceType: DATA_X_LIVE_ARTIFACT_RESOURCE_TYPE,
			resourceId: draftId
		})
		if (!artifact) throw new Error(`Live Artifact draft '${draftId}' was not found`)
		if (artifact.currentVersionId !== baseVersionId) {
			throw new Error(
				`Live Artifact update conflict: current version is '${artifact.currentVersionId ?? 'none'}', not '${baseVersionId}'`
			)
		}
		return this.persist(
			{
				...draft,
				draftId
			},
			artifact
		)
	}

	async open(input: OpenLiveArtifactInput) {
		const artifacts = this.requireArtifacts()
		const artifactId = requiredString(input.artifactId, 'artifactId')
		const artifact = await artifacts.getArtifact(artifactId)
		this.assertLiveArtifact(artifact)
		const version = input.artifactVersionId
			? (await artifacts.listArtifactVersions({ artifactId: artifact.id })).find(
					(item) => item.id === input.artifactVersionId
				)
			: artifact.currentVersion
		if (!version) throw new Error('Live Artifact version was not found')
		return this.toToolResult(artifact, version, this.readVersionMetadata(version))
	}

	private async persist(input: DraftInput, existing?: ArtifactRecord) {
		const prepared = await this.prepare(input)
		if (!prepared.validation.ok || !prepared.validation.html) {
			throw new Error(`Live Artifact validation failed: ${prepared.validation.issues.join('; ')}`)
		}

		const artifacts = this.requireArtifacts()
		const workspaceFiles = this.requireWorkspaceFiles()
		const htmlBuffer = Buffer.from(prepared.validation.html, 'utf8')
		const htmlSha256 = digest(htmlBuffer)
		const manifest = input.manifest
		const contentIdentity = digest(Buffer.from(`${htmlSha256}\n${stableJson(manifest)}`, 'utf8'))
		const file = await workspaceFiles.writeRuntimeBuffer({
			buffer: htmlBuffer,
			originalName: `${input.draftId}.html`,
			fileName: `${input.draftId}-${htmlSha256.slice(0, 12)}.html`,
			folder: 'live-artifacts',
			mimeType: 'text/html',
			metadata: {
				schema: DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA,
				draftId: input.draftId
			}
		})
		const artifact =
			existing ??
			(await artifacts.createArtifact({
				source: {
					pluginName: DATA_X_LIVE_ARTIFACT_PLUGIN_NAME,
					resourceType: DATA_X_LIVE_ARTIFACT_RESOURCE_TYPE,
					resourceId: input.draftId
				},
				kind: 'html',
				title: input.title,
				description: input.description,
				metadata: {
					schema: DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA,
					protocolVersion: DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION
				}
			}))
		const metadata = {
			schema: DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA,
			protocolVersion: DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION,
			draftId: input.draftId,
			...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
			manifest
		} satisfies IDataXLiveArtifactVersionMetadata
		const ensured = await artifacts.ensureArtifactVersion({
			artifactId: artifact.id,
			idempotencyKey: contentIdentity,
			workspaceFileRef: file.reference,
			mimeType: 'text/html',
			fileName: `${input.draftId}.html`,
			title: input.title,
			description: input.description,
			size: htmlBuffer.byteLength,
			sha256: htmlSha256,
			checksum: contentIdentity,
			setCurrent: true,
			metadata
		})
		return this.toToolResult(artifact, ensured.version, metadata, {
			outcome: ensured.outcome,
			warnings: prepared.validation.warnings
		})
	}

	private async prepare(input: Pick<DraftInput, 'htmlPath' | 'manifest'>) {
		const file = await this.requireWorkspaceFiles().readRuntimeBuffer(input.htmlPath)
		return {
			validation: validateAndPrepareLiveArtifactHtml(file.buffer, {
				bindingIds: input.manifest.bindings.map((binding) => binding.id)
			}),
			sourceBytes: file.buffer.byteLength
		}
	}

	private toToolResult(
		artifact: ArtifactRecord,
		version: ArtifactVersionRecord,
		metadata: IDataXLiveArtifactVersionMetadata,
		extra?: { outcome: 'created' | 'reused'; warnings: string[] }
	) {
		if (!version.sha256) throw new Error('Live Artifact version is missing sha256')
		const payload: IDataXLiveArtifactVisualizationPayload = {
			version: DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION,
			draftId: metadata.draftId,
			title: version.title ?? artifact.title ?? 'Live Analytics Artifact',
			...(version.description ? { description: version.description } : {}),
			contentRef: {
				provider: 'xpert-artifact',
				artifactId: artifact.id,
				artifactVersionId: version.id,
				versionNumber: version.versionNumber,
				mimeType: 'text/html',
				sha256: version.sha256
			},
			bindingIds: metadata.manifest.bindings.map((binding) => binding.id),
			cacheTtlSeconds: metadata.manifest.cacheTtlSeconds ?? DATA_X_LIVE_ARTIFACT_DEFAULT_CACHE_TTL_SECONDS
		}
		const visualization = {
			type: 'datax.live_artifact',
			title: payload.title,
			status: 'success',
			slotKey: `live-artifact:${metadata.draftId}`,
			parameterKey: `version:${version.id}`,
			renderMode: 'replace',
			payload,
			metadata: {
				source: 'agent-tool',
				sourceId: metadata.draftId
			}
		}
		return [
			JSON.stringify({
				ok: true,
				draftId: metadata.draftId,
				artifactId: artifact.id,
				artifactVersionId: version.id,
				versionNumber: version.versionNumber,
				bindingIds: payload.bindingIds,
				...(extra ?? {})
			}),
			{ [DATA_X_LIVE_ARTIFACT_VISUALIZATION_META_KEY]: visualization }
		] as [string, { [DATA_X_LIVE_ARTIFACT_VISUALIZATION_META_KEY]: typeof visualization }]
	}

	private readVersionMetadata(version: ArtifactVersionRecord): IDataXLiveArtifactVersionMetadata {
		const metadata = version.metadata
		let manifest: IDataXLiveArtifactManifest | null = null
		try {
			manifest = readManifest(metadata?.['manifest'])
		} catch {
			manifest = null
		}
		if (
			!metadata ||
			metadata['schema'] !== DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA ||
			metadata['protocolVersion'] !== DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION ||
			typeof metadata['draftId'] !== 'string' ||
			!manifest
		) {
			throw new Error('Artifact version is not a valid Data X Live Artifact')
		}
		return {
			schema: DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA,
			protocolVersion: DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION,
			draftId: metadata['draftId'],
			...(typeof metadata['changeSummary'] === 'string' ? { changeSummary: metadata['changeSummary'] } : {}),
			manifest
		}
	}

	private assertLiveArtifact(artifact: ArtifactRecord) {
		if (
			artifact.pluginName !== DATA_X_LIVE_ARTIFACT_PLUGIN_NAME ||
			artifact.resourceType !== DATA_X_LIVE_ARTIFACT_RESOURCE_TYPE ||
			artifact.kind !== 'html'
		) {
			throw new Error('Artifact is not a Data X Live Artifact')
		}
	}

	private requireArtifacts() {
		return this.context.runtime.capabilities?.require(ArtifactsRuntimeCapability) ?? missingCapability('Artifacts')
	}

	private requireWorkspaceFiles() {
		return (
			this.context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability) ??
			missingCapability('Workspace Files')
		)
	}
}

function digest(buffer: Buffer) {
	return createHash('sha256').update(buffer).digest('hex')
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	if (value && typeof value === 'object') {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(',')}}`
	}
	return JSON.stringify(value)
}

function normalizeDraftInput(input: ValidateLiveArtifactInput): Omit<DraftInput, 'draftId'> {
	return {
		title: requiredString(input.title, 'title'),
		...(typeof input.description === 'string' && input.description ? { description: input.description } : {}),
		htmlPath: requiredString(input.htmlPath, 'htmlPath'),
		manifest: readManifest(input.manifest),
		...(typeof input.changeSummary === 'string' && input.changeSummary
			? { changeSummary: input.changeSummary }
			: {})
	}
}

function readManifest(value: unknown): IDataXLiveArtifactManifest {
	const parsed = DataXLiveArtifactManifestSchema.safeParse(value)
	if (!parsed.success || parsed.data.version !== 1 || !parsed.data.bindings?.length) {
		throw new Error('manifest is invalid')
	}
	return {
		version: 1,
		bindings: parsed.data.bindings.map((binding) => ({
			id: requiredString(binding.id, 'binding.id'),
			...(typeof binding.label === 'string' && binding.label ? { label: binding.label } : {}),
			resourceId: requiredString(binding.resourceId, 'binding.resourceId'),
			actionTypeCode:
				binding.actionTypeCode === 'mdx.query_cube_slice'
					? 'mdx.query_cube_slice'
					: 'mdx.query_metric_snapshot',
			target: {
				...(typeof binding.target?.entityId === 'string' ? { entityId: binding.target.entityId } : {}),
				...(typeof binding.target?.entityTypeCode === 'string'
					? { entityTypeCode: binding.target.entityTypeCode }
					: {}),
				...(typeof binding.target?.entityRef === 'string' ? { entityRef: binding.target.entityRef } : {})
			},
			params: binding.params ?? {}
		})),
		...(parsed.data.controls
			? {
					controls: parsed.data.controls.map((control) => ({
						id: requiredString(control.id, 'control.id'),
						label: requiredString(control.label, 'control.label'),
						type: control.type ?? 'text',
						...(control.defaultValue !== undefined ? { defaultValue: control.defaultValue } : {}),
						...(control.options
							? {
									options: control.options.map((option) => ({
										label: requiredString(option.label, 'control.option.label'),
										value: option.value ?? ''
									}))
								}
							: {})
					}))
				}
			: {}),
		...(typeof parsed.data.cacheTtlSeconds === 'number' ? { cacheTtlSeconds: parsed.data.cacheTtlSeconds } : {})
	}
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
	return value.trim()
}

function missingCapability(name: string): never {
	throw new Error(`${name} runtime capability is unavailable`)
}
