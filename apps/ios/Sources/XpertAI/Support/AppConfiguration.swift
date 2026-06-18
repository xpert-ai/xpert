import Foundation

public struct AppConfiguration: Equatable, Sendable {
    public var baseURL: URL
    public var chatkitFrameURL: URL?

    public init(baseURL: URL, chatkitFrameURL: URL? = nil) {
        self.baseURL = baseURL
        self.chatkitFrameURL = chatkitFrameURL
    }

    public static func fromBundle(_ bundle: Bundle = .main) -> AppConfiguration {
        let rawValue = bundle.object(forInfoDictionaryKey: "XPERT_API_BASE_URL") as? String
        let configured = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = configured.flatMap(URL.init(string:)) ?? URL(string: "http://localhost:3000")!
        let chatkitRawValue = bundle.object(forInfoDictionaryKey: "XPERT_CHATKIT_FRAME_URL") as? String
        let chatkitConfigured = chatkitRawValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        let chatkitURL = chatkitConfigured.flatMap(URL.init(string:))
        return AppConfiguration(baseURL: url, chatkitFrameURL: chatkitURL)
    }
}
