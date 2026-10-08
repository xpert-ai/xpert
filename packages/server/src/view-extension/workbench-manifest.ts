import {
	AGENT_WORKBENCH_SLOT,
	LEGACY_AGENT_WORKBENCH_SLOTS,
	type XpertExtensionViewManifest,
	type XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'

export function normalizeWorkbenchSlot(hostType: string, slot: string): string {
	return hostType === 'agent' && LEGACY_AGENT_WORKBENCH_SLOTS.some((legacy) => legacy === slot)
		? AGENT_WORKBENCH_SLOT
		: slot
}

/**
 * The unified declaration is authoritative. Read fixed/main only for older providers,
 * deduplicating their view keys with fixed taking precedence. Preserve declarations
 * for normal slot, Feature and permission validation after compatibility mapping.
 */
export async function readProviderViewManifests(
	provider: Pick<IXpertViewExtensionProvider, 'getViewManifests'>,
	context: XpertResolvedViewHostContext,
	slot: string
): Promise<XpertExtensionViewManifest[]> {
	slot = normalizeWorkbenchSlot(context.hostType, slot)
	const manifests = await provider.getViewManifests(context, slot)
	if (context.hostType !== 'agent' || slot !== AGENT_WORKBENCH_SLOT) return manifests
	if (manifests.length) return manifests.map((manifest) => normalizeWorkbenchManifest(manifest, slot, slot))
	const legacyViews = new Map<string, XpertExtensionViewManifest>()
	for (const legacySlot of LEGACY_AGENT_WORKBENCH_SLOTS) {
		for (const manifest of await provider.getViewManifests(context, legacySlot)) {
			if (!legacyViews.has(manifest.key)) {
				legacyViews.set(manifest.key, normalizeWorkbenchManifest(manifest, legacySlot, slot))
			}
		}
	}
	return [...legacyViews.values()]
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
