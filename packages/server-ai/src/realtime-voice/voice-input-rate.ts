// Capture owns the 20 ms clock. Allow delivery jitter without buffering or re-timing speech.
export class VoiceInputRate {
    private available = 100 // Two seconds of catch-up; sustained rate remains 50 PCM frames/second.
    private last: number

    constructor(private readonly now: () => number = () => performance.now()) {
        this.last = now()
    }

    accept() {
        const now = this.now()
        const elapsed = Math.max(0, now - this.last)
        this.last = now
        this.available = Math.min(100, this.available + elapsed / 20)
        if (this.available < 1 - 1e-6) return false
        this.available = Math.max(0, this.available - 1)
        return true
    }
}
