import Foundation
import Security

public struct SessionCredentials: Codable, Equatable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var tenantId: String?
    public var organizationId: String?

    public init(accessToken: String, refreshToken: String, tenantId: String? = nil, organizationId: String? = nil) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.tenantId = tenantId
        self.organizationId = organizationId
    }
}

public protocol CredentialStore: Sendable {
    func loadCredentials() throws -> SessionCredentials?
    func saveCredentials(_ credentials: SessionCredentials) throws
    func clearCredentials() throws
}

public final class InMemoryCredentialStore: CredentialStore, @unchecked Sendable {
    private var credentials: SessionCredentials?

    public init(credentials: SessionCredentials? = nil) {
        self.credentials = credentials
    }

    public func loadCredentials() throws -> SessionCredentials? {
        credentials
    }

    public func saveCredentials(_ credentials: SessionCredentials) throws {
        self.credentials = credentials
    }

    public func clearCredentials() throws {
        credentials = nil
    }
}

public final class KeychainCredentialStore: CredentialStore, @unchecked Sendable {
    private let service: String
    private let account = "session"

    public init(service: String) {
        self.service = service
    }

    public func loadCredentials() throws -> SessionCredentials? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw KeychainError.unhandledStatus(status)
        }
        return try JSONDecoder().decode(SessionCredentials.self, from: data)
    }

    public func saveCredentials(_ credentials: SessionCredentials) throws {
        let data = try JSONEncoder().encode(credentials)
        try clearCredentials()
        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandledStatus(status)
        }
    }

    public func clearCredentials() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledStatus(status)
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

public enum KeychainError: LocalizedError, Equatable {
    case unhandledStatus(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .unhandledStatus(let status):
            return "Keychain operation failed with status \(status)."
        }
    }
}
