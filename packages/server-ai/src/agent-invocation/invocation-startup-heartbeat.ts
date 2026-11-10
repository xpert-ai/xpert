// Startup liveness is renewable only while its owner is executing, for at most ten minutes.
// A lost lease or failed persistence stops renewal; it never proves a process has terminated.
const MAX_STARTUP_MS = 10 * 60_000
const HEARTBEAT_MS = 30_000

export function invocationStartupHeartbeat(renew: (leaseMs: number) => Promise<boolean>, leaseMs: number) {
    const deadline = Date.now() + MAX_STARTUP_MS
    let stopped = false
    let pending: Promise<void> | undefined
    const active = () => !stopped && Date.now() < deadline
    const timer = setInterval(() => {
        if (pending) return
        if (!active()) {
            stopped = true
            clearInterval(timer)
            return
        }
        pending = renew(Math.min(leaseMs, deadline - Date.now()))
            .then((owned) => { if (!owned) stopped = true })
            .catch(() => { stopped = true })
            .finally(() => {
                pending = undefined
                if (stopped) clearInterval(timer)
            })
    }, Math.min(HEARTBEAT_MS, Math.max(1, Math.floor(leaseMs / 3))))
    timer.unref?.()
    return {
        active,
        async stop() {
            stopped = true
            clearInterval(timer)
            await pending
        }
    }
}
