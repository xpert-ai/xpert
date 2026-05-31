import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileAsset } from '../../entities'
import { EnqueueFileParseCommand } from '../enqueue-file-parse.command'
import { ParseFileAssetCommand } from '../parse-file-asset.command'

@CommandHandler(EnqueueFileParseCommand)
export class EnqueueFileParseHandler implements ICommandHandler<EnqueueFileParseCommand> {
    readonly #logger = new Logger(EnqueueFileParseHandler.name)

    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        private readonly commandBus: CommandBus
    ) {}

    async execute(command: EnqueueFileParseCommand) {
        const queued = await this.fileAssetRepository.findOneByOrFail({ id: command.fileAssetId })
        queued.status = queued.parseMode === 'none' ? 'ready' : 'parsing'
        queued.error = null
        await this.fileAssetRepository.save(queued)
        if (queued.parseMode === 'none') {
            return queued
        }

        if (command.options?.runInline) {
            return await this.commandBus.execute(new ParseFileAssetCommand(command.fileAssetId))
        }

        setImmediate(() => {
            this.commandBus.execute(new ParseFileAssetCommand(command.fileAssetId)).catch((error) => {
                this.#logger.warn(
                    `Background parse failed for ${command.fileAssetId}: ${error instanceof Error ? error.message : error}`
                )
            })
        })
        return queued
    }
}
