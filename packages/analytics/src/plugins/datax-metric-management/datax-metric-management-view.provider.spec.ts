import { XpertResolvedViewHostContext } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	renderRemoteReactIframeHtml: (options: { title: string; appScript: string }) =>
		`<!doctype html><title>${options.title}</title><style>.xui-button{}</style><script>${options.appScript}</script>`,
	ViewExtensionProvider: () => () => undefined
}))
jest.mock('@xpert-ai/server-config', () => ({
	environment: {
		clientBaseUrl: 'http://localhost'
	}
}))
jest.mock('../../ai/queries', () => ({
	GetBIContextQuery: class GetBIContextQuery {
		constructor(
			public readonly models?: string[],
			public readonly params?: unknown
		) {}
	}
}))
jest.mock('../../ai/toolset/builtin/bi-toolset', () => ({
	BIToolsEnum: {
		SHOW_INDICATORS: 'show_indicators'
	},
	updateOcapIndicators: jest.fn()
}))
jest.mock('../../indicator', () => ({
	IndicatorService: class IndicatorService {},
	applyIndicatorDraft: (indicator: unknown) => indicator,
	createIndicatorNamespace: (projectId: string) => ['project', projectId, 'indicators']
}))
jest.mock('../../indicator/indicator.entity', () => ({
	Indicator: class Indicator {}
}))
jest.mock('../../model-member', () => ({
	RetrieveMembersCommand: class RetrieveMembersCommand {
		constructor(
			public readonly query: string,
			public readonly options: unknown
		) {}
	}
}))
jest.mock('../../project', () => ({
	CreateProjectStoreCommand: class CreateProjectStoreCommand {
		constructor(public readonly input: unknown) {}
	},
	ProjectGetQuery: class ProjectGetQuery {
		constructor(public readonly input: unknown) {}
	},
	ProjectMyQuery: class ProjectMyQuery {
		constructor(public readonly input: unknown) {}
	}
}))

import {
	AGENT_WORKBENCH_FIXED_SLOT,
	AGENT_WORKBENCH_MAIN_SLOT,
	DATA_X_METRIC_MANAGEMENT_FEATURE,
	DATA_X_METRIC_MANAGEMENT_TOOL_NAMES,
	DATA_X_METRIC_REMOTE_ENTRY_KEY,
	DATA_X_METRIC_VIEW_KEY
} from './constants'
import { DataXMetricManagementService } from './datax-metric-management.service'
import { DataXMetricManagementViewProvider } from './datax-metric-management-view.provider'

