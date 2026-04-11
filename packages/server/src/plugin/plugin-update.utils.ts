import { PLUGIN_LEVEL, PluginLevel, PluginSource, RolesEnum } from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { LoadedPluginRecord } from './types'

type PluginScopeRecord = Pick<LoadedPluginRecord, 'organizationId' | 'source'> & {
	level?: PluginLevel
	instance?: {
		meta?: {
			level?: PluginLevel
		}
	}
}

export function canManageGlobalPlugins() {
	return RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
}

export function canManageSystemPlugins(organizationId: string) {
	return organizationId === GLOBAL_ORGANIZATION_SCOPE && canManageGlobalPlugins()
}

export function canUpdatePlugin(plugin: LoadedPluginRecord, organizationId: string) {
	if (plugin.source === 'code') {
		return false
	}

	if (plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE) {
		return organizationId === GLOBAL_ORGANIZATION_SCOPE && canManageSystemPlugins(organizationId)
	}

	return plugin.organizationId === organizationId
}

export function canUninstallPlugin(plugin: PluginScopeRecord, organizationId: string) {
	const level = plugin.level ?? plugin.instance?.meta?.level ?? PLUGIN_LEVEL.ORGANIZATION
	if (level === PLUGIN_LEVEL.SYSTEM) {
		return canManageSystemPlugins(organizationId)
	}

	if (plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE) {
		return canManageSystemPlugins(organizationId)
	}

	return plugin.organizationId === organizationId
}

export function supportsNpmRegistryUpdates(source?: PluginSource) {
	return !['code', 'git', 'local', 'url'].includes(source ?? '')
}

export function hasNewerVersion(currentVersion?: string, latestVersion?: string) {
	if (!latestVersion) {
		return false
	}

	if (!currentVersion) {
		return true
	}

	return compareVersions(latestVersion, currentVersion) > 0
}

function compareVersions(left: string, right: string) {
	const parsedLeft = parseVersion(left)
	const parsedRight = parseVersion(right)

	if (!parsedLeft || !parsedRight) {
		return left === right ? 0 : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
	}

	const releaseLength = Math.max(parsedLeft.release.length, parsedRight.release.length)
	for (let i = 0; i < releaseLength; i++) {
		const diff = (parsedLeft.release[i] ?? 0) - (parsedRight.release[i] ?? 0)
		if (diff !== 0) {
			return diff
		}
	}

	const leftHasPrerelease = parsedLeft.prerelease.length > 0
	const rightHasPrerelease = parsedRight.prerelease.length > 0
	if (!leftHasPrerelease && rightHasPrerelease) {
		return 1
	}
	if (leftHasPrerelease && !rightHasPrerelease) {
		return -1
	}

	const prereleaseLength = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length)
	for (let i = 0; i < prereleaseLength; i++) {
		const leftPart = parsedLeft.prerelease[i]
		const rightPart = parsedRight.prerelease[i]
		if (leftPart === undefined) {
			return -1
		}
		if (rightPart === undefined) {
			return 1
		}

		const diff = compareVersionIdentifier(leftPart, rightPart)
		if (diff !== 0) {
			return diff
		}
	}

	return 0
}

function parseVersion(version: string) {
	const normalized = version.trim().replace(/^v/i, '').split('+', 1)[0]
	if (!normalized) {
		return null
	}

	const [releasePart, prereleasePart] = normalized.split('-', 2)
	const release = releasePart.split('.').map(parseReleaseIdentifier)
	if (!release.length || release.some((part) => part === null)) {
		return null
	}

	return {
		release: release as number[],
		prerelease: prereleasePart ? prereleasePart.split('.').map(parseVersionIdentifier) : []
	}
}

function parseReleaseIdentifier(part: string) {
	return /^\d+$/.test(part) ? Number(part) : null
}

function parseVersionIdentifier(part: string) {
	return /^\d+$/.test(part) ? Number(part) : part
}

function compareVersionIdentifier(left: number | string, right: number | string) {
	if (typeof left === 'number' && typeof right === 'number') {
		return left - right
	}
	if (typeof left === 'number') {
		return -1
	}
	if (typeof right === 'number') {
		return 1
	}
	return left.localeCompare(right)
}
