import Foundation

public enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
}

public enum APIError: LocalizedError, Equatable {
    case invalidURL(String)
    case missingCredentials
    case unauthorized
    case badStatus(Int, String)
    case emptyResponse

    public var errorDescription: String? {
        switch self {
        case .invalidURL(let value):
            return "Invalid URL: \(value)"
        case .missingCredentials:
            return "Sign in is required."
        case .unauthorized:
            return "Your session has expired."
        case .badStatus(let status, let body):
            return body.nonEmpty ?? "Request failed with status \(status)."
        case .emptyResponse:
            return "The server returned an empty response."
        }
    }
}

public final class APIClient: @unchecked Sendable {
    public private(set) var configuration: AppConfiguration
    public let credentialStore: CredentialStore
    public var languageCode: String
    public private(set) var credentials: SessionCredentials?

    private let urlSession: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(
        configuration: AppConfiguration,
        credentialStore: CredentialStore,
        urlSession: URLSession = .shared,
        languageCode: String = Locale.current.identifier
    ) {
        self.configuration = configuration
        self.credentialStore = credentialStore
        self.urlSession = urlSession
        self.languageCode = languageCode
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        credentials = try? credentialStore.loadCredentials()
    }

    public func updateDeployment(_ deployment: MobileDeploymentConfig) {
        guard let value = deployment.apiBaseUrl?.nonEmpty, let url = URL(string: value) else {
            return
        }
        configuration.baseURL = url
    }

    public func restoreCredentials() throws -> SessionCredentials? {
        credentials = try credentialStore.loadCredentials()
        return credentials
    }

    public func setActiveOrganizationId(_ organizationId: String?) throws {
        guard var credentials else {
            return
        }
        credentials.organizationId = organizationId
        self.credentials = credentials
        try credentialStore.saveCredentials(credentials)
    }

    public func clearCredentials() throws {
        credentials = nil
        try credentialStore.clearCredentials()
    }

    @discardableResult
    public func login(email: String, password: String) async throws -> AuthResponse {
        let response: AuthResponse = try await request(
            path: "/api/auth/login",
            method: .post,
            body: LoginRequest(email: email, password: password),
            requiresAuth: false
        )
        let session = SessionCredentials(
            accessToken: response.token,
            refreshToken: response.refreshToken,
            tenantId: response.user.tenantId,
            organizationId: nil
        )
        credentials = session
        try credentialStore.saveCredentials(session)
        return response
    }

    @discardableResult
    public func refreshAccessToken() async throws -> SessionCredentials {
        guard let current = credentials else {
            throw APIError.missingCredentials
        }
        let response: RefreshResponse = try await request(
            path: "/api/auth/refresh",
            method: .get,
            bodyData: nil,
            requiresAuth: false,
            overrideAccessToken: current.refreshToken,
            retryOnUnauthorized: false
        )
        let updated = SessionCredentials(
            accessToken: response.token,
            refreshToken: response.refreshToken,
            tenantId: current.tenantId,
            organizationId: current.organizationId
        )
        credentials = updated
        try credentialStore.saveCredentials(updated)
        return updated
    }

    public func bootstrap() async throws -> MobileBootstrap {
        let bootstrap: MobileBootstrap = try await request(path: "/api/mobile/bootstrap")
        updateDeployment(bootstrap.deployment)
        if let tenantId = bootstrap.user.tenantId {
            var updated = credentials
            updated?.tenantId = tenantId
            updated?.organizationId = bootstrap.activeOrganizationId
            credentials = updated
            if let updated {
                try credentialStore.saveCredentials(updated)
            }
        }
        return bootstrap
    }

    public func xperts(search: String? = nil, limit: Int = 25, offset: Int = 0) async throws -> XpertsResponse {
        try await request(
            path: "/api/mobile/xperts",
            query: [
                URLQueryItem(name: "search", value: search?.nonEmpty),
                URLQueryItem(name: "limit", value: String(limit)),
                URLQueryItem(name: "offset", value: String(offset))
            ].compactMap { $0 }
        )
    }

    public func slotViews(hostType: String, hostId: String, slot: String = "main") async throws -> [XpertExtensionViewManifest] {
        try await request(
            path: "/api/view-hosts/\(hostType.urlPathEscaped)/\(hostId.urlPathEscaped)/slots/\(slot.urlPathEscaped)/views"
        )
    }

