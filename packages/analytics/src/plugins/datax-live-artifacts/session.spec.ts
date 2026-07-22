import {
	ArtifactsRuntimeCapability,
	WorkspaceFilesRuntimeCapability,
	type ArtifactRecord,
	type ArtifactVersionRecord,
	type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { EXTERNAL_ONLINE_RESOURCES_DEPRECATION_WARNING } from './html'
import { DataXLiveArtifactSession } from './session'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	__esModule: true,
	ArtifactsRuntimeCapability: { id: 'platform.artifacts' },
	WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111'
const VERSION_ID = '22222222-2222-4222-8222-222222222222'
const DRAFT_ID = '33333333-3333-4333-8333-333333333333'

describe('DataXLiveArtifactSession', () => {
	it('persists complete HTML as an immutable ArtifactVersion and preserves external asset warnings', async () => {
		const workspaceFiles = {
			readRuntimeBuffer: jest.fn(async () => ({
				buffer: Buffer.from(
					'<!doctype html><html><head><title>Sales</title><script src="https://cdn.example/chart.js"></script></head><body><script>const bridge=window.dataxLiveArtifact;bridge.subscribe("sales",update=>update.result.effect.series);bridge.ready.then(()=>bridge.query("sales").then(result=>result.effect.series))</script></body></html>'
				)
			})),
			writeRuntimeBuffer: jest.fn(async (input: { buffer: Buffer }) => ({
				reference: {
					source: 'platform.workspace.files',
					filePath: 'live-artifacts/sales.html',
					workspacePath: '/workspace/live-artifacts/sales.html'
				},
				buffer: input.buffer
			}))
		}
		const artifact: ArtifactRecord = {
			id: ARTIFACT_ID,
			pluginName: '@xpert-ai/datax-live-artifacts',
			resourceType: 'live-artifact-draft',
			resourceId: DRAFT_ID,
			kind: 'html',
			status: 'active',
			currentVersionId: null
		}
		const version: ArtifactVersionRecord = {
			id: VERSION_ID,
			artifactId: ARTIFACT_ID,
			versionNumber: 1,
			status: 'active',
			mimeType: 'text/html',
			title: 'Sales pulse',
			sha256: 'a'.repeat(64)
		}
		const artifacts = {
			createArtifact: jest.fn(async () => artifact),
			ensureArtifactVersion: jest.fn(async () => ({ version, outcome: 'created' as const }))
		}
		const session = new DataXLiveArtifactSession(createContext(workspaceFiles, artifacts))

		const result = await session.create({
			draftId: DRAFT_ID,
			title: 'Sales pulse',
			htmlPath: '/workspace/sales.html',
			manifest: {
				version: 1,
				bindings: [
					{
						id: 'sales',
						resourceId: 'semantic-resource-1',
						actionTypeCode: 'mdx.query_metric_snapshot',
						target: { entityId: 'contract-1' },
						params: { window: '${controls.window}' }
					}
				],
				controls: [{ id: 'window', label: 'Window', type: 'text', defaultValue: 'P30D' }]
			}
		})

		const writtenHtml = workspaceFiles.writeRuntimeBuffer.mock.calls[0][0].buffer.toString('utf8')
		expect(writtenHtml).toContain("connect-src 'none'")
		expect(writtenHtml).toContain('window.dataxLiveArtifact=Object.freeze')
		expect(artifacts.ensureArtifactVersion).toHaveBeenCalledWith(
			expect.objectContaining({
				artifactId: ARTIFACT_ID,
				mimeType: 'text/html',
				metadata: expect.objectContaining({
					schema: 'datax.live_artifact/version',
					draftId: DRAFT_ID
				})
			})
		)
		expect(result[0]).not.toContain('<!doctype html>')
		expect(result[0]).toContain(EXTERNAL_ONLINE_RESOURCES_DEPRECATION_WARNING)
		expect(result[1]['xpertai/visualization'].payload).toEqual(
			expect.objectContaining({
				draftId: DRAFT_ID,
				contentRef: expect.objectContaining({
					artifactId: ARTIFACT_ID,
					artifactVersionId: VERSION_ID
				})
			})
		)
	})

	it('rejects a lost update before writing a new version', async () => {
		const artifacts = {
			findArtifactBySource: jest.fn(async () => ({
				id: ARTIFACT_ID,
				pluginName: '@xpert-ai/datax-live-artifacts',
				resourceType: 'live-artifact-draft',
				resourceId: DRAFT_ID,
				kind: 'html',
				status: 'active',
				currentVersionId: VERSION_ID
			}))
		}
		const workspaceFiles = { readRuntimeBuffer: jest.fn() }
		const session = new DataXLiveArtifactSession(createContext(workspaceFiles, artifacts))

		await expect(
			session.update({
				draftId: DRAFT_ID,
				baseVersionId: '44444444-4444-4444-8444-444444444444',
				title: 'Conflict',
				htmlPath: '/workspace/conflict.html',
				manifest: {
					version: 1,
					bindings: [
						{
							id: 'sales',
							resourceId: 'resource-1',
							actionTypeCode: 'mdx.query_metric_snapshot',
							target: { entityId: 'contract-1' },
							params: {}
						}
					]
				}
			})
		).rejects.toThrow('update conflict')
		expect(workspaceFiles.readRuntimeBuffer).not.toHaveBeenCalled()
	})

	it('rejects an HTML shell before creating an artifact or runtime file', async () => {
		const workspaceFiles = {
			readRuntimeBuffer: jest.fn(async () => ({
				buffer: Buffer.from(
					'<!doctype html><html><head><title>Sales</title></head><body><h1>Sales</h1><div id="dashboard"></div></body></html>'
				)
			})),
			writeRuntimeBuffer: jest.fn()
		}
		const artifacts = { createArtifact: jest.fn(), ensureArtifactVersion: jest.fn() }
		const session = new DataXLiveArtifactSession(createContext(workspaceFiles, artifacts))

		await expect(
			session.create({
				draftId: DRAFT_ID,
				title: 'Sales shell',
				htmlPath: '/workspace/sales-shell.html',
				manifest: {
					version: 1,
					bindings: [
						{
							id: 'sales_trend',
							resourceId: 'resource-1',
							actionTypeCode: 'mdx.query_metric_snapshot',
							target: { entityId: 'contract-1' },
							params: {}
						}
					]
				}
			})
		).rejects.toThrow('HTML must use window.dataxLiveArtifact')
		expect(workspaceFiles.writeRuntimeBuffer).not.toHaveBeenCalled()
		expect(artifacts.createArtifact).not.toHaveBeenCalled()
	})
})

function createContext(workspaceFiles: object, artifacts: object): IAgentMiddlewareContext {
	const implementations = new Map<string, object>([
		[WorkspaceFilesRuntimeCapability.id, workspaceFiles],
		[ArtifactsRuntimeCapability.id, artifacts]
	])
	const capabilities = {
		require(key: { id: string }) {
			const implementation = implementations.get(key.id)
			if (!implementation) throw new Error(`Missing capability '${key.id}'`)
			return implementation
		}
	}
	return {
		tenantId: 'tenant-1',
		organizationId: 'organization-1',
		userId: 'user-1',
		node: {} as never,
		tools: new Map(),
		runtime: {
			capabilities: capabilities as never,
			createModelClient: jest.fn(),
			wrapWorkflowNodeExecution: jest.fn()
		}
	}
}
