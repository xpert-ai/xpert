import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ConfigService } from '@xpert-ai/server-config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { upgradeBuiltinTemplateCatalog } from '../../template-catalog-upgrade'
import { templateDirectories, templateFiles } from '../../template.constants'
import {
    assertBuiltinTemplateLayout,
    assertBuiltinTemplateSource,
    assertExternalTemplateLayout,
    copyDirectoryContentsIfMissing,
    copyFileIfMissing
} from '../../utils/template-files'
import { getTemplateRoots } from '../../utils/template-paths'
import { EnsureTemplateDirectoryCommand } from '../ensure-template-directory.command'

@CommandHandler(EnsureTemplateDirectoryCommand)
export class EnsureTemplateDirectoryHandler implements ICommandHandler<EnsureTemplateDirectoryCommand> {
    readonly #logger = new Logger(EnsureTemplateDirectoryHandler.name)
    private ready?: Promise<string>
    private warnedUnsafeRoot = false

    constructor(private readonly configService: ConfigService) {}

    execute(): Promise<string> {
        if (!this.ready) {
            this.ready = this.initializeTemplateDirectory().catch((error) => {
                this.ready = undefined
                throw error
            })
        }
        return this.ready
    }

    private async initializeTemplateDirectory() {
        const { builtinRoot, externalRoot, configuredPath, unsafe } = getTemplateRoots(this.configService)
        if (unsafe && !this.warnedUnsafeRoot) {
            this.warnedUnsafeRoot = true
            this.#logger.warn(
                `Ignoring XPERT_TEMPLATE_DIR '${configuredPath}' because it points inside the built-in xpert template source. Using '${externalRoot}' instead.`
            )
        }

        await assertBuiltinTemplateSource(builtinRoot, externalRoot)
        await assertBuiltinTemplateLayout(builtinRoot, externalRoot)
        await fs.promises.mkdir(externalRoot, { recursive: true })

        for (const directoryName of templateDirectories) {
            await fs.promises.mkdir(path.join(externalRoot, directoryName), { recursive: true })
        }

        for (const fileName of templateFiles) {
            await copyFileIfMissing(path.join(builtinRoot, fileName), path.join(externalRoot, fileName), externalRoot)
        }

        for (const directoryName of templateDirectories) {
            await copyDirectoryContentsIfMissing(
                path.join(builtinRoot, directoryName),
                path.join(externalRoot, directoryName),
                externalRoot
            )
        }

        await assertExternalTemplateLayout(externalRoot)
        await upgradeBuiltinTemplateCatalog(builtinRoot, externalRoot)
        this.#logger.log(`Xpert templates ready at '${externalRoot}'`)

        return externalRoot
    }
}
