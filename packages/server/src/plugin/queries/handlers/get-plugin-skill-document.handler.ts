import { BadRequestException, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { readFile, realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { type IPluginComponentDocument, PLUGIN_COMPONENT_TYPE } from '@xpert-ai/contracts'
import { resolveLoadedPluginBundleRoot } from '../../plugin-bundle-manifest'
import { PluginManagementService } from '../../plugin-management.service'
import { GetPluginSkillDocumentQuery } from '../get-plugin-skill-document.query'

@QueryHandler(GetPluginSkillDocumentQuery)
export class GetPluginSkillDocumentHandler implements IQueryHandler<GetPluginSkillDocumentQuery> {
	constructor(private readonly pluginManagementService: PluginManagementService) {}

	async execute(query: GetPluginSkillDocumentQuery): Promise<IPluginComponentDocument> {
		const pluginName = query.input.pluginName?.trim()
		const componentKey = query.input.componentKey?.trim()

		if (!pluginName) {
			throw new BadRequestException('plugin name is required')
		}
		if (!componentKey) {
			throw new BadRequestException('skill component key is required')
		}

		const loadedPlugin = this.pluginManagementService.findLoadedPlugin(pluginName, query.input.organizationId)
		if (!loadedPlugin) {
			throw new NotFoundException('plugin was not found')
		}

		const component = this.pluginManagementService
			.readLoadedPluginBundleComponents(loadedPlugin)
			.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.SKILL && item.componentKey === componentKey)
		if (!component) {
			throw new NotFoundException('skill component was not found')
		}

		const sourcePath = typeof component.sourcePath === 'string' ? component.sourcePath.trim() : ''
		const bundleRoot = resolveLoadedPluginBundleRoot(loadedPlugin)
		if (!sourcePath || !bundleRoot) {
			throw new NotFoundException('skill document was not found')
		}

		const bundleRootPath = resolve(bundleRoot)
		const documentPath = resolve(bundleRootPath, sourcePath)
		if (basename(documentPath) !== 'SKILL.md' || !isResolvedPathWithin(bundleRootPath, documentPath)) {
			throw new NotFoundException('skill document was not found')
		}

		let realBundleRoot: string
		let realDocumentPath: string
		try {
			realBundleRoot = await realpath(bundleRootPath)
			realDocumentPath = await realpath(documentPath)
		} catch {
			throw new NotFoundException('skill document was not found')
		}

		if (!isResolvedPathWithin(realBundleRoot, realDocumentPath)) {
			throw new NotFoundException('skill document was not found')
		}

		let content: string
		try {
			content = await readFile(realDocumentPath, 'utf8')
		} catch {
			throw new NotFoundException('skill document was not found')
		}

		return {
			pluginName: loadedPlugin.packageName ?? loadedPlugin.name,
			componentType: PLUGIN_COMPONENT_TYPE.SKILL,
			componentKey: component.componentKey,
			sourcePath: component.sourcePath ?? null,
			fileName: basename(realDocumentPath),
			content
		}
	}
}

function isResolvedPathWithin(rootDir: string, targetPath: string) {
	const relativePath = relative(rootDir, targetPath)
	return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}
