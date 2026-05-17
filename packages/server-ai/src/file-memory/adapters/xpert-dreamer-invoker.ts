import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import { lastValueFrom, Observable, reduce, timeout } from 'rxjs'
import { Repository } from 'typeorm'
import { XpertAgentChatCommand } from '../../xpert-agent/commands'
import { Xpert } from '../../xpert/xpert.entity'
import { FileMemoryDreamerInvoker, FileMemoryDreamerRunInput } from '../ports'

const DEFAULT_DREAMER_TIMEOUT_MS = 10 * 60 * 1000

@Injectable()
export class XpertDreamerInvoker implements FileMemoryDreamerInvoker {
    constructor(
        private readonly commandBus: CommandBus,
        @InjectRepository(Xpert)
        private readonly xpertRepository: Repository<Xpert>
    ) {}

    async run(input: FileMemoryDreamerRunInput) {
        const { dreamerXpertId, dreamerAgentKey } = input.dreamerConfig
        const dreamerXpert = await this.xpertRepository.findOne({
            where: {
                id: dreamerXpertId,
                tenantId: input.tenantId
            },
            relations: ['agent']
        })
        if (!dreamerXpert) {
            throw new Error(`FileMemory Dreamer Xpert '${dreamerXpertId}' was not found in tenant '${input.tenantId}'.`)
        }

        const observable = await this.commandBus.execute(
            new XpertAgentChatCommand(
                {
                    [STATE_VARIABLE_HUMAN]: {
                        input: buildDreamerInput(input, dreamerAgentKey)
                    }
                },
                dreamerAgentKey,
                dreamerXpert,
                {
                    isDraft: false,
                    from: 'job',
                    store: null
                }
            )
        )

        if (!isObservable(observable)) {
            return
        }

        await lastValueFrom(
            (observable as Observable<MessageEvent>).pipe(
                timeout({ first: DEFAULT_DREAMER_TIMEOUT_MS, each: DEFAULT_DREAMER_TIMEOUT_MS }),
                reduce((_, value) => value, undefined as MessageEvent | undefined)
            )
        )
    }
}

function buildDreamerInput(input: FileMemoryDreamerRunInput, dreamerAgentKey: string) {
    return [
        `Run FileMemory Dream for target Xpert ${input.targetXpertId}.`,
        ``,
        `Use Dreamer agent key: ${dreamerAgentKey}.`,
        `Run ID: ${input.runId}`,
        `Memory root: ${input.memoryRoot}`,
        `Run root: ${input.runRoot}`,
        `Evidence path: ${input.evidencePath}`,
        `Instructions path: ${input.instructionsPath}`,
        ``,
        `Read instructions.md first. Then write output/preflight-report.md, edit only allowed memory files, and write output/dream-report.json.`
    ].join('\n')
}

function isObservable(value: unknown): value is Observable<unknown> {
    return Boolean(
        value && typeof value === 'object' && typeof (value as { subscribe?: unknown }).subscribe === 'function'
    )
}
