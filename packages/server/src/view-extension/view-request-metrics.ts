import type { XpertExtensionViewManifest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'

const VIEW_DATA_ROUTE = '/api/view-hosts/:hostType/:hostId/views/:viewKey/data'
const resolvedRoutes = new WeakMap<object, string>()

/** Call only after host/manifest resolution and visibility checks, never with raw URL parameters. */
export function identifyViewDataRequest(
	request: object | null | undefined,
	context: XpertResolvedViewHostContext,
	manifest: XpertExtensionViewManifest
) {
	if (!request || resolvedRoutes.has(request)) return
	// Keep resource IDs and query values out of labels; nested provider calls retain the outer view identity.
	resolvedRoutes.set(
		request,
		`/api/view-hosts/${encodeURIComponent(context.hostType)}/:hostId/views/${encodeURIComponent(manifest.key)}/data`
	)
}

/** Preserve the template for unrelated routes and requests whose view could not be resolved. */
export function getViewDataRequestMetricRoute(request: object, routeTemplate: string): string {
	return routeTemplate === VIEW_DATA_ROUTE ? (resolvedRoutes.get(request) ?? routeTemplate) : routeTemplate
}
