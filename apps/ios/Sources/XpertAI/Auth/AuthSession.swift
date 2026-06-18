import Foundation
import Observation

@MainActor
@Observable
public final class AuthSession {
    public enum State: Equatable {
        case restoring
        case signedOut
        case signedIn
    }

    public private(set) var state: State = .restoring
    public private(set) var bootstrap: MobileBootstrap?
    public private(set) var user: MobileUserSummary?
    public private(set) var organizations: [MobileOrganizationSummary] = []
    public private(set) var xperts: [XpertSummary] = []
    public private(set) var isLoading = false
    public var selectedXpert: XpertSummary?
    public var lastError: String?

    public let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public var activeOrganizationId: String? {
        bootstrap?.activeOrganizationId ?? apiClient.credentials?.organizationId
    }

    public func restore() async {
        state = .restoring
        do {
            guard try apiClient.restoreCredentials() != nil else {
                state = .signedOut
                return
            }
            try await loadBootstrap()
            state = .signedIn
        } catch {
            try? apiClient.clearCredentials()
            state = .signedOut
            lastError = error.localizedDescription
        }
    }

    public func login(email: String, password: String) async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            let response = try await apiClient.login(email: email, password: password)
            user = response.user
            try await loadBootstrap()
            state = .signedIn
        } catch {
            state = .signedOut
            lastError = error.localizedDescription
        }
    }

    public func logout() {
        try? apiClient.clearCredentials()
        bootstrap = nil
        user = nil
        organizations = []
        xperts = []
        selectedXpert = nil
        state = .signedOut
    }

    public func selectOrganization(_ organization: MobileOrganizationSummary) async {
        do {
            try apiClient.setActiveOrganizationId(organization.id)
            try await loadBootstrap()
            try await loadXperts()
        } catch {
            lastError = error.localizedDescription
        }
    }

    public func loadBootstrap() async throws {
        let bootstrap = try await apiClient.bootstrap()
        self.bootstrap = bootstrap
        user = bootstrap.user
        organizations = bootstrap.organizations
    }

    public func loadXperts(search: String? = nil) async throws {
        let response = try await apiClient.xperts(search: search)
        xperts = response.items
        if selectedXpert == nil {
            selectedXpert = response.items.first
        }
    }
}
