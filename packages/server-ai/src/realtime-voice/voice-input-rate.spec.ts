import { VoiceInputRate } from './voice-input-rate'

describe('microphone frame admission', () => {
    it('accepts thirty minutes of realtime capture delivered with uneven scheduling', () => {
        let now = 0
        const rate = new VoiceInputRate(() => now)
        let accepted = 0
        // Frames keep their capture order but arrive in batches after event-loop/network delays.
        const batches = [1, 3, 1, 20, 5, 50, 2, 8, 10]
        for (let i = 0; i < 900; i++)
            for (const frames of batches) {
                now += frames * 20
                for (let j = 0; j < frames; j++) {
                    expect(rate.accept()).toBe(true)
                    accepted++
                }
            }
        expect(accepted).toBe(90000)
        expect(now).toBe(30 * 60 * 1000)
    })

    it('caps burst credit, rejects sustained excess and recovers with elapsed time', () => {
        let now = 0
        const rate = new VoiceInputRate(() => now)
        now = 60 * 1000 // Silence does not grant unlimited upload credit.
        for (let i = 0; i < 100; i++) expect(rate.accept()).toBe(true)
        expect(rate.accept()).toBe(false)
        now += 19
        expect(rate.accept()).toBe(false)
        now += 1
        expect(rate.accept()).toBe(true)
        expect(rate.accept()).toBe(false)
    })
})
