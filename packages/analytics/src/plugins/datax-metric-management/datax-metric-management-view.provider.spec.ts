import { XpertResolvedViewHostContext } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	renderRemoteReactIframeHtml: (options: { title: string; appScript: string }) =>
		`<!doctype html><title>${options.title}</title><style>.xui-button{}</style><script>${options.appScript}</script>`,
	ViewExtensionProvider: () => () => undefined
}))
jest.mock('../../indicator', () => ({
	IndicatorService: class IndicatorService {}
}))
jest.mock('../../indicator/indicator.entity', () => ({
	Indicator: class Indicator {}
}))
jest.mock('../../project', () => ({
	ProjectMyQuery: class ProjectMyQuery {
		constructor(public readonly input: unknown) {}
	}
}))

import { AGENT_WORKBENCH_MAIN_SLOT, DATA_X_METRIC_REMOTE_ENTRY_KEY, DATA_X_METRIC_VIEW_KEY } from './constants'
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
		const provider = new DataXMetricManagementViewProvider({} as never, {} as never)
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
	})

	it('returns a single html entry without exposing host credentials', async () => {
		const provider = new DataXMetricManagementViewProvider({} as never, {} as never)
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
})
