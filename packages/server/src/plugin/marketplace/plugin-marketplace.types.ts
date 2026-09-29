import {
	type PluginLevel,
	type PluginMarketplaceItem,
	type PluginMarketplaceRegistryItemInput,
	type PluginMarketplaceRegistryItemResponse,
	type PluginMarketplaceSourceInput,
	type PluginMarketplaceSourceResponse,
	PluginMeta
} from '@xpert-ai/contracts'

import { execFile as execFileCallback } from 'node:child_process'

import { promisify } from 'node:util'

import { PluginMarketplaceSource, PluginMarketplaceSourceType } from './plugin-marketplace-source.entity'

export const execFile = promisify(execFileCallback)
export const BUILTIN_SOURCE_ID = 'builtin-default'
export const BUILTIN_SOURCE_CACHE_NAME = '__xpert_builtin_plugin_marketplace_source__'
export const PLATFORM_REGISTRY_SOURCE_ID = 'platform-registry'
export const PLATFORM_REGISTRY_SOURCE_NAME = 'XpertAI Platform Registry'
export const PLATFORM_REGISTRY_SOURCE_URL = 'xpert-platform://plugins'
export const BUILTIN_MARKETPLACE_URL =
	process.env.XPERT_PLUGIN_MARKETPLACE_URL ?? 'https://xpert-ai.github.io/xpert-plugin-registry/plugins/index.json'
export const MARKETPLACE_CACHE_TTL_MS = parsePositiveInteger(
	process.env.XPERT_PLUGIN_MARKETPLACE_CACHE_TTL_MS,
	10 * 60 * 1000
)
export const MARKETPLACE_REQUEST_TIMEOUT_MS = parsePositiveInteger(
	process.env.XPERT_PLUGIN_MARKETPLACE_REQUEST_TIMEOUT_MS,
	10_000
)
export const NPM_DOWNLOADS_CONCURRENCY = parsePositiveInteger(process.env.XPERT_PLUGIN_NPM_DOWNLOADS_CONCURRENCY, 6)

export type JsonRecord = Record<string, any>

export interface MarketplaceSourceRecord {
	id: string
	name: string
	type: PluginMarketplaceSourceType | 'platform'
	url: string
	ref?: string | null
	sparsePath?: string | null
	enabled?: boolean
	priority?: number
	lastIndexStatus?: string | null
	lastIndexedAt?: Date | string | null
	lastIndexError?: string | null
	lastCatalog?: NormalizedMarketplaceCatalog | null
	builtin?: boolean
	entity?: PluginMarketplaceSource
}

export interface MarketplaceRegistryPlugin extends JsonRecord {
	icon?: PluginMarketplaceItem['icon']
	name: string
	artifactNamespace?: string | null
	level?: PluginLevel
	sourceId?: string
	sourceName?: string
	source?: {
		type?: string
		url?: string
		packageName?: string
	}
}

export interface NormalizedMarketplaceCatalog {
	updatedAt: string | null
	total: number
	plugins: MarketplaceRegistryPlugin[]
	official?: string[]
	partner?: string[]
	community?: string[]
}

export interface InstalledPluginContext {
	installedNames: Set<string>
	loadedMetaByName: Map<string, PluginMeta>
}

export interface NpmPackageArchive {
	version: string | null
	tarball: string
}

export type {
	PluginMarketplaceRegistryItemInput,
	PluginMarketplaceRegistryItemResponse,
	PluginMarketplaceSourceInput,
	PluginMarketplaceSourceResponse
} from '@xpert-ai/contracts'

export interface PluginMarketplaceListQuery {
	targetApp?: string
	sourceId?: string
	search?: string
	view?: 'summary'
}

export interface PluginMarketplaceDetailQuery extends PluginMarketplaceListQuery {
	locale?: string
}

export function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function readRecord(value: unknown): JsonRecord | null {
	return isRecord(value) ? value : null
}

export function isArtifactNamespace(value: string) {
	return /^[a-z0-9_]+$/.test(value)
}

export function parsePositiveInteger(value: unknown, fallback: number) {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
