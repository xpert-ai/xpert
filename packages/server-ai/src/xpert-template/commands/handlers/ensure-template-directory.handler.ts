import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ConfigService } from '@xpert-ai/server-config'
import { t } from 'i18next'
import * as fs from 'node:fs'
import { syncBuiltinTemplates } from '../../sync/builtin-template-sync'
import {
    assertBuiltinTemplateLayout,
    assertBuiltinTemplateSource,
    assertExternalTemplateLayout
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

        const result = await syncBuiltinTemplates(builtinRoot, externalRoot)
        this.#logger.log(
            t('server-ai:TemplateSync.Summary', {
                added: result.added.length,
                updated: result.updated.length,
                adopted: result.adopted.length,
                preserved: result.preserved.length,
                conflicted: result.conflicted.length
            })
        )
        for (const [status, files] of Object.entries(result)) {
            for (const file of files) {
                if (status === 'conflicted') this.#logger.warn(t('server-ai:TemplateSync.Conflict', { file }))
                else this.#logger.debug(t('server-ai:TemplateSync.Asset', { file, status }))
            }
        }

        await assertExternalTemplateLayout(externalRoot)
        this.#logger.log(`Xpert templates ready at '${externalRoot}'`)

        return externalRoot
    }
}
