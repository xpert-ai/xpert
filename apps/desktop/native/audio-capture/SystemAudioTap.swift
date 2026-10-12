// A private, hardware-clocked tap owns its IO in this process. In particular,
// tap auto-start must stay off: waiting for another app to play audio stalls
// startup on an otherwise silent Mac. No screen capture service is involved.
import Foundation
import CoreAudio
import AVFoundation

func checkAudioStatus(_ status: OSStatus) throws {
    guard status != noErr else { return }
    let domain = status == kAudioDevicePermissionsError ? "system_audio_permission_denied" : "system_audio_unavailable"
    throw NSError(domain: domain, code: Int(status))
}

func audioProperty<Value>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ value: inout Value, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) throws {
    var address = AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    var size = UInt32(MemoryLayout<Value>.size)
    try withUnsafeMutablePointer(to: &value) {
        try checkAudioStatus(AudioObjectGetPropertyData(object, &address, 0, nil, &size, $0))
    }
}

// IO buffers are borrowed only for the callback. Copy before dispatching work;
// conversion, encoding and stdout writes must never block the hardware thread.
func copyAudioInput(_ buffers: UnsafePointer<AudioBufferList>, format: AVAudioFormat) throws -> AVAudioPCMBuffer {
    let source = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffers))
    let bytesPerFrame = format.streamDescription.pointee.mBytesPerFrame
    guard bytesPerFrame > 0, let first = source.first else { throw NSError(domain: "audio_buffer_read", code: 1) }
    let frames = first.mDataByteSize / bytesPerFrame
    guard frames > 0, let copy = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else {
        throw NSError(domain: "audio_buffer_read", code: 2)
    }
    copy.frameLength = frames
    let target = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    guard source.count == target.count else { throw NSError(domain: "audio_buffer_read", code: 3) }
    for index in source.indices {
        guard source[index].mDataByteSize == target[index].mDataByteSize,
              let input = source[index].mData, let output = target[index].mData else {
            throw NSError(domain: "audio_buffer_read", code: 4)
        }
        memcpy(output, input, Int(source[index].mDataByteSize))
    }
    return copy
}

// Each queued buffer owns its data and capture-time format. The lock protects
// only admission state; copying, device calls and output all happen outside it.
final class SystemAudioInput: @unchecked Sendable {
    private let lock = NSLock()
    private var format: AVAudioFormat?
    private var pending = 0
    private var closed = false
    private let limit: Int
    private let queue: DispatchQueue
    private let receive: @Sendable (AVAudioPCMBuffer, Double) -> Void
    private let onError: @Sendable (String) -> Void

    init(queue: DispatchQueue, limit: Int = 100,
         receive: @escaping @Sendable (AVAudioPCMBuffer, Double) -> Void,
         onError: @escaping @Sendable (String) -> Void) {
        self.queue = queue
        self.limit = limit
        self.receive = receive
        self.onError = onError
    }
    func setFormat(_ format: AVAudioFormat) {
        lock.withLock { if !closed { self.format = format } }
    }
    func close() {
        lock.withLock { closed = true; format = nil }
    }
    func fail(_ code: String) {
        let report = lock.withLock {
            guard !closed else { return false }
            closed = true
            format = nil
            return true
        }
        if report { queue.async { self.onError(code) } }
    }
    func enqueue(_ buffers: UnsafePointer<AudioBufferList>, timestamp: Double) {
        guard buffers.pointee.mBuffers.mDataByteSize > 0 else { return }
        lock.lock()
        guard !closed, let format else { lock.unlock(); return }
        guard pending < limit else {
            lock.unlock()
            fail("audio_conversion_failed")
            return
        }
        pending += 1
        lock.unlock()
        do {
            let copy = try copyAudioInput(buffers, format: format)
            queue.async {
                defer { self.lock.withLock { self.pending -= 1 } }
                self.receive(copy, timestamp)
            }
        } catch {
            lock.withLock { pending -= 1 }
            fail("audio_conversion_failed")
        }
    }
}

