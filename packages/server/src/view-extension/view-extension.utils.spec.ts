import { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import path from 'node:path'
import i18next from 'i18next'
import {
	isManifestActiveForContext,
	normalizeManifest,
	parseViewQuery,
	splitPublicViewKey,
	validateQuery
} from './view-extension.utils'
import { RequestContext } from '../core/context'
import { initI18next } from '../bootstrap/i18next'

describe('view extension utils', () => {
	const text = (en_US: string, zh_Hans?: string) => ({
		en_US,
		...(zh_Hans ? { zh_Hans } : {})
	})

	const context: XpertResolvedViewHostContext = {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		hostType: 'integration',
		hostId: 'integration-1',
		locale: 'en_US',
		slots: [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }]
	}

	const manifest: XpertExtensionViewManifest = {
		key: 'users',
		title: text('Users', '用户'),
		hostType: 'integration',
		slot: 'detail.main_tabs',
		source: {
			provider: 'test'
		},
		view: {
			type: 'table',
			columns: [{ key: 'name', label: text('Name', '名称') }]
		},
		dataSource: {
			mode: 'platform',
			querySchema: {
				supportsPagination: true,
				supportsSearch: true,
				defaultPageSize: 10
			}
		},
		actions: [
			{
				key: 'refresh',
				label: text('Refresh', '刷新'),
				actionType: 'refresh'
			}
		]
	}

	beforeAll(async () => {
		if (!i18next.isInitialized) {
			await initI18next(path.resolve(__dirname, '../../..'))
		}
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('normalizes manifests into public view keys and default action placement', () => {
		const normalized = normalizeManifest(manifest, 'provider_a', context, 'detail.main_tabs')

		expect(normalized.key).toBe('provider_a__users')
		expect(normalized.source.provider).toBe('provider_a')
		expect(normalized.actions?.[0].placement).toBe('toolbar')
		expect(normalized.actions?.[0].transport).toBe('json')
	})

	it('normalizes host event subscriptions', () => {
		const normalized = normalizeManifest(
			{
				...manifest,
				hostEvents: {
					subscriptions: [
						{
							key: 'tool-completed',
							event: 'assistant.tool.completed',
							filter: {
								sources: ['chatkit', ''],
								toolNames: ['save_tool'],
								viewKeys: ['provider_a__users']
							},
							action: {
								type: 'forward',
								debounceMs: 100.8
							}
						}
					]
				}
			},
			'provider_a',
			context,
			'detail.main_tabs'
		)

		expect(normalized.hostEvents?.subscriptions?.[0]).toMatchObject({
			key: 'tool-completed',
			event: 'assistant.tool.completed',
			filter: {
				sources: ['chatkit'],
				toolNames: ['save_tool'],
				viewKeys: ['provider_a__users']
			},
			action: {
				type: 'forward',
				debounceMs: 100
			}
		})
	})

	it('rejects unsupported public view keys and unexpected query parameters', () => {
		expect(() => splitPublicViewKey('provider-only')).toThrow("Invalid view key 'provider-only'")

		const queryInput: Record<string, string | string[] | undefined> = {
			unexpected: '1'
		}

		expect(() => parseViewQuery(queryInput)).toThrow("Unsupported query parameter 'unexpected'")
	})

	it('rejects unsupported query capabilities', () => {
		const query: XpertViewQuery = {
			search: 'john'
		}

		const queryParametersError = catchHttpResponse(() =>
			validateQuery(query, {
				mode: 'platform'
			})
		)
		expect(queryParametersError).toMatchObject({
			message: 'This view does not support query parameters',
			i18nKey: 'ViewExtension.Errors.QueryParameters'
		})

		const selectionError = catchHttpResponse(() =>
			validateQuery(
				{
					selectionId: 'row-1'
				},
				{
					mode: 'platform',
					querySchema: {
						supportsPagination: true
					}
				}
			)
		)
		expect(selectionError).toMatchObject({
			message: 'This view does not support selection queries',
			i18nKey: 'ViewExtension.Errors.Selection'
		})
	})

	it('localizes unsupported query capability errors at the source', () => {
		jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue('zh-Hans' as never)

		const error = catchHttpResponse(() =>
			validateQuery(
				{
					sortBy: 'name'
				},
				{
					mode: 'platform',
					querySchema: {
						supportsPagination: true
					}
				}
			)
		)

		expect(error).toMatchObject({
			message: '此视图不支持排序',
			i18nKey: 'ViewExtension.Errors.Sorting'
		})
	})

	it('rejects unsupported schema and action placement declarations', () => {
		const invalidSchemaManifest = {
			...manifest,
			view: {
				type: 'cards'
			}
		} as unknown as XpertExtensionViewManifest

		expect(() => normalizeManifest(invalidSchemaManifest, 'provider_a', context, 'detail.main_tabs')).toThrow(
			"Unsupported view schema type 'cards'"
		)

		const invalidActionManifest = {
			...manifest,
			actions: [
				{
					key: 'open',
					label: text('Open', '打开'),
					actionType: 'navigate',
					placement: 'inline'
				}
			]
		} as unknown as XpertExtensionViewManifest

		expect(() => normalizeManifest(invalidActionManifest, 'provider_a', context, 'detail.main_tabs')).toThrow(
			"Unsupported action placement 'inline'"
		)

		const invalidTransportManifest = {
			...manifest,
			actions: [
				{
					key: 'upload',
					label: text('Upload', '上传'),
					actionType: 'invoke',
					transport: 'binary'
				}
			]
		} as unknown as XpertExtensionViewManifest

		expect(() => normalizeManifest(invalidTransportManifest, 'provider_a', context, 'detail.main_tabs')).toThrow(
			"Unsupported action transport 'binary'"
		)
	})

	it('accepts module-capable remote component runtimes and rejects unknown runtimes', () => {
		const remoteManifest: XpertExtensionViewManifest = {
			...manifest,
			key: 'design',
			view: {
				type: 'remote_component',
				runtime: 'vue',
				protocolVersion: 1,
				component: {
					isolation: 'iframe',
					entry: 'pencil-workbench'
				},
				dataSource: {
					mode: 'platform'
				}
			}
		}

		expect(() => normalizeManifest(remoteManifest, 'provider_a', context, 'detail.main_tabs')).not.toThrow()

		const invalidRuntimeManifest = {
			...remoteManifest,
			view: {
				...remoteManifest.view,
				runtime: 'angular'
			}
		} as unknown as XpertExtensionViewManifest

		expect(() => normalizeManifest(invalidRuntimeManifest, 'provider_a', context, 'detail.main_tabs')).toThrow(
			"Remote component view 'provider_a:design' uses an unsupported runtime"
		)
	})

	it('rejects non-i18n text declarations', () => {
		const invalidTitleManifest = {
			...manifest,
			title: 'Users'
		} as unknown as XpertExtensionViewManifest

		expect(() => normalizeManifest(invalidTitleManifest, 'provider_a', context, 'detail.main_tabs')).toThrow(
			"View manifest 'provider_a:users' must have a title"
		)
	})

	it('matches manifest activation against host capabilities', () => {
		const activatedManifest: XpertExtensionViewManifest = {
			...manifest,
			activation: {
				requiredFeatures: ['sandbox', 'datax_metric_management']
			}
		}
		const activeContext: XpertResolvedViewHostContext = {
			...context,
			capabilities: {
				features: ['sandbox', 'datax_metric_management']
			}
		}
		const inactiveContext: XpertResolvedViewHostContext = {
			...context,
			capabilities: {
				features: ['sandbox']
			}
		}

		expect(isManifestActiveForContext(activatedManifest, activeContext)).toBe(true)
		expect(isManifestActiveForContext(activatedManifest, inactiveContext)).toBe(false)
	})

	it('requires feature activation for slots with that manifest policy', () => {
		const policyManifest: XpertExtensionViewManifest = {
			...manifest,
			slot: 'detail.secure_sections'
		}
		const policyContext: XpertResolvedViewHostContext = {
			...context,
			slots: [
				{
					key: 'detail.secure_sections',
					mode: 'sections',
					order: 10,
					manifestPolicy: { requireFeatureActivation: true }
				}
			],
			capabilities: {
				features: ['excalidraw']
			}
		}

		expect(isManifestActiveForContext(policyManifest, policyContext)).toBe(false)
		expect(
			isManifestActiveForContext(
				{
					...policyManifest,
					activation: {
						requiredFeatures: ['excalidraw']
					}
				},
				policyContext
			)
		).toBe(true)
		expect(
			isManifestActiveForContext(
				{
					...policyManifest,
					activation: {
						requiredFeatures: ['smart_maintenance']
					}
				},
				policyContext
			)
		).toBe(false)
	})
})

function catchHttpResponse(fn: () => unknown): Record<string, unknown> {
	try {
		fn()
	} catch (error) {
		if (error && typeof error === 'object' && 'getResponse' in error) {
			const response = (error as { getResponse(): unknown }).getResponse()
			if (response && typeof response === 'object') {
				return response as Record<string, unknown>
			}
		}

		throw error
	}

	throw new Error('Expected function to throw')
}
