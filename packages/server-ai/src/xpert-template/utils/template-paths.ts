import { ConfigService } from '@xpert-ai/server-config'
import * as path from 'node:path'
import { builtinTemplatePath, templateDirectoryName } from '../template.constants'

export function getBuiltinTemplateRoot(config: ConfigService) {
    return path.join(config.assetOptions.serverRoot, builtinTemplatePath)
}

export function getTemplateRoots(config: ConfigService) {
    const builtinRoot = getBuiltinTemplateRoot(config)
    const configuredPath = config.environment.env?.XPERT_TEMPLATE_DIR?.trim()
    const defaultRoot = path.join(config.assetOptions.dataPath, templateDirectoryName)
    const resolvedPath = configuredPath ? path.resolve(config.assetOptions.serverRoot, configuredPath) : defaultRoot
    const relativePath = path.relative(path.resolve(builtinRoot), resolvedPath)
    const unsafe =
        !!configuredPath && (!relativePath || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)))
    return { builtinRoot, externalRoot: unsafe ? defaultRoot : resolvedPath, configuredPath, unsafe }
}
