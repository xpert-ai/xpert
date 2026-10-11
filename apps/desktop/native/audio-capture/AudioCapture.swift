// Audio-only sources: no screen capture stream is created.
import Foundation
import AVFoundation
import CoreMedia
import OSLog

let captureLog = Logger(subsystem: "ai.xpert.desktop.audio", category: "capture")
private let systemAudioStartupTimeout: Double = 20

private let outputLock = NSLock()
func emit(_ event: [String: Any]) {
    guard let bytes = try? JSONSerialization.data(withJSONObject: event) else { return }
    outputLock.lock(); defer { outputLock.unlock() }
    FileHandle.standardOutput.write(bytes); FileHandle.standardOutput.write(Data([10]))
}

// Complete once, including late device callbacks after a deadline.
final class CaptureCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Error>?
    init(_ continuation: CheckedContinuation<Void, Error>) { self.continuation = continuation }
    func finish(_ error: Error?) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        if let error { pending?.resume(throwing: error) }
        else { pending?.resume() }
    }
}

func captureOperation(timeout: Double, operation: (@escaping @Sendable (Error?) -> Void) -> Void) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        let completion = CaptureCompletion(continuation)
        let deadline = DispatchWorkItem { completion.finish(NSError(domain: "audio_start_timeout", code: 1)) }
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: deadline)
        operation { error in
            deadline.cancel()
            completion.finish(error)
        }
    }
}

// Listen before startup so EOF/stop can cancel it. A blocked device call still
// needs the parent's shutdown deadline; task cancellation cannot interrupt it.
func runCapture(start: @escaping @Sendable () async throws -> Void, stop: @escaping @Sendable () async -> Void) async {
    let (events, continuation) = AsyncStream<Void>.makeStream()
    DispatchQueue.global().async {
        _ = readLine()
        continuation.yield()
    }
    let startup = Task {
        do { try await start() }
        catch is CancellationError { }
        catch {
            let cause = error as NSError
            captureLog.error("Capture failed: \(cause.domain, privacy: .public) status=\(cause.code)")
            if #available(macOS 15.0, *) { emit(["type": "error", "code": captureErrorCode(error)]) }
            continuation.yield()
        }
    }
    for await _ in events { break }
    continuation.finish()
    startup.cancel()
    await stop()
}

final class Track {
    let name: String
    var pending = Data()
    var sequence = 0
    var samples = 0
    var originMs: Double?
    var converter: AVAudioConverter?
    var lastLevel = 0.0
    let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
    init(_ name: String) { self.name = name }
    func consume(_ sample: CMSampleBuffer, epoch: Double) throws {
        guard CMSampleBufferDataIsReady(sample), let description = CMSampleBufferGetFormatDescription(sample), let format = AVAudioFormat(cmAudioFormatDescription: description) as AVAudioFormat? else { return }
        let flags = UInt32(kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment)
        var size = 0
        let sizing = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sample, bufferListSizeNeededOut: &size, bufferListOut: nil, bufferListSize: 0, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: flags, blockBufferOut: nil)
        guard sizing == noErr, size >= MemoryLayout<AudioBufferList>.size else { throw NSError(domain: "audio_buffer_size", code: Int(sizing)) }
        let storage = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 16)
        defer { storage.deallocate() }
        storage.initializeMemory(as: UInt8.self, repeating: 0, count: size)
        let list = storage.bindMemory(to: AudioBufferList.self, capacity: 1)
        var block: CMBlockBuffer?
        // The no-copy PCM buffer borrows this memory until conversion finishes.
        defer { withExtendedLifetime(block) {} }
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sample, bufferListSizeNeededOut: nil, bufferListOut: list, bufferListSize: size, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: flags, blockBufferOut: &block)
        guard status == noErr, let input = AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: list) else { throw NSError(domain: "audio_buffer_read", code: Int(status)) }
        input.frameLength = AVAudioFrameCount(CMSampleBufferGetNumSamples(sample))
        try consume(input, timestamp: CMSampleBufferGetPresentationTimeStamp(sample).seconds, epoch: epoch)
    }
    func consume(_ input: AVAudioPCMBuffer, timestamp: Double, epoch: Double) throws {
        let format = input.format
        if converter == nil || converter?.inputFormat != format { converter = AVAudioConverter(from: format, to: target) }
        guard let converter, let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(Double(input.frameLength) * 24000 / format.sampleRate) + 64) else { throw NSError(domain: "audio_converter", code: 1) }
        var used = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, state in
            if used { state.pointee = .noDataNow; return nil }
            used = true; state.pointee = .haveData; return input
        }
        if let error { throw error }
        if originMs == nil { originMs = max(0, (timestamp - epoch) * 1000) }
        let bytes = output.audioBufferList.pointee.mBuffers
        guard let pointer = bytes.mData, bytes.mDataByteSize > 0 else { return }
        let data = Data(bytes: pointer, count: Int(bytes.mDataByteSize))
        var sum = 0.0
        data.withUnsafeBytes { raw in
            for value in raw.bindMemory(to: Int16.self) { let level = Double(value) / 32768; sum += level * level }
        }
        let now = ProcessInfo.processInfo.systemUptime
        if now - lastLevel >= 0.2 {
            emit(["type": "level", "track": name, "level": min(1, sqrt(sum / max(1, Double(data.count / 2))) * 4)])
            lastLevel = now
        }
        pending.append(data)
        while pending.count >= 240000 { flush(count: 240000) }
    }
    func flush(count: Int? = nil) {
        let length = count ?? pending.count
        guard length > 0 else { return }
        let pcm = pending.prefix(length)
        var wav = Data()
        func text(_ value: String) { wav.append(value.data(using: .ascii)!) }
        func u16(_ value: UInt16) { var v = value.littleEndian; withUnsafeBytes(of: &v) { wav.append(contentsOf: $0) } }
        func u32(_ value: UInt32) { var v = value.littleEndian; withUnsafeBytes(of: &v) { wav.append(contentsOf: $0) } }
        text("RIFF"); u32(UInt32(length + 36)); text("WAVEfmt "); u32(16); u16(1); u16(1); u32(24000); u32(48000); u16(2); u16(16); text("data"); u32(UInt32(length)); wav.append(pcm)
        let startMs = (originMs ?? 0) + Double(samples) / 24
        samples += length / 2
        emit(["type": "chunk", "track": name, "sequence": sequence, "startMs": startMs, "endMs": (originMs ?? 0) + Double(samples) / 24, "wav": wav.base64EncodedString()])
        sequence += 1; pending.removeFirst(length)
    }
}

