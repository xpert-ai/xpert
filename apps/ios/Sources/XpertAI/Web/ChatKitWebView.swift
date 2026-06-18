import SwiftUI
import WebKit

public struct ChatKitWebView: View {
    let session: AuthSession
    let xpert: XpertSummary

    public init(session: AuthSession, xpert: XpertSummary) {
        self.session = session
        self.xpert = xpert
    }

    public var body: some View {
        WebKitContainer(
            configuration: ChatKitWebConfiguration(session: session, xpert: xpert)
        )
    }
}

@MainActor
public struct ChatKitWebConfiguration {
    let session: AuthSession
    let xpert: XpertSummary

    var frameURL: URL {
        encodedFrameURL(from: baseFrameURL)
    }

    private var baseFrameURL: URL {
        if let configuredFrameURL = session.apiClient.configuration.chatkitFrameURL {
            return configuredFrameURL
        }

        let deploymentURL = session.bootstrap?.deployment.chatkitFrameUrl ?? "/chatkit"
        if let absolute = URL(string: deploymentURL), absolute.scheme != nil {
            return absolute
        }
        let base = session.apiClient.configuration.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)\(deploymentURL.hasPrefix("/") ? deploymentURL : "/\(deploymentURL)")")!
    }

    private var apiURL: String {
        "\(session.apiClient.configuration.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/api/ai"
    }

    private var chatKitLocale: String {
        let identifier = Locale.current.identifier.lowercased()
        if identifier.hasPrefix("zh_hant") || identifier.hasPrefix("zh-tw") || identifier.hasPrefix("zh-hk") {
            return "zh-Hant"
        }
        if identifier.hasPrefix("zh") {
            return "zh-Hans"
        }
        return "en"
    }

    private var optionsPayload: [String: JSONValue] {
        var context: [String: JSONValue] = [
            "source": .string("ios"),
            "xpertId": .string(xpert.id)
        ]

        if let organizationId = session.activeOrganizationId?.nonEmpty {
            context["organizationId"] = .string(organizationId)
        }

        return [
            "options": .object([
                "api": .object([
                    "apiUrl": .string(apiURL),
                    "xpertId": .string(xpert.id)
                ]),
                "locale": .string(chatKitLocale),
                "header": .object([
                    "title": .object([
                        "text": .string(xpert.displayTitle)
                    ])
                ]),
                "composer": .object([
                    "attachments": .object([
                        "enabled": .bool(true),
                        "maxCount": .number(5),
                        "maxSize": .number(10 * 1024 * 1024)
                    ]),
                    "tools": .array([])
                ]),
                "request": .object([
                    "context": .object(context)
                ])
            ])
        ]
    }

    private func encodedFrameURL(from baseURL: URL) -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return baseURL
        }

        var queryItems = components.queryItems ?? []
        queryItems.removeAll { $0.name == "clientSecret" }
        if let token = session.apiClient.credentials?.accessToken.nonEmpty {
            queryItems.append(URLQueryItem(name: "clientSecret", value: token))
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        components.percentEncodedFragment = encodedOptionsHash()
        return components.url ?? baseURL
    }

    private func encodedOptionsHash() -> String? {
        guard let data = try? JSONEncoder().encode(optionsPayload) else {
            return nil
        }
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
    }

    var bootstrapScript: String {
        let token = session.apiClient.credentials?.accessToken ?? ""
        let organizationId = session.activeOrganizationId ?? ""
        let payload: [String: JSONValue] = [
            "apiUrl": .string(apiURL),
            "xpertId": .string(xpert.id),
            "locale": .string(chatKitLocale),
            "organizationId": organizationId.isEmpty ? .null : .string(organizationId),
            "clientSecret": token.isEmpty
                ? .null
                : .object([
                    "secret": .string(token),
                    "organizationId": organizationId.isEmpty ? .null : .string(organizationId)
                ])
        ]
        let data = try? JSONEncoder().encode(payload)
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return """
        window.xpertMobileChatkit = {
          config: \(json),
          getClientSecret: function () { return Promise.resolve(window.xpertMobileChatkit.config.clientSecret); }
        };
        window.dispatchEvent(new CustomEvent('xpertai-mobile-chatkit-ready', { detail: window.xpertMobileChatkit.config }));
        """
    }
}

private struct WebKitContainer {
    let configuration: ChatKitWebConfiguration

    @MainActor
    func makeWebView() -> WKWebView {
        let userContentController = WKUserContentController()
        userContentController.addUserScript(WKUserScript(
            source: configuration.bootstrapScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.userContentController = userContentController
        let webView = WKWebView(frame: .zero, configuration: webConfiguration)
        webView.allowsBackForwardNavigationGestures = true
        return webView
    }

    @MainActor
    func updateWebView(_ webView: WKWebView) {
        if webView.url != configuration.frameURL {
            webView.load(URLRequest(url: configuration.frameURL))
        }
    }
}

#if os(macOS)
extension WebKitContainer: NSViewRepresentable {
    @MainActor
    func makeNSView(context: Context) -> WKWebView {
        makeWebView()
    }

    @MainActor
    func updateNSView(_ webView: WKWebView, context: Context) {
        updateWebView(webView)
    }
}
#else
extension WebKitContainer: UIViewRepresentable {
    @MainActor
    func makeUIView(context: Context) -> WKWebView {
        makeWebView()
    }

    @MainActor
    func updateUIView(_ webView: WKWebView, context: Context) {
        updateWebView(webView)
    }
}
#endif
