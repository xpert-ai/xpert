import { CACHE_MANAGER, Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Cache } from 'cache-manager'
import { ExternalCopy, Isolate } from 'isolated-vm'
import { I18nService } from 'nestjs-i18n'
import { SandboxVMCommand } from '../vm.command'

@CommandHandler(SandboxVMCommand)
export class SandboxVMHandler implements ICommandHandler<SandboxVMCommand> {
	readonly #logger = new Logger(SandboxVMHandler.name)

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: SandboxVMCommand) {
		const { code, parameters, language, userId } = command

		const isolate = new Isolate({ memoryLimit: 128 }) // 128MB 内存限制
		const contextified = await isolate.createContext()
		const jail = contextified.global

		// 绑定 console.log 到沙盒
		await jail.set(
			'console',
			{
				log: (...args: any[]) => console.log('[Sandbox]', ...args)
			},
			{ reference: true }
		)

		// 绑定用户变量到沙盒
		for (const [key, value] of Object.entries(parameters)) {
			await jail.set(key, new ExternalCopy(value).copyInto())
		}

		// 执行代码 (好像只能返回字符串)
		const wrappedCode = `JSON.stringify((() => { \n${code}\n })())`;

		const script = await isolate.compileScript(wrappedCode)
		const result = await script.run(contextified)

		return JSON.parse(result)
	}
}
