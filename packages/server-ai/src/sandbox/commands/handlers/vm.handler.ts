import { CACHE_MANAGER, Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { spawn } from 'child_process'
import { ExternalCopy, Isolate } from 'isolated-vm'
import { I18nService } from 'nestjs-i18n'
import { Options, PythonShell } from 'python-shell'
import { SandboxVMCommand } from '../vm.command'

@CommandHandler(SandboxVMCommand)
export class SandboxVMHandler implements ICommandHandler<SandboxVMCommand> {
	readonly #logger = new Logger(SandboxVMHandler.name)

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: SandboxVMCommand) {
		const { code, parameters, language, userId } = command
		if (language === 'javascript') {
			return await this.runJavaScriptCode(parameters, code)
		} else if (language === 'python') {
			return await this.runPythonFunction(parameters, code)
		}

		throw new Error(`不支持的语言 ${language}`)
	}

	async runJavaScriptCode(parameters: any, code: string): Promise<any> {
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
		const wrappedCode = `JSON.stringify((() => { \n${code}\n })())`

		const script = await isolate.compileScript(wrappedCode)
		const result = await script.run(contextified)

		return JSON.parse(result)
	}

	async runPythonFunction(inputs: any, code: string): Promise<any> {
		// 将 input 对象的 key value 对转换成 Python 变量定义
		const inputVariables = Object.entries(inputs)
			.map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
			.join('\n')

		// 将变量定义拼接到 Python 代码前面
		const inputParams = Object.keys(inputs).map(key => `${key}: str`).join(', ')
		const wrappedCode = `import json
${inputVariables}
def main(${inputParams}):
${code.split('\n').map(line => `    ${line}`).join('\n')}
result = main(${Object.keys(inputs).join(', ')})
print(json.dumps(result))
`

		const result = await PythonShell.runString(wrappedCode, null)
		console.log(result)
		return JSON.parse(result[0])
	}

	async runPythonCode(input: any, pythonCode: string): Promise<any> {
		return new Promise((resolve, reject) => {
			// 将 input 对象的 key value 对转换成 Python 变量定义
			const inputVariables = Object.entries(input)
				.map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
				.join('\n')

			// 将变量定义拼接到 Python 代码前面
			const fullPythonCode = `${inputVariables}\n${pythonCode}`

			// 使用 -c 参数直接执行 Python 代码字符串
			const pythonProcess = spawn('python3', ['-c', fullPythonCode], {
				stdio: ['pipe', 'pipe', 'pipe'] // 配置 stdin, stdout, stderr
			})

			let output = ''
			let errorOutput = ''

			// 收集 Python 脚本的输出
			pythonProcess.stdout.on('data', (data) => {
				output += data.toString()
			})

			// 收集错误信息
			pythonProcess.stderr.on('data', (data) => {
				errorOutput += data.toString()
			})

			const timeout = setTimeout(() => {
				pythonProcess.kill()
				reject(new Error('Python execution timeout'))
			}, 5000) // 5秒超时

			// 脚本执行完成
			pythonProcess.on('close', (code) => {
				clearTimeout(timeout)
				if (code === 0) {
					try {
						resolve(JSON.parse(output)) // 假设返回 JSON 格式
					} catch (e) {
						resolve(output) // 如果不是 JSON，返回原始输出
					}
				} else {
					reject(new Error(errorOutput))
				}
			})
		})
	}
}
