import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { DefaultSerializer } from 'node:v8'

// v8.serialize packs typed arrays into its wire buffer. Keep their original
// backing stores and offsets, and copy only visible bytes out of Node Buffer pools.
class InputSerializer extends DefaultSerializer {
    _writeHostObject(view: NodeJS.ArrayBufferView) {
        const input = Buffer.isBuffer(view) ? Uint8Array.from(view) : view
        this.writeValue(Object.prototype.toString.call(input).slice(8, -1))
        this.writeUint32(input.byteOffset)
        this.writeUint32(input.byteLength)
        this.writeValue(input.buffer)
    }
}

// The webpack API and the compiled server library both ship the worker next to
// this module. Use the running Node executable and keep API secrets out of its env.
export async function runJavaScriptCode(parameters: Record<string, unknown>, code: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const serializer = new InputSerializer()
    serializer.writeHeader()
    serializer.writeValue({ parameters, code })
    const payload = serializer.releaseBuffer()
    const output = await new Promise<string>((resolve, reject) => {
        const child = execFile(
            process.execPath,
            ['--max-old-space-size=128', join(__dirname, 'quickjs-worker.js')],
            {
                env: {},
                signal,
                killSignal: 'SIGKILL',
                timeout: 10000,
                maxBuffer: 128 * 1024 * 1024,
                encoding: 'utf8'
            },
            (error, stdout, stderr) => {
                if (signal.aborted) return reject(signal.reason)
                if (error?.killed) return reject(new Error('JavaScript execution timed out'))
                if (error) return reject(new Error(stderr.trim() || error.message))
                resolve(stdout)
            }
        )
        // If the worker dies during input, its exit diagnostic takes precedence.
        child.stdin.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code !== 'EPIPE') {
                child.kill('SIGKILL')
                reject(error)
            }
        })
        child.stdin.end(payload)
    })
    return { result: JSON.parse(output) }
}
