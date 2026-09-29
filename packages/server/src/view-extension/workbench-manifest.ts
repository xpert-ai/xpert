import type { XpertExtensionViewManifest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'

const WORKBENCH_SLOTS = ['agent.workbench.fixed', 'agent.workbench.main']

/**
 * Preserve public fixed/main slots and provider-specific declarations. The
 * provisional unified slot is accepted only as a fallback for installed plugins;
 * it never replaces a declaration for the requested slot. Permissions and Feature
 * activation are still checked by ViewExtensionService after normalization.
 */
export async function readProviderViewManifests(
	provider: Pick<IXpertViewExtensionProvider, 'getViewManifests'>,
	context: XpertResolvedViewHostContext,
	slot: string
): Promise<XpertExtensionViewManifest[]> {
	const manifests = await provider.getViewManifests(context, slot)
	if (context.hostType !== 'agent' || !WORKBENCH_SLOTS.includes(slot)) return manifests
	if (manifests.length) return manifests.map((manifest) => normalizeWorkbenchManifest(manifest, slot, slot))
	const transitional = await provider.getViewManifests(context, 'agent.workbench')
	return transitional.map((manifest) => normalizeWorkbenchManifest(manifest, 'agent.workbench', slot))
}

/** Keep the visibility flag for older consumers; opening policy is independent. */
function normalizeWorkbenchManifest(
	manifest: XpertExtensionViewManifest,
	providerSlot: string,
	requestedSlot: string
): XpertExtensionViewManifest {
	const options = manifest.workbench
	return {
		...manifest,
		// A provider returning another slot is still rejected by normalizeManifest.
		slot: manifest.slot === providerSlot ? requestedSlot : manifest.slot,
		...(options?.fixed === false ? { visible: false } : {}),
		...(options
			? { workbench: { ...options, openMode: options.openMode === 'on-demand' ? 'on-demand' : 'auto' } }
			: {})
	}
}
