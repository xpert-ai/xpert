#!/usr/bin/env node

const { spawn } = require('node:child_process')

const SPEC_ENV = 'XPERT_MCP_STDIO_RUNNER_SPEC'
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_MAX_LIFETIME_MS = 2 * 60 * 60_000

function log(message) {
    process.stderr.write(`[xpert-mcp-stdio-runner] ${message}\n`)
}

function parseSpec() {
    const encoded = process.env[SPEC_ENV]
    if (!encoded) {
        throw new Error(`${SPEC_ENV} is required`)
    }
    const spec = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    if (!spec || typeof spec.command !== 'string' || !spec.command.trim()) {
        throw new Error('runner spec.command is required')
    }
    return {
        runtimeId: typeof spec.runtimeId === 'string' ? spec.runtimeId : '',
        command: spec.command,
        args: Array.isArray(spec.args) ? spec.args.filter((item) => typeof item === 'string') : [],
        env: spec.env && typeof spec.env === 'object' && !Array.isArray(spec.env) ? spec.env : {},
        cwd: typeof spec.cwd === 'string' && spec.cwd ? spec.cwd : process.cwd(),
        startupTimeoutMs:
            Number.isFinite(spec.startupTimeoutMs) && spec.startupTimeoutMs > 0
                ? spec.startupTimeoutMs
                : DEFAULT_STARTUP_TIMEOUT_MS,
        maxLifetimeMs:
            Number.isFinite(spec.maxLifetimeMs) && spec.maxLifetimeMs > 0 ? spec.maxLifetimeMs : DEFAULT_MAX_LIFETIME_MS
    }
}

function killChild(child, signal) {
    if (!child?.pid) {
        return
    }
    try {
        if (process.platform === 'win32') {
            child.kill(signal)
        } else {
            process.kill(-child.pid, signal)
        }
    } catch {
        try {
            child.kill(signal)
        } catch {
            // Child may already be gone.
        }
    }
}

function main() {
    let spec
    try {
        spec = parseSpec()
    } catch (error) {
        log(`invalid spec: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(64)
    }

    let child
    let settled = false
    let terminating = false
    let startupTimer
    let forceKillTimer
    let maxLifetimeTimer

    const terminate = (reason, signal = 'SIGTERM') => {
        if (terminating) {
            return
        }
        terminating = true
        log(`terminating runtime=${spec.runtimeId} reason=${reason}`)
        killChild(child, signal)
        forceKillTimer = setTimeout(() => killChild(child, 'SIGKILL'), 3_000)
        forceKillTimer.unref?.()
    }

    try {
        child = spawn(spec.command, spec.args, {
            cwd: spec.cwd,
            env: spec.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
            shell: false,
            windowsHide: true
        })
    } catch (error) {
        log(`spawn failed runtime=${spec.runtimeId}: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(127)
    }

    startupTimer = setTimeout(() => {
        if (!settled) {
            terminate('startup-timeout')
        }
    }, spec.startupTimeoutMs)
    startupTimer.unref?.()

    maxLifetimeTimer = setTimeout(() => terminate('max-lifetime-timeout'), spec.maxLifetimeMs)
    maxLifetimeTimer.unref?.()

    child.once('spawn', () => {
        settled = true
        clearTimeout(startupTimer)
        log(`child pid=${child.pid} runtime=${spec.runtimeId}`)
    })

    child.once('error', (error) => {
        settled = true
        clearTimeout(startupTimer)
        log(`child error runtime=${spec.runtimeId}: ${error.message}`)
        process.exit(127)
    })

    child.once('close', (code, signal) => {
        clearTimeout(startupTimer)
        clearTimeout(maxLifetimeTimer)
        if (forceKillTimer) {
            clearTimeout(forceKillTimer)
        }
        const exitCode = typeof code === 'number' ? code : signal ? 1 : 0
        log(`child closed runtime=${spec.runtimeId} code=${code ?? ''} signal=${signal ?? ''}`)
        process.exit(exitCode)
    })

    process.stdin.pipe(child.stdin)
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)

    process.stdin.on('close', () => terminate('stdin-close'))
    process.stdin.on('end', () => terminate('stdin-end'))
    process.once('disconnect', () => terminate('parent-disconnect'))
    process.once('SIGINT', () => terminate('sigint', 'SIGINT'))
    process.once('SIGTERM', () => terminate('sigterm', 'SIGTERM'))
}

main()
