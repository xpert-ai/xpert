import SwiftUI
import WebKit

public struct RemoteComponentWebView {
    let session: AuthSession
    let hostType: String
    let hostId: String
    let manifest: XpertExtensionViewManifest

    public init(session: AuthSession, hostType: String, hostId: String, manifest: XpertExtensionViewManifest) {
        self.session = session
        self.hostType = hostType
        self.hostId = hostId
        self.manifest = manifest
    }

    @MainActor
    public func makeCoordinator() -> Coordinator {
        Coordinator(session: session, hostType: hostType, hostId: hostId, manifest: manifest)
    }

    @MainActor
    public func makeWebView(context: Context) -> WKWebView {
        let userContentController = WKUserContentController()
        userContentController.add(context.coordinator, name: Coordinator.handlerName)
        userContentController.addUserScript(WKUserScript(
            source: Coordinator.bridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = webView
        context.coordinator.loadEntry()
        return webView
    }

    @MainActor
    public func updateWebView(_ webView: WKWebView, context: Context) {}

    public final class Coordinator: NSObject, WKScriptMessageHandler {
        static let handlerName = "xpertRemoteComponent"
        static let bridgeScript = """
        (function () {
          const nativeHandler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.xpertRemoteComponent;
          const originalPostMessage = window.parent && window.parent.postMessage;
          window.parent = window.parent || window;
          window.parent.postMessage = function (message) {
            if (nativeHandler) { nativeHandler.postMessage(message); }
            else if (typeof originalPostMessage === 'function') { originalPostMessage.call(window.parent, message, '*'); }
          };
          window.__xpertNativeHostMessage = function (message) {
            window.dispatchEvent(new MessageEvent('message', { data: message, origin: window.location.origin, source: window }));
          };
        })();
        """

        let session: AuthSession
        let hostType: String
        let hostId: String
        let manifest: XpertExtensionViewManifest
        let instanceId: String
        weak var webView: WKWebView?

        init(session: AuthSession, hostType: String, hostId: String, manifest: XpertExtensionViewManifest) {
            self.session = session
            self.hostType = hostType
            self.hostId = hostId
            self.manifest = manifest
            instanceId = "\(manifest.key):\(UUID().uuidString)"
        }

        func loadEntry() {
            Task { @MainActor in
                do {
                    let html = try await session.apiClient.remoteComponentEntry(
                        hostType: hostType,
                        hostId: hostId,
                        viewKey: manifest.key
                    )
                    webView?.loadHTMLString(html, baseURL: session.apiClient.configuration.baseURL)
                } catch {
                    webView?.loadHTMLString("<html><body><pre>\(error.localizedDescription)</pre></body></html>", baseURL: nil)
                }
            }
        }

        public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let remoteMessage = RemoteComponentMessage(jsonObject: message.body) else {
                return
            }
            if remoteMessage.type == "ready" {
                sendInit()
                return
            }
            guard remoteMessage.instanceId == instanceId else {
                return
            }

            switch remoteMessage.type {
            case "requestData":
                handleRequest(remoteMessage, responseType: "data") {
                    let query = decodeQuery(remoteMessage.fields["query"])
                    let result = try await self.session.apiClient.viewData(
                        hostType: self.hostType,
                        hostId: self.hostId,
                        viewKey: self.manifest.key,
                        query: query
                    )
                    return ["data": try JSONValue.fromEncodable(result)]
                }
            case "requestParameterOptions":
                handleRequest(remoteMessage, responseType: "parameterOptions") {
                    guard let key = remoteMessage.string("parameterKey"),
                          self.manifest.parameters?.contains(where: { $0.key == key }) == true
                    else {
                        throw APIError.badStatus(400, "Parameter is not available.")
                    }
                    let result = try await self.session.apiClient.parameterOptions(
                        hostType: self.hostType,
                        hostId: self.hostId,
                        viewKey: self.manifest.key,
                        parameterKey: key,
                        query: remoteMessage.object("parameters") ?? [:]
                    )
                    return ["result": result]
                }
            case "executeAction":
                handleRequest(remoteMessage, responseType: "actionResult") {
                    guard let actionKey = remoteMessage.string("actionKey"),
                          self.manifest.actions?.contains(where: { $0.key == actionKey && ($0.transport ?? "json") == "json" }) == true
                    else {
                        throw APIError.badStatus(400, "Action is not available.")
                    }
                    var body: [String: JSONValue] = [:]
                    if let targetId = remoteMessage.string("targetId") {
                        body["targetId"] = .string(targetId)
                    }
                    if let input = remoteMessage.object("input") {
                        body["input"] = .object(input)
                    }
                    if let parameters = remoteMessage.object("parameters") {
                        body["parameters"] = .object(parameters)
                    }
                    let result = try await self.session.apiClient.executeAction(
                        hostType: self.hostType,
                        hostId: self.hostId,
                        viewKey: self.manifest.key,
                        actionKey: actionKey,
                        body: body
                    )
                    return ["result": try JSONValue.fromEncodable(result)]
                }
            case "executeFileAction":
                sendError(requestId: remoteMessage.requestId, message: "File actions require a native file picker in this build.")
            case "invokeClientCommand":
                send(remoteType: "clientCommandResult", requestId: remoteMessage.requestId, payload: [
                    "result": .object([
                        "success": .bool(false),
                        "message": .string("Client command is not available in the mobile host.")
                    ])
                ])
            case "resize":
                return
            case "notify":
                return
            default:
                return
            }
        }

        private func handleRequest(
            _ message: RemoteComponentMessage,
            responseType: String,
            run: @escaping () async throws -> [String: JSONValue]
        ) {
            Task { @MainActor in
                do {
                    let payload = try await run()
                    send(remoteType: responseType, requestId: message.requestId, payload: payload)
                } catch {
                    sendError(requestId: message.requestId, message: error.localizedDescription)
                }
            }
        }

        private func sendInit() {
            var payload: [String: JSONValue] = [
                "manifest": (try? JSONValue.fromEncodable(manifest)) ?? .null,
                "payload": .object([:]),
                "initialQuery": .object([:]),
                "locale": .string(Locale.current.identifier),
                "theme": .object([
                    "mode": .string("system"),
                    "tokens": .object([:])
                ])
            ]
            payload["instanceId"] = .string(instanceId)
            send(remoteType: "init", requestId: nil, payload: payload)
        }

        private func sendError(requestId: String?, message: String) {
            send(remoteType: "error", requestId: requestId, payload: ["message": .string(message)])
        }

        private func send(remoteType: String, requestId: String?, payload: [String: JSONValue]) {
            let hostMessage = RemoteComponentHostMessage(
                instanceId: instanceId,
                type: remoteType,
                requestId: requestId,
                payload: payload
            )
            guard let data = try? JSONEncoder().encode(hostMessage),
                  let json = String(data: data, encoding: .utf8)
            else {
                return
            }
            webView?.evaluateJavaScript("window.__xpertNativeHostMessage && window.__xpertNativeHostMessage(\(json));")
        }
    }
}

#if os(macOS)
extension RemoteComponentWebView: NSViewRepresentable {
    @MainActor
    public func makeNSView(context: Context) -> WKWebView {
        makeWebView(context: context)
    }

    @MainActor
    public func updateNSView(_ webView: WKWebView, context: Context) {
        updateWebView(webView, context: context)
    }
}
#else
extension RemoteComponentWebView: UIViewRepresentable {
    @MainActor
    public func makeUIView(context: Context) -> WKWebView {
        makeWebView(context: context)
    }

    @MainActor
    public func updateUIView(_ webView: WKWebView, context: Context) {
        updateWebView(webView, context: context)
    }
}
#endif

private func decodeQuery(_ value: JSONValue?) -> XpertViewQuery {
    guard let value, let data = try? JSONEncoder().encode(value) else {
        return XpertViewQuery()
    }
    return (try? JSONDecoder().decode(XpertViewQuery.self, from: data)) ?? XpertViewQuery()
}

private extension JSONValue {
    static func fromEncodable(_ value: Encodable) throws -> JSONValue {
        let data = try JSONEncoder().encode(AnyEncodable(value))
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }
}

private struct AnyEncodable: Encodable {
    let value: Encodable

    init(_ value: Encodable) {
        self.value = value
    }

    func encode(to encoder: Encoder) throws {
        try value.encode(to: encoder)
    }
}
