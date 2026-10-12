import Foundation
import AVFoundation
import CoreAudio
import CoreMedia

@main
struct CaptureTests {
    static func main() async {
        do {
            switch CommandLine.arguments.dropFirst().first {
            case "--self-test": try testSampleConversion()
            case "--self-test-system-input": try testSystemInput()
            case "--self-test-input-queue": try testInputQueue()
            case "--self-test-permissions": try testPermissionErrors()
            case "--self-test-pending-start": await testBlockedStartup(timeout: 60)
            case "--self-test-start-deadline": await testBlockedStartup(timeout: 0.05)
            default: exit(1)
            }
        } catch {
            let cause = error as NSError
            emit(["type": "error", "code": "self_test_failed", "stage": cause.domain, "status": cause.code])
            exit(1)
        }
    }
}

// Model a synchronous OS start call occupying the serial device queue. Stop
// cannot release it early, and its late completion must not start recording.
func testBlockedStartup(timeout: Double) async {
    let devices = DispatchQueue(label: "test.devices")
    let blocked = DispatchSemaphore(value: 0)
    await runCapture(start: {
        try await captureOperation(timeout: timeout) { completion in
            devices.async {
                emit(["type": "test_start_pending"])
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.2) { blocked.signal() }
                blocked.wait()
                emit(["type": "test_device_released"])
                completion(nil)
            }
        }
        try Task.checkCancellation()
        emit(["type": "started"])
    }, stop: {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            devices.async {
                emit(["type": "stopped"])
                continuation.resume()
            }
        }
    })
}

func testPermissionErrors() throws {
    for (status, expected) in [
        (kAudioDevicePermissionsError, "system_audio_permission_denied"),
        (kAudioHardwareBadDeviceError, "audio_source_missing")
    ] {
        do {
            try checkAudioStatus(status)
            throw NSError(domain: "test_missing_status_error", code: 1)
        } catch {
            guard captureErrorCode(error) == expected, (error as NSError).code == Int(status) else {
                throw NSError(domain: "test_coreaudio_error_mapping", code: Int(status))
            }
        }
    }
    try checkAudioStatus(noErr)
    emit(["type": "self_test", "passed": true])
}

// Synthetic CMSampleBuffers exercise the same conversion path as live capture.
func testSampleConversion() throws {
    if #available(macOS 15.0, *) {
        guard captureErrorCode(NSError(domain: "microphone_permission_denied", code: 1)) == "audio_permission_denied",
              captureErrorCode(NSError(domain: "conversion", code: 1)) == "audio_source_missing" else {
            throw NSError(domain: "test_permission_errors", code: 1)
        }
    }
    for (name, rate, channels) in [("microphone", 48000.0, 2), ("system", 24000.0, 1)] {
        let track = Track(name)
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: AVAudioChannelCount(channels), interleaved: false)!
        let frames = AVAudioFrameCount(rate / 20)
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        pcm.frameLength = frames
        for channel in 0..<channels {
            for frame in 0..<Int(frames) { pcm.floatChannelData![channel][frame] = Float(sin(Double(frame) * 2 * .pi * 440 / rate)) * 0.2 }
        }
        for index in 0..<100 {
            var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: Int32(rate)), presentationTimeStamp: CMTime(value: Int64(index * Int(frames)), timescale: Int32(rate)), decodeTimeStamp: .invalid)
            var sample: CMSampleBuffer?
            let created = CMSampleBufferCreate(allocator: kCFAllocatorDefault, dataBuffer: nil, dataReady: false, makeDataReadyCallback: nil, refcon: nil, formatDescription: format.formatDescription, sampleCount: Int(frames), sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleSizeEntryCount: 0, sampleSizeArray: nil, sampleBufferOut: &sample)
            guard created == noErr, let sample else { throw NSError(domain: "test_sample", code: Int(created)) }
            let copied = CMSampleBufferSetDataBufferFromAudioBufferList(sample, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, bufferList: pcm.audioBufferList)
            guard copied == noErr else { throw NSError(domain: "test_copy", code: Int(copied)) }
            CMSampleBufferSetDataReady(sample)
            try track.consume(sample, epoch: 0)
        }
        track.flush()
        guard track.samples > 118000 && track.samples <= 120000 else { throw NSError(domain: "test_frames", code: track.samples) }
    }
    emit(["type": "self_test", "passed": true])
}

