// This one-shot process owns the WASM heap. Only the submitted script and copied
// values enter QuickJS. Node modules, environment, and host callbacks stay outside.
const { DefaultDeserializer } = require('node:v8')
const { getQuickJS } = require('quickjs-emscripten')
const { serialize } = require('seroval')

const viewTypes = new Map(
    [
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        BigInt64Array,
        BigUint64Array,
        DataView
    ].map((type) => [type.name, type])
)
if (typeof Float16Array !== 'undefined') viewTypes.set('Float16Array', Float16Array)

class InputDeserializer extends DefaultDeserializer {
    _readHostObject() {
        const type = viewTypes.get(this.readValue())
        if (!type) throw new Error('Unsupported JavaScript input view')
        const offset = this.readUint32()
        const length = this.readUint32()
        const buffer = this.readValue()
        return new type(buffer, offset, length / (type.BYTES_PER_ELEMENT || 1))
    }
}

// seroval's ArrayBuffer representation uses the web atob API. Supply it only
// while restoring inputs; it is not installed as a sandbox global.
function decodeBase64(base64) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let bits = 0
    let count = 0
    let decoded = ''
    for (const char of base64) {
        if (char === '=') break
        bits = (bits << 6) | alphabet.indexOf(char)
        count += 6
        if (count >= 8) {
            count -= 8
            decoded += String.fromCharCode((bits >>> count) & 255)
        }
    }
    return decoded
}

async function execute({ code, parameters }) {
    const QuickJS = await getQuickJS()
    const runtime = QuickJS.newRuntime()
    try {
        runtime.setMemoryLimit(128 * 1024 * 1024)
        runtime.setMaxStackSize(1024 * 1024)
        const deadline = performance.now() + 5000
        runtime.setInterruptHandler(() => performance.now() >= deadline)
        const context = runtime.newContext()
        try {
            function evaluate(source) {
                const evaluation = context.evalCode(source, 'workflow-code.js', { type: 'global' })
                if (evaluation.error) {
                    try {
                        if (performance.now() >= deadline) throw new Error('JavaScript execution timed out')
                        const thrown = context.dump(evaluation.error)
                        throw new Error(typeof thrown?.message === 'string' ? thrown.message : String(thrown))
                    } finally {
                        evaluation.error.dispose()
                    }
                }
                return evaluation.value
            }

            // Each parameter had its own structured copy in the original VM.
            // Materialize all values before a user-named global can shadow a builtin.
            const entries = Object.entries(parameters ?? {})
            const copies = entries.map(([, value]) => serialize(value)).join(',')
            const values = evaluate(`((atob) => [${copies}])(${decodeBase64})`)
            try {
                entries.forEach(([key], index) => {
                    const value = context.getProp(values, index)
                    try {
                        context.setProp(context.global, key, value)
                    } finally {
                        value.dispose()
                    }
                })
            } finally {
                values.dispose()
            }
            const result = evaluate(`JSON.stringify((() => {\n${code}\n})())`)
            try {
                return context.getString(result)
            } finally {
                result.dispose()
            }
        } finally {
            context.dispose()
        }
    } finally {
        runtime.dispose()
    }
}

async function main() {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const input = new InputDeserializer(Buffer.concat(chunks))
    input.readHeader()
    const result = await execute(input.readValue())
    process.stdout.write(result)
}

main().catch((error) => {
    process.stderr.write(error.message || String(error))
    process.exitCode = 1
})
