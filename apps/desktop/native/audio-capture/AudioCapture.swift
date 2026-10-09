// Audio-only outputs: no screen frames are registered, serialized or written.
import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia

private let outputLock = NSLock()
func emit(_ event: [String: Any]) {
    guard let bytes = try? JSONSerialization.data(withJSONObject: event) else { return }
    outputLock.lock(); defer { outputLock.unlock() }
    FileHandle.standardOutput.write(bytes); FileHandle.standardOutput.write(Data([10]))
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
        if converter == nil || converter?.inputFormat != format { converter = AVAudioConverter(from: format, to: target) }
        guard let converter, let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(Double(input.frameLength) * 24000 / format.sampleRate) + 64) else { throw NSError(domain: "audio_converter", code: 1) }
        var used = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, state in
            if used { state.pointee = .noDataNow; return nil }
            used = true; state.pointee = .haveData; return input
        }
        if let error { throw error }
        if originMs == nil { originMs = max(0, (CMSampleBufferGetPresentationTimeStamp(sample).seconds - epoch) * 1000) }
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
final class Capture: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "ai.xpert.desktop.audio")
    let microphone = Track("microphone"), system = Track("system")
    var stream: SCStream?
    var epoch = 0.0
    func start() async throws {
        let allowed = await AVCaptureDevice.requestAccess(for: .audio)
        guard allowed else { throw NSError(domain: "microphone_permission_denied", code: 1) }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else { throw NSError(domain: "system_audio_unavailable", code: 2) }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.width = 2; configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.capturesAudio = true; configuration.captureMicrophone = true
        configuration.sampleRate = 24000; configuration.channelCount = 1
        configuration.excludesCurrentProcessAudio = true
        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try stream.addStreamOutput(self, type: .microphone, sampleHandlerQueue: queue)
        self.stream = stream
        epoch = CMClockGetTime(CMClockGetHostTimeClock()).seconds
        try await stream.startCapture()
        emit(["type": "started"])
    }
    func stop() async {
        try? await stream?.stopCapture()
        queue.sync { microphone.flush(); system.flush() }
        emit(["type": "stopped", "chunks": ["microphone": microphone.sequence, "system": system.sequence]])
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        do {
            if type == .audio { try system.consume(sampleBuffer, epoch: epoch) }
            if type == .microphone { try microphone.consume(sampleBuffer, epoch: epoch) }
        } catch { emit(["type": "error", "code": "audio_conversion_failed"]) }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) { emit(["type": "error", "code": "device_lost"]) }
}

@main
struct Main {
    static func main() async {
        if CommandLine.arguments.contains("--check") {
            if #available(macOS 15.0, *) { emit(["type": "capability", "supported": true]) }
            else { emit(["type": "capability", "supported": false, "code": "macos_15_required"]) }
            return
        }
        if CommandLine.arguments.contains("--self-test") {
            do { try testSampleConversion() }
            catch { let cause = error as NSError; emit(["type": "error", "code": "self_test_failed", "stage": cause.domain, "status": cause.code]); exit(1) }
            return
        }
        guard #available(macOS 15.0, *) else { emit(["type": "error", "code": "macos_15_required"]); return }
        let capture = Capture()
        do {
            try await capture.start()
            // The parent owns session termination. EOF also releases all devices.
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                DispatchQueue.global().async { _ = readLine(); continuation.resume() }
            }
            await capture.stop()
        } catch { emit(["type": "error", "code": "audio_permission_denied"]) }
    }
}

// Synthetic CMSampleBuffers exercise the same conversion path as live capture.
func testSampleConversion() throws {
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