    public func viewData(
        hostType: String,
        hostId: String,
        viewKey: String,
        query: XpertViewQuery
    ) async throws -> XpertViewDataResult {
        try await request(
            path: "/api/view-hosts/\(hostType.urlPathEscaped)/\(hostId.urlPathEscaped)/views/\(viewKey.urlPathEscaped)/data",
            query: query.queryItems()
        )
    }

    public func remoteComponentEntry(hostType: String, hostId: String, viewKey: String) async throws -> String {
        try await requestString(
            path: "/api/view-hosts/\(hostType.urlPathEscaped)/\(hostId.urlPathEscaped)/views/\(viewKey.urlPathEscaped)/remote-component/entry"
        )
    }

    public func parameterOptions(
        hostType: String,
        hostId: String,
        viewKey: String,
        parameterKey: String,
        query: [String: JSONValue]
    ) async throws -> JSONValue {
        try await request(
            path: "/api/view-hosts/\(hostType.urlPathEscaped)/\(hostId.urlPathEscaped)/views/\(viewKey.urlPathEscaped)/parameters/\(parameterKey.urlPathEscaped)/options",
            query: query.queryItemValue().map { [URLQueryItem(name: "parameters", value: $0)] } ?? []
        )
    }

    public func executeAction(
        hostType: String,
        hostId: String,
        viewKey: String,
        actionKey: String,
        body: [String: JSONValue]
    ) async throws -> XpertViewActionResult {
        try await request(
            path: "/api/view-hosts/\(hostType.urlPathEscaped)/\(hostId.urlPathEscaped)/views/\(viewKey.urlPathEscaped)/actions/\(actionKey.urlPathEscaped)",
            method: .post,
            bodyData: try JSONSerialization.data(withJSONObject: body.mapValues { $0.foundationObject() }, options: [])
        )
    }

    public func publicChatKitSession(identifier: String) async throws -> PublicChatKitSession {
        try await request(path: "/api/xpert/\(identifier.urlPathEscaped)/chatkit-session", method: .post, bodyData: Data())
    }

    public func tasks() async throws -> PaginatedResponse<XpertTaskSummary> {
        try await request(path: "/api/xpert-task/my", query: [URLQueryItem(name: "data", value: "{}")])
    }

    public func scheduleTask(id: String) async throws -> XpertTaskSummary {
        try await request(path: "/api/xpert-task/\(id.urlPathEscaped)/schedule", method: .put, bodyData: Data())
    }

    public func pauseTask(id: String) async throws -> XpertTaskSummary {
        try await request(path: "/api/xpert-task/\(id.urlPathEscaped)/pause", method: .put, bodyData: Data())
    }

    public func files(xpertId: String) async throws -> [MemoryFileItem] {
        try await request(path: "/api/xpert/\(xpertId.urlPathEscaped)/memory/files")
    }

    public func readFile(xpertId: String, path: String) async throws -> String {
        try await requestString(
            path: "/api/xpert/\(xpertId.urlPathEscaped)/memory/file",
            query: [URLQueryItem(name: "path", value: path)]
        )
    }

    public func saveFile(xpertId: String, path: String, content: String) async throws {
        let body: [String: JSONValue] = [
            "path": .string(path),
            "content": .string(content)
        ]
        let _: EmptyResponse = try await request(
            path: "/api/xpert/\(xpertId.urlPathEscaped)/memory/file",
            method: .put,
            bodyData: try JSONSerialization.data(withJSONObject: body.mapValues { $0.foundationObject() }, options: [])
        )
    }

    public func uploadFile(xpertId: String, fileURL: URL) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        let data = try Data(contentsOf: fileURL)
        var body = Data()
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n")
        body.append("Content-Type: application/octet-stream\r\n\r\n")
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n")