@available(macOS 15.0, *)
final class SystemAudioTap: @unchecked Sendable {
    private var tap = AudioObjectID(kAudioObjectUnknown)
    private var device = AudioObjectID(kAudioObjectUnknown)
    private var io: AudioDeviceIOProcID?
    private var rateListener: AudioObjectPropertyListenerBlock?
    private var rateAddress = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyNominalSampleRate, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    private let queue: DispatchQueue
    private let deviceQueue: DispatchQueue
    private let input: SystemAudioInput
    init(queue: DispatchQueue, deviceQueue: DispatchQueue, receive: @escaping @Sendable (AVAudioPCMBuffer, Double) -> Void) {
        self.queue = queue
        self.deviceQueue = deviceQueue
        self.input = SystemAudioInput(queue: queue, receive: receive, onError: { emit(["type": "error", "code": $0]) })
    }
    // start/stop are both called on the recorder's serial device queue.
    func start() throws {
        do {
            var output = AudioObjectID(kAudioObjectUnknown)
            try audioProperty(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, &output)
            guard output != kAudioObjectUnknown else { throw NSError(domain: "system_audio_unavailable", code: 1) }
            var outputUID: CFString = "" as CFString
            try audioProperty(output, kAudioDevicePropertyDeviceUID, &outputUID)

            var pid = getpid(), process = AudioObjectID(kAudioObjectUnknown)
            var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
            var size = UInt32(MemoryLayout<AudioObjectID>.size)
            try checkAudioStatus(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, UInt32(MemoryLayout<pid_t>.size), &pid, &size, &process))
            let description = CATapDescription(stereoGlobalTapButExcludeProcesses: process == kAudioObjectUnknown ? [] : [process])
            description.name = "Bosi system audio"
            description.isPrivate = true
            description.muteBehavior = .unmuted
            try checkAudioStatus(AudioHardwareCreateProcessTap(description, &tap))
            let composition: [String: Any] = [
                kAudioAggregateDeviceNameKey: "Bosi recording",
                kAudioAggregateDeviceUIDKey: UUID().uuidString,
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceIsStackedKey: false,
                kAudioAggregateDeviceMainSubDeviceKey: outputUID,
                kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID, kAudioSubDeviceInputChannelsKey: 0]],
                kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
                kAudioAggregateDeviceTapAutoStartKey: false
            ]
            try checkAudioStatus(AudioHardwareCreateAggregateDevice(composition as CFDictionary, &device))
            let captureDevice = device
            let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
                guard let self, self.device == captureDevice, self.io != nil else { return }
                do { self.input.setFormat(try self.readRunningFormat(captureDevice)) }
                catch { self.input.fail(captureErrorCode(error, fallback: "device_lost")) }
            }
            try checkAudioStatus(AudioObjectAddPropertyListenerBlock(device, &rateAddress, deviceQueue, listener))
            rateListener = listener
            try checkAudioStatus(AudioDeviceCreateIOProcIDWithBlock(&io, device, nil) { [weak self] _, input, time, _, _ in
                guard let self else { return }
                // An idle system produces valid zero-valued buffers. Preserve them.
                self.input.enqueue(input, timestamp: AVAudioTime.seconds(forHostTime: time.pointee.mHostTime))
            })
            try checkAudioStatus(AudioDeviceStart(device, io))
            // The default output can change the aggregate's rate during start.
            // Publish the settled format before Capture admits either track.
            input.setFormat(try readRunningFormat(captureDevice))
        } catch {
            stop()
            throw error
        }
    }
    private func readRunningFormat(_ captureDevice: AudioObjectID) throws -> AVAudioFormat {
        var asbd = AudioStreamBasicDescription(), rate = Float64(0)
        try audioProperty(captureDevice, kAudioDevicePropertyStreamFormat, &asbd, scope: kAudioObjectPropertyScopeInput)
        try audioProperty(captureDevice, kAudioDevicePropertyNominalSampleRate, &rate)
        guard rate.isFinite, rate >= 8000, rate <= 192000 else { throw NSError(domain: "system_audio_unavailable", code: 3) }
        asbd.mSampleRate = rate
        guard let format = AVAudioFormat(streamDescription: &asbd), format.channelCount == 2 else {
            throw NSError(domain: "system_audio_unavailable", code: 4)
        }
        captureLog.info("System audio clock settled: \(rate) Hz")
        return format
    }
    func stop() {
        input.close()
        if let io {
            AudioDeviceStop(device, io)
            AudioDeviceDestroyIOProcID(device, io)
            self.io = nil
        }
        if let rateListener {
            AudioObjectRemovePropertyListenerBlock(device, &rateAddress, deviceQueue, rateListener)
            self.rateListener = nil
        }
        queue.sync {} // Drain admitted buffers before Capture flushes the tracks.
        if device != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(device)
            device = AudioObjectID(kAudioObjectUnknown)
        }
        if tap != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tap)
            tap = AudioObjectID(kAudioObjectUnknown)
        }
    }
}