@available(macOS 15.0, *)
func captureErrorCode(_ error: Error, fallback: String = "audio_source_missing") -> String {
    let cause = error as NSError
    if cause.domain == "microphone_permission_denied" { return "audio_permission_denied" }
    if cause.domain == "system_audio_permission_denied" { return "system_audio_permission_denied" }
    if cause.domain == "audio_start_timeout" { return "audio_start_timeout" }
    return fallback
}

@available(macOS 15.0, *)
// Device/session mutations are confined to deviceQueue; sample conversion and
// flushing are confined to queue. Samples are admitted only after both sources
// start, when their shared epoch is set.
final class Capture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "ai.xpert.desktop.audio")
    let deviceQueue = DispatchQueue(label: "ai.xpert.desktop.audio.devices")
    let microphone = Track("microphone"), system = Track("system")
    let microphoneSession = AVCaptureSession()
    lazy var systemTap = SystemAudioTap(queue: queue, deviceQueue: deviceQueue) { [weak self] buffer, timestamp in
        guard let self, self.capturing else { return }
        do { try self.system.consume(buffer, timestamp: timestamp, epoch: self.epoch) }
        catch { emit(["type": "error", "code": "audio_conversion_failed"]) }
    }
    var epoch = 0.0
    var capturing = false // Confined to the sample queue.
    @MainActor
    func start() async throws {
        try Task.checkCancellation()
        let allowed = await AVCaptureDevice.requestAccess(for: .audio)
        try Task.checkCancellation()
        guard allowed else { throw NSError(domain: "microphone_permission_denied", code: 1) }
        captureLog.info("Starting microphone")
        try await startMicrophone()
        try Task.checkCancellation()
        captureLog.info("Starting private system audio tap")
        try await captureOperation(timeout: systemAudioStartupTimeout) { completion in
            deviceQueue.async {
                do { try self.systemTap.start(); completion(nil) }
                catch { completion(error) }
            }
        }
        try Task.checkCancellation()
        // Device setup time is not recorded as silent meeting time.
        queue.sync {
            epoch = CMClockGetTime(CMClockGetHostTimeClock()).seconds
            emit(["type": "started"])
            capturing = true
        }
        captureLog.info("Both audio sources started")
    }
    func startMicrophone() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            deviceQueue.async {
                do {
                    guard let device = AVCaptureDevice.default(for: .audio) else {
                        throw NSError(domain: "microphone_unavailable", code: 1)
                    }
                    let input = try AVCaptureDeviceInput(device: device)
                    let output = AVCaptureAudioDataOutput()
                    self.microphoneSession.beginConfiguration()
                    defer { self.microphoneSession.commitConfiguration() }
                    guard self.microphoneSession.canAddInput(input), self.microphoneSession.canAddOutput(output) else {
                        throw NSError(domain: "microphone_unavailable", code: 2)
                    }
                    self.microphoneSession.addInput(input)
                    self.microphoneSession.addOutput(output)
                    output.setSampleBufferDelegate(self, queue: self.queue)
                } catch {
                    continuation.resume(throwing: error)
                    return
                }
                self.microphoneSession.startRunning()
                if self.microphoneSession.isRunning { continuation.resume() }
                else { continuation.resume(throwing: NSError(domain: "microphone_unavailable", code: 3)) }
            }
        }
    }
    @MainActor
    func stop() async {
        captureLog.info("Stopping audio sources")
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            deviceQueue.async {
                self.systemTap.stop()
                self.microphoneSession.stopRunning()
                continuation.resume()
            }
        }
        queue.sync { capturing = false; microphone.flush(); system.flush() }
        emit(["type": "stopped", "chunks": ["microphone": microphone.sequence, "system": system.sequence]])
        captureLog.info("Audio sources released")
    }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard capturing else { return }
        do { try microphone.consume(sampleBuffer, epoch: epoch) }
        catch { emit(["type": "error", "code": "audio_conversion_failed"]) }
    }
}
