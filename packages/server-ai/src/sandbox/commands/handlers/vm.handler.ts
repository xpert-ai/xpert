import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { spawn } from 'child_process'
import { ExternalCopy, Isolate, Reference } from 'isolated-vm'
import { I18nService } from 'nestjs-i18n'
import { PythonShell } from 'python-shell'
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
		const { code, parameters, language } = command
		if (language === 'javascript') {
			return await this.runJavaScriptCode(parameters, code)
		} else if (language === 'python') {
			return await this.runPythonFunction(parameters, code)
		}

		throw new Error(`Unsupported language ${language}`)
	}

	async runJavaScriptCode(parameters: any, code: string): Promise<any> {
		const isolate = new Isolate({ memoryLimit: 128 }) // 128MB 内存限制
		const contextified = await isolate.createContext()
		const jail = contextified.global


		// Bind user variables to sandbox
		for (const [key, value] of Object.entries(parameters)) {
			await jail.set(key, new ExternalCopy(value).copyInto())
		}

		// Execute code (seems to only return strings)
		const wrappedCode = `JSON.stringify((() => { \n${code}\n })())`

		const script = await isolate.compileScript(wrappedCode)
		const result = await script.run(contextified)

		return {
			result: JSON.parse(result),
		}
	}

	async runPythonFunction(inputs: any, code: string): Promise<any> {
		// Convert the key value pairs of the input object into Python variable definitions
		const inputVariables = Object.entries(inputs)
			.map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
			.join('\n')

		// Splice the variable definition before the Python code
		const inputParams = Object.keys(inputs).map(key => `${key}: str`).join(', ')
		const wrappedCode = `import json
${inputVariables}
def main(${inputParams}):
${code.split('\n').map(line => `    ${line}`).join('\n')}
result = main(${Object.keys(inputs).join(', ')})
print(json.dumps(result))
`

		const output = await PythonShell.runString(wrappedCode, null)
		const result = JSON.parse(output[output.length - 1]) // Get the output of the last line print(json.dumps(result))
		return {
			result,
			logs: output.slice(0, -1).join('\n') // All lines except the last one
		}
	}

	async runPythonCode(input: any, pythonCode: string): Promise<any> {
		return new Promise((resolve, reject) => {
			// Convert the key value pairs of the input object into Python variable definitions
			const inputVariables = Object.entries(input)
				.map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
				.join('\n')

			// Splice the variable definition before the Python code
			const fullPythonCode = `${inputVariables}\n${pythonCode}`

			// Use the -c parameter to directly execute a Python code string
			const pythonProcess = spawn('python3', ['-c', fullPythonCode], {
				stdio: ['pipe', 'pipe', 'pipe'] // Configure stdin, stdout, stderr
			})

			let output = ''
			let errorOutput = ''

			// Collect the output of the Python script
			pythonProcess.stdout.on('data', (data) => {
				output += data.toString()
			})

			// Collect error messages
			pythonProcess.stderr.on('data', (data) => {
				errorOutput += data.toString()
			})

			const timeout = setTimeout(() => {
				pythonProcess.kill()
				reject(new Error('Python execution timeout'))
			}, 5000) // 5 seconds timeout

			// Script execution completed
			pythonProcess.on('close', (code) => {
				clearTimeout(timeout)
				if (code === 0) {
					try {
						resolve(JSON.parse(output)) // Assume the return is in JSON format
					} catch (e) {
						resolve(output) // If not JSON, return original output
					}
				} else {
					reject(new Error(errorOutput))
				}
			})
		})
	}
}
