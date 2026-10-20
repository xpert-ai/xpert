// Invariants: exported diagnostics contain no container configuration or raw
// environment files. Redact before writing artifacts or printing command output.
const fs = require('node:fs')
const path = require('node:path')

function createRedactor(values, env = process.env) {
  const secrets = new Set()
  for (const [key, value] of Object.entries({ ...env, ...values })) {
    if (!/pass(word)?|secret|token|encryption|credential|api[_-]?key|authorization/i.test(key)) continue
    if (typeof value !== 'string' || value.length < 6) continue
    for (const variant of [value, encodeURIComponent(value), Buffer.from(value).toString('base64')]) {
      secrets.add(variant)
    }
  }
  const literals = [...secrets].sort((a, b) => b.length - a.length)
  return (input) => {
    let text = String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '')
    for (const secret of literals) text = text.split(secret).join('[REDACTED]')
    return (
      text
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
        .replace(
          /(["']?[\w.-]*(?:password|passwd|secret|token|credential|api[_-]?key|encryption[_-]?key|authorization|db_pass|redis_pass)[\w.-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)/gi,
          '$1[REDACTED]'
        )
        // Container output must not be able to issue GitHub workflow commands.
        .replace(/^(\s*)::/gm, '$1[container] ::')
    )
  }
}

function commandOutput(result) {
  return [
    result.stdout,
    result.stderr,
    result.error?.message,
    result.status !== 0 ? `Command exit status: ${result.status}; signal: ${result.signal || 'none'}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function collectDiagnostics({ directory, result, run, inspect, redact }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const save = (name, text) => {
    const safe =
      typeof text === 'string'
        ? redact(text)
        : JSON.stringify(text, (_key, value) => (typeof value === 'string' ? redact(value) : value), 2)
    fs.writeFileSync(path.join(directory, name), safe + '\n', { mode: 0o600 })
    return safe
  }
  const compose = save('compose.log', commandOutput(result))
  const containers = []
  for (const service of ['api', 'db', 'redis']) {
    save(`${service}.log`, commandOutput(run(['logs', '--no-color', '--tail', '250', service])))
    const ids = run(['ps', '--all', '--quiet', service])
    if (ids.error || ids.status !== 0) {
      containers.push({ service, diagnosticError: commandOutput(ids) })
      continue
    }
    const containerIds = (ids.stdout || '').trim().split(/\s+/).filter(Boolean)
    if (!containerIds.length) containers.push({ service, status: 'not-created' })
    for (const id of containerIds) {
      const inspected = inspect(id)
      try {
        if (inspected.error || inspected.status !== 0) throw new Error(commandOutput(inspected))
        const state = JSON.parse(inspected.stdout)
        containers.push({
          service,
          status: state.Status,
          running: state.Running,
          restarting: state.Restarting,
          oomKilled: state.OOMKilled,
          exitCode: state.ExitCode,
          error: state.Error,
          startedAt: state.StartedAt,
          finishedAt: state.FinishedAt,
          health: state.Health && {
            status: state.Health.Status,
            failingStreak: state.Health.FailingStreak,
            checks: (state.Health.Log || []).slice(-5).map((check) => ({
              start: check.Start,
              end: check.End,
              exitCode: check.ExitCode,
              output: check.Output
            }))
          }
        })
      } catch (error) {
        containers.push({ service, diagnosticError: error.message })
      }
    }
  }
  const state = save('containers.json', containers)
  console.error(`Sanitized Compose failure:\n${compose}`)
  console.error(`Sanitized container health:\n${state}`)
  console.error(`Sanitized service logs and health diagnostics: ${directory}`)
}

module.exports = { createRedactor, commandOutput, collectDiagnostics }