// Exercise borrowed CoreAudio input buffers, not only CMSampleBuffers. Mutation
// after copying must not change queued audio; idle buffers must remain silent.
func testSystemInput() throws {
    for (name, rate, clockRate, interleaved, silent) in [
        ("stereo48", 48000.0, 48000.0, true, false),
        ("stereo44", 44100.0, 44100.0, false, false),
        ("negotiated44", 48000.0, 44100.0, true, false),
        ("silent", 48000.0, 48000.0, true, true)
    ] {
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 2, interleaved: interleaved)!
        let runningFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: clockRate, channels: 2, interleaved: interleaved)!
        let frames = AVAudioFrameCount(clockRate / 20)
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        pcm.frameLength = frames
        let source = UnsafeMutableAudioBufferListPointer(pcm.mutableAudioBufferList)
        for buffer in source {
            let pointer = buffer.mData!.assumingMemoryBound(to: Float.self)
            for index in 0..<Int(buffer.mDataByteSize / 4) {
                let frame = interleaved ? index / 2 : index
                pointer[index] = silent ? 0 : Float(sin(Double(frame) * 2 * .pi * 440 / clockRate)) * 0.2
            }
        }
        let copied = try copyAudioInput(pcm.audioBufferList, format: runningFormat)
        for buffer in source { memset(buffer.mData!, 0x7f, Int(buffer.mDataByteSize)) }
        let track = Track(name)
        for index in 0..<100 {
            try track.consume(copied, timestamp: Double(index) / 20, epoch: 0)
        }
        track.flush()
        guard track.samples > 118000 && track.samples <= 120000 else { throw NSError(domain: "test_system_frames", code: track.samples) }
    }
    emit(["type": "self_test", "passed": true])
}

// Mutated only on the test's sample queue; inspected after queue.sync drains it.
final class InputTestResults: @unchecked Sendable {
    var rates: [Double] = []
    var errors: [String] = []
    let track = Track("ratechange")
}

func testInputQueue() throws {
    let queue = DispatchQueue(label: "test.samples")
    let results = InputTestResults()
    let input = SystemAudioInput(queue: queue, receive: { buffer, timestamp in
        results.rates.append(buffer.format.sampleRate)
        do { try results.track.consume(buffer, timestamp: timestamp, epoch: 0) }
        catch { results.errors.append("conversion") }
    }, onError: { results.errors.append($0) })
    queue.suspend()
    for (phase, rate) in [48000.0, 44100.0].enumerated() {
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 2, interleaved: true)!
        let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rate / 20))!
        pcm.frameLength = pcm.frameCapacity
        let samples = pcm.floatChannelData![0]
        for i in 0..<Int(pcm.frameLength) * 2 { samples[i] = Float(sin(Double(i / 2) * 2 * .pi * 440 / rate)) * 0.2 }
        if phase == 0 { input.enqueue(pcm.audioBufferList, timestamp: 0) } // No settled format yet.
        input.setFormat(format)
        for i in 0..<50 { input.enqueue(pcm.audioBufferList, timestamp: Double(phase * 50 + i) / 20) }
        memset(samples, 0x7f, Int(pcm.frameLength) * 2 * MemoryLayout<Float>.size)
    }
    input.close() // Admitted buffers still drain, with their original rates.
    queue.resume()
    queue.sync { results.track.flush() }
    guard results.errors.isEmpty,
          results.rates == Array(repeating: 48000.0, count: 50) + Array(repeating: 44100.0, count: 50),
          results.track.samples > 118000 && results.track.samples <= 120000 else {
        throw NSError(domain: "test_queued_format_change", code: 1)
    }

    let overflow = InputTestResults()
    let bounded = SystemAudioInput(queue: queue, limit: 2, receive: { buffer, _ in
        overflow.rates.append(buffer.format.sampleRate)
    }, onError: { overflow.errors.append($0) })
    let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: true)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2400)!
    pcm.frameLength = pcm.frameCapacity
    memset(pcm.floatChannelData![0], 0, 2400 * 2 * MemoryLayout<Float>.size)
    bounded.setFormat(format)
    queue.suspend()
    for _ in 0..<10000 { bounded.enqueue(pcm.audioBufferList, timestamp: 0) }
    queue.resume()
    queue.sync {}
    bounded.setFormat(format) // A rate update must not reopen failed admission.
    bounded.enqueue(pcm.audioBufferList, timestamp: 0)
    queue.sync {}
    guard overflow.rates.count == 2, overflow.errors == ["audio_conversion_failed"] else {
        throw NSError(domain: "test_bounded_input_failure", code: overflow.errors.count)
    }
    emit(["type": "self_test", "passed": true])
}