describe('DataXMetricManagementViewProvider', () => {
	const context: XpertResolvedViewHostContext = {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		hostType: 'agent',
		hostId: 'agent-1',
		slots: [{ key: AGENT_WORKBENCH_MAIN_SLOT, mode: 'sections' }]
	}

	it('returns an iframe remote component manifest for metric management', () => {
		const provider = createProvider()
		const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_MAIN_SLOT)

		expect(manifest.key).toBe(DATA_X_METRIC_VIEW_KEY)
		expect(manifest.view).toEqual(
			expect.objectContaining({
				type: 'remote_component',
				runtime: 'react',
				protocolVersion: 1,
				component: {
					isolation: 'iframe',
					entry: DATA_X_METRIC_REMOTE_ENTRY_KEY
				}
			})
		)
		expect(manifest.activation?.requiredFeatures).toEqual([DATA_X_METRIC_MANAGEMENT_FEATURE])
		expect(manifest.actions?.find((action) => action.key === 'create')?.inputSchema?.properties).toEqual(
			expect.objectContaining({
				modelId: expect.anything(),
				cube: expect.anything(),
				measure: expect.anything(),
				formula: expect.anything(),
				filters: expect.anything()
			})
		)
	})

	it('declares fixed workbench metadata behind the metric management feature', () => {
		const provider = createProvider()
		const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_FIXED_SLOT)

		expect(manifest.slot).toBe(AGENT_WORKBENCH_FIXED_SLOT)
		expect(manifest.activation?.requiredFeatures).toEqual([DATA_X_METRIC_MANAGEMENT_FEATURE])
		expect(manifest.workbench).toEqual(
			expect.objectContaining({
				fixed: true,
				menu: expect.objectContaining({
					enabled: true
				})
			})
		)
	})

	it('subscribes the remote component to metric tool completion events', () => {
		const provider = createProvider()
		const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_MAIN_SLOT)

		expect(manifest.hostEvents?.subscriptions?.[0]).toEqual(
			expect.objectContaining({
				key: 'datax-metric-management-tool-completed',
				event: 'assistant.tool.completed',
				filter: {
					sources: ['chatkit'],
					toolNames: [...DATA_X_METRIC_MANAGEMENT_TOOL_NAMES]
				},
				action: {
					type: 'forward',
					debounceMs: 1000
				}
			})
		)
	})

	it('returns a single html entry without exposing host credentials', async () => {
		const provider = createProvider()
		const entry = await provider.getRemoteComponentEntry(context, DATA_X_METRIC_VIEW_KEY, {
			isolation: 'iframe',
			entry: DATA_X_METRIC_REMOTE_ENTRY_KEY
		})

		expect(entry.contentType).toBe('text/html; charset=utf-8')
		expect(entry.html).toContain('Metric Management')
		expect(entry.html).toContain('xpertai.remote_component')
		expect(entry.html).toContain('xui-button')
		expect(entry.html).not.toContain('__REACT_UMD__')
		expect(entry.html).not.toContain('__REACT_DOM_UMD__')
		expect(entry.html).not.toContain('Authorization')
		expect(entry.html).not.toContain('Bearer')
	})

	it('loads view data through the metric management service', async () => {
		const service = createService()
		const provider = createProvider(service)

		const result = await provider.getViewData(context, DATA_X_METRIC_VIEW_KEY, {
			page: 2,
			pageSize: 10,
			parameters: {
				projectId: 'project-1'
			}
		})

		expect(service.getViewData).toHaveBeenCalledWith(
			expect.objectContaining({
				page: 2,
				pageSize: 10
			})
		)
		expect(result).toEqual({
			items: [{ id: 'metric-1', code: 'GMV' }],
			total: 1
		})
	})

	it('loads project and model parameter options from the service', async () => {
		const provider = createProvider()

		await expect(
			provider.getViewParameterOptions(context, DATA_X_METRIC_VIEW_KEY, 'projectId', { search: 'sales' })
		).resolves.toEqual({
			items: [{ value: 'project-1', label: 'Sales Project' }]
		})
		await expect(
			provider.getViewParameterOptions(context, DATA_X_METRIC_VIEW_KEY, 'modelId', {
				parameters: { projectId: 'project-1' }
			})
		).resolves.toEqual({
			items: [{ value: 'model-1', label: 'Sales Model' }]
		})
	})

	it('executes create, edit, publish, embedding, and delete actions through the service', async () => {
		const service = createService()
		const provider = createProvider(service)

		await provider.executeViewAction(context, DATA_X_METRIC_VIEW_KEY, 'create', {
			parameters: { projectId: 'project-1' },
			input: { code: 'GMV', name: 'GMV', type: 'BASIC', measure: 'Sales' }
		})
		await provider.executeViewAction(context, DATA_X_METRIC_VIEW_KEY, 'edit', {
			targetId: 'metric-1',
			input: { code: 'GMV', name: 'GMV Updated', type: 'DERIVE', formula: '[Measures].[Sales]' }
		})
		await provider.executeViewAction(context, DATA_X_METRIC_VIEW_KEY, 'publish', { targetId: 'metric-1' })
		await provider.executeViewAction(context, DATA_X_METRIC_VIEW_KEY, 'embedding', { targetId: 'metric-1' })
		await provider.executeViewAction(context, DATA_X_METRIC_VIEW_KEY, 'delete', { targetId: 'metric-1' })

		expect(service.createViewDraft).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'GMV' }))
		expect(service.updateViewDraft).toHaveBeenCalledWith('metric-1', expect.objectContaining({ code: 'GMV' }))
		expect(service.publishIndicator).toHaveBeenCalledWith('metric-1')
		expect(service.embeddingIndicator).toHaveBeenCalledWith('metric-1')
		expect(service.deleteIndicatorById).toHaveBeenCalledWith('metric-1')
	})
})

function createProvider(service = createService()) {
	return new DataXMetricManagementViewProvider(service)
}

function createService() {
	return {
		getViewData: jest.fn(async () => ({
			items: [{ id: 'metric-1', code: 'GMV' }],
			total: 1
		})),
		loadProjects: jest.fn(async () => [
			{
				id: 'project-1',
				name: 'Sales Project',
				models: [{ id: 'model-1', name: 'Sales Model' }]
			}
		]),
		createViewDraft: jest.fn(async () => ({ id: 'metric-1' })),
		updateViewDraft: jest.fn(async () => ({ id: 'metric-1' })),
		publishIndicator: jest.fn(async () => ({ id: 'metric-1' })),
		embeddingIndicator: jest.fn(async () => ({ id: 'metric-1' })),
		deleteIndicatorById: jest.fn(async () => undefined)
	} as unknown as DataXMetricManagementService & Record<string, jest.Mock>
}
