import { AsyncCaller } from '@langchain/core/utils/async_caller'
import { OnModuleDestroy } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxVMCommand } from '../vm.command'
import { runJavaScriptCode } from './javascript-runner'
import { runPythonFunction } from './python'

@CommandHandler(SandboxVMCommand)
export class SandboxVMHandler implements ICommandHandler<SandboxVMCommand>, OnModuleDestroy {
    private readonly workers = new AsyncCaller({ maxConcurrency: 4, maxRetries: 0 })
    private readonly shutdown = new AbortController()

    onModuleDestroy() {
        this.shutdown.abort(new Error('JavaScript sandbox is shutting down'))
    }

    async execute({ code, parameters, language, signal }: SandboxVMCommand) {
        if (language === 'javascript') {
            const stop = signal ? AbortSignal.any([signal, this.shutdown.signal]) : this.shutdown.signal
            return this.workers.call(runJavaScriptCode, parameters, code, stop)
        }
        if (language === 'python') {
            return runPythonFunction(parameters, code)
        }
        throw new Error(`Unsupported language ${language}`)
    }
}
