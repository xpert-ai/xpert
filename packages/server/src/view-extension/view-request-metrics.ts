import type { XpertExtensionViewManifest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'

const VIEW_ROUTE_PREFIXES = ['/api/view-hosts', '/api/ai/groups/:groupId/workbench']
const VIEW_ROUTE_SUFFIXES = [
	'data',
	'manifest',
	'remote-component/entry',
	'parameters/:parameterKey/options',
	'actions/:actionKey',
	'actions/:actionKey/file'
]
const VIEW_ROUTES = new Set(
	VIEW_ROUTE_PREFIXES.flatMap((prefix) =>
		VIEW_ROUTE_SUFFIXES.map((suffix) => `${prefix}/:hostType/:hostId/views/:viewKey/${suffix}`)
	)
)
const resolvedViews = new WeakMap<object, { hostType: string; viewKey: string }>()

/** Call only after host/manifest resolution and visibility checks, never with raw URL parameters. */
export function identifyViewRequest(
	request: object | null | undefined,
	context: XpertResolvedViewHostContext,
	manifest: XpertExtensionViewManifest
) {
	if (!request || resolvedViews.has(request)) return
	// Keep resource IDs and query values out of labels; nested provider calls retain the outer view identity.
	resolvedViews.set(request, {
		hostType: encodeURIComponent(context.hostType),
		viewKey: encodeURIComponent(manifest.key)
	})
}

/** Preserve the template for unrelated routes and requests whose view could not be resolved. */
export function getViewRequestMetricRoute(request: object, routeTemplate: string): string {
	const view = resolvedViews.get(request)
	if (!view || !VIEW_ROUTES.has(routeTemplate)) return routeTemplate
	return routeTemplate.replace(':hostType', () => view.hostType).replace(':viewKey', () => view.viewKey)
}

// Preserve the existing server-core export for callers using its original data-only name.
export { getViewRequestMetricRoute as getViewDataRequestMetricRoute }
