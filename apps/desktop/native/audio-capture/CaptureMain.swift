import Foundation

@main
struct Main {
    static func main() async {
        if CommandLine.arguments.dropFirst().elementsEqual(["--check"]) {
            if #available(macOS 15.0, *) { emit(["type": "capability", "supported": true]) }
            else { emit(["type": "capability", "supported": false, "code": "macos_15_required"]) }
            return
        }
        guard CommandLine.arguments.count == 1 else { exit(1) }
        guard #available(macOS 15.0, *) else { emit(["type": "error", "code": "macos_15_required"]); return }
        let capture = Capture()
        await runCapture(start: { try await capture.start() }, stop: { await capture.stop() })
    }
}
