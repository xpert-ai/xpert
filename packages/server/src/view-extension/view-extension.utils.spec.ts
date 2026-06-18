import { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import {
	isManifestActiveForContext,
	normalizeManifest,
	parseViewQuery,
	splitPublicViewKey,
	validateQuery
} from './view-extension.utils'

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

		expect(() =>
			validateQuery(query, {
				mode: 'platform'
			})
		).toThrow('This view does not support query parameters')

		expect(() =>
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
		).toThrow('This view does not support selection queries')
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
