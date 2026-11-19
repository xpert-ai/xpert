import { execFileSync } from 'node:child_process'

const transient = (error) =>
  error.code === 'ETIMEDOUT' ||
  /timeout|timed out|connection reset|connection refused|TLS handshake|unexpected EOF|too many requests|(?:status|code)\D*(?:408|429|500|502|503|504)\b/i.test(
    String(error.stderr || error.message)
  )

export function runDocker(
  args,
  {
    exec = execFileSync,
    pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
    log = console.log
  } = {}
) {
  const push = args[0] === 'push'
  for (let attempt = 1; ; attempt++) {
    try {
      return (
        exec('docker', args, {
          encoding: 'utf8',
          stdio: ['ignore', push ? 'inherit' : 'pipe', 'pipe'],
          timeout: 15 * 60_000
        }) ?? ''
      )
    } catch (error) {
      if (!push || attempt === 3 || !transient(error)) throw error
      log(`Retrying ${args[1]} after transient push failure (attempt ${attempt}/3)`)
      pause(attempt * 10_000)
    }
  }
}
