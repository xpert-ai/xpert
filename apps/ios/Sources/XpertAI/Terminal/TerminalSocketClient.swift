import Foundation
import SocketIO

@MainActor
@Observable
public final class TerminalSocketClient {
    public private(set) var lines: [String] = []
    public private(set) var connected = false
    public private(set) var sessionId: String?
    public var conversationId = ""
    public var input = ""
    public var error: String?

    private let apiClient: APIClient
    private var manager: SocketManager?
    private var socket: SocketIOClient?

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func connect() {
        guard let token = apiClient.credentials?.accessToken else {
            error = "Sign in is required."
            return
        }
        let namespace = apiClient.configuration.baseURL.appendingPathComponent("sandbox-terminal")
        let manager = SocketManager(
            socketURL: apiClient.configuration.baseURL,
            config: [
                .log(false),
                .compress,
                .connectParams(["token": token]),
                .extraHeaders(["Authorization": "Bearer \(token)"])
            ]
        )
        let socket = manager.socket(forNamespace: "/\(namespace.lastPathComponent)")
        self.manager = manager
        self.socket = socket

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            Task { @MainActor in
                self?.connected = true
                self?.lines.append("connected")
            }
        }
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            Task { @MainActor in
                self?.connected = false
                self?.lines.append("disconnected")
            }
        }
        socket.on("opened") { [weak self] data, _ in
            Task { @MainActor in
                guard let payload = data.first as? [String: Any] else { return }
                self?.sessionId = payload["sessionId"] as? String
                self?.lines.append("opened \(payload["workingDirectory"] as? String ?? "")")
            }
        }
        socket.on("output") { [weak self] data, _ in
            Task { @MainActor in
                guard let payload = data.first as? [String: Any], let output = payload["data"] as? String else { return }
                self?.lines.append(output)
            }
        }
        socket.on("error") { [weak self] data, _ in
            Task { @MainActor in
                self?.error = String(describing: data.first ?? "Terminal error")
            }
        }
        socket.on("closed") { [weak self] _, _ in
            Task { @MainActor in
                self?.sessionId = nil
                self?.lines.append("closed")
            }
        }
        socket.connect()
    }

    public func open() {
        guard connected, !conversationId.isEmpty else {
            error = "Conversation ID is required."
            return
        }
        socket?.emit("open", [
            "conversationId": conversationId,
            "cols": 100,
            "rows": 32,
            "requestId": UUID().uuidString
        ])
    }

    public func sendInput() {
        guard let sessionId, !input.isEmpty else { return }
        socket?.emit("input", [
            "sessionId": sessionId,
            "data": input + "\n"
        ])
        input = ""
    }

    public func close() {
        if let sessionId {
            socket?.emit("close", ["sessionId": sessionId])
        }
        socket?.disconnect()
        connected = false
        self.sessionId = nil
    }
}