        var request = try makeURLRequest(
            path: "/api/xpert/\(xpertId.urlPathEscaped)/memory/file/upload",
            method: .post,
            bodyData: body
        )
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (responseData, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? 0, String(data: responseData, encoding: .utf8) ?? "")
        }
    }

    public func deleteFile(xpertId: String, path: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/api/xpert/\(xpertId.urlPathEscaped)/memory/file",
            method: .delete,
            query: [URLQueryItem(name: "path", value: path)]
        )
    }

    public func makeURLRequest(
        path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        bodyData: Data? = nil,
        requiresAuth: Bool = true,
        overrideAccessToken: String? = nil
    ) throws -> URLRequest {
        guard var components = URLComponents(string: absoluteURLString(path: path)) else {
            throw APIError.invalidURL(path)
        }
        let queryItems = query.filter { $0.value != nil }
        if !queryItems.isEmpty {
            components.queryItems = (components.queryItems ?? []) + queryItems
        }
        guard let url = components.url else {
            throw APIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(languageCode, forHTTPHeaderField: "Language")
        request.setValue(languageCode, forHTTPHeaderField: "Accept-Language")

        if let bodyData {
            request.httpBody = bodyData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let token = overrideAccessToken ?? credentials?.accessToken
        if requiresAuth || overrideAccessToken != nil {
            guard let token else {
                throw APIError.missingCredentials
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let tenantId = credentials?.tenantId {
            request.setValue(tenantId, forHTTPHeaderField: "Tenant-Id")
        }
        if let organizationId = credentials?.organizationId {
            request.setValue("organization", forHTTPHeaderField: "X-Scope-Level")
            request.setValue(organizationId, forHTTPHeaderField: "Organization-Id")
        } else if credentials?.tenantId != nil {
            request.setValue("tenant", forHTTPHeaderField: "X-Scope-Level")
        }

        return request
    }

    public func request<Response: Decodable>(
        path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        bodyData: Data? = nil,
        requiresAuth: Bool = true,
        overrideAccessToken: String? = nil,
        retryOnUnauthorized: Bool = true
    ) async throws -> Response {
        let request = try makeURLRequest(
            path: path,
            method: method,
            query: query,
            bodyData: bodyData,
            requiresAuth: requiresAuth,
            overrideAccessToken: overrideAccessToken
        )
        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.emptyResponse
        }
        if httpResponse.statusCode == 401, retryOnUnauthorized, overrideAccessToken == nil {
            _ = try await refreshAccessToken()
            return try await self.request(
                path: path,
                method: method,
                query: query,
                bodyData: bodyData,
                requiresAuth: requiresAuth,
                overrideAccessToken: overrideAccessToken,
                retryOnUnauthorized: false
            )
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            }
            throw APIError.badStatus(httpResponse.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        if let empty = EmptyResponse() as? Response {
            return empty
        }
        guard !data.isEmpty else {
            throw APIError.emptyResponse
        }
        return try decoder.decode(Response.self, from: data)
    }

    public func request<Body: Encodable, Response: Decodable>(
        path: String,
        method: HTTPMethod,
        body: Body,
        requiresAuth: Bool = true
    ) async throws -> Response {
        try await request(
            path: path,
            method: method,
            bodyData: try encoder.encode(body),
            requiresAuth: requiresAuth
        )
    }

    public func requestString(path: String, query: [URLQueryItem] = []) async throws -> String {
        let request = try makeURLRequest(path: path, query: query)
        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? 0, String(data: data, encoding: .utf8) ?? "")
        }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private func absoluteURLString(path: String) -> String {
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return path
        }
        let base = configuration.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        return "\(base)\(normalizedPath)"
    }
}

private struct RefreshResponse: Codable, Equatable {
    let token: String
    let refreshToken: String
}

public struct EmptyResponse: Codable, Equatable, Sendable {
    public init() {}
}

private extension XpertViewQuery {
    func queryItems() -> [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let page {
            items.append(URLQueryItem(name: "page", value: String(page)))
        }
        if let pageSize {
            items.append(URLQueryItem(name: "pageSize", value: String(pageSize)))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        if let search {
            items.append(URLQueryItem(name: "search", value: search))
        }
        if let sortBy {
            items.append(URLQueryItem(name: "sortBy", value: sortBy))
        }
        if let sortDirection {
            items.append(URLQueryItem(name: "sortDirection", value: sortDirection))
        }
        if let selectionId {
            items.append(URLQueryItem(name: "selectionId", value: selectionId))
        }
        if let parameters, let encoded = parameters.queryItemValue() {
            items.append(URLQueryItem(name: "parameters", value: encoded))
        }
        if let filters, let data = try? JSONEncoder().encode(filters), let encoded = String(data: data, encoding: .utf8) {
            items.append(URLQueryItem(name: "filters", value: encoded))
        }
        return items
    }
}

private extension String {
    var urlPathEscaped: String {
        addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? self
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}
