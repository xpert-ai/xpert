import { PythonShell } from "python-shell"

export async function runPythonFunction(inputs: any, code: string): Promise<any> {
	const safeInputs = inputs ?? {}
	const serializedInputs = JSON.stringify(safeInputs)

	// Deserialize inputs in Python so JSON values map to correct Python primitives
	const inputVariables = [
		`inputs = json.loads(${JSON.stringify(serializedInputs)})`,
		...Object.keys(safeInputs).map(key => `${key} = inputs.get(${JSON.stringify(key)})`)
	].join('\n')

	const inputParams = Object.keys(safeInputs).join(', ')
	const wrappedCode = `import json
${inputVariables}
def main(${inputParams}):
${code.split('\n').map(line => `    ${line}`).join('\n')}
result = main(${Object.keys(safeInputs).join(', ')})
print(json.dumps(result))
`

	const output = await PythonShell.runString(wrappedCode, null)
	const result = JSON.parse(output[output.length - 1]) // Get the output of the last line print(json.dumps(result))
	return {
		result,
		logs: output.slice(0, -1).join('\n') // All lines except the last one
	}
}
