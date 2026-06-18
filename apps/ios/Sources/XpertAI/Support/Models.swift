import Foundation

public struct AuthResponse: Codable, Equatable {
    public let user: MobileUserSummary
    public let token: String
    public let refreshToken: String
}

public struct LoginRequest: Codable, Equatable {
    public let email: String
    public let password: String
}

public struct MobileDeploymentConfig: Codable, Equatable, Sendable {
    public let apiBaseUrl: String?
    public let apiBasePath: String
    public let aiApiPath: String
    public let chatkitFrameUrl: String
    public let viewHostsPath: String
    public let socketNamespaces: MobileSocketNamespaces
    public let capabilities: MobileCapabilities
}

public struct MobileSocketNamespaces: Codable, Equatable, Sendable {
    public let sandboxTerminal: String
}

public struct MobileCapabilities: Codable, Equatable, Sendable {
    public let chatkit: Bool
    public let extensionViews: Bool
    public let scheduledTasks: Bool
    public let fileMemory: Bool
    public let sandboxTerminal: Bool
    public let publicChatkitSessions: Bool
}

public struct MobileUserSummary: Codable, Equatable, Sendable {
    public let id: String
    public let tenantId: String?
    public let email: String?
    public let name: String?
    public let firstName: String?
    public let lastName: String?
    public let fullName: String?
    public let imageUrl: String?
    public let preferredLanguage: String?
}

public struct MobileOrganizationSummary: Codable, Equatable, Identifiable, Hashable, Sendable {
    public let id: String
    public let tenantId: String?
    public let name: String
    public let imageUrl: String?
    public let isDefault: Bool
    public let isActive: Bool
    public let timeZone: String?
    public let preferredLanguage: String?
}

public struct MobileAssistantBindingSummary: Codable, Equatable, Sendable {
    public let code: String
    public let scope: String
    public let sourceScope: String
    public let assistantId: String?
    public let enabled: Bool
    public let tenantId: String
    public let organizationId: String?
    public let userId: String?
}

public struct MobileBootstrap: Codable, Equatable, Sendable {
    public let deployment: MobileDeploymentConfig
    public let user: MobileUserSummary
    public let organizations: [MobileOrganizationSummary]
    public let activeOrganizationId: String?
    public let defaultOrganizationId: String?
    public let assistantBindings: [MobileAssistantBindingSummary]
}

public struct XpertSummary: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let slug: String
    public let name: String
    public let type: String
    public let title: String?
    public let titleCN: String?
    public let description: String?
    public let avatar: JSONValue?
    public let version: String?
    public let latest: Bool?
    public let workspaceId: String?
    public let organizationId: String?
    public let publishAt: String?
    public let starters: [String]?

    public var displayTitle: String {
        title?.nonEmpty ?? titleCN?.nonEmpty ?? name
    }
}

public struct XpertsResponse: Codable, Equatable, Sendable {
    public let items: [XpertSummary]
    public let total: Int
    public let limit: Int
    public let offset: Int
}

public struct LocalizedText: Codable, Equatable, Hashable, Sendable {
    public let en_US: String?
    public let en: String?
    public let zh_Hans: String?
    public let zh_Hant: String?
    public let zh_CN: String?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        en_US = try container.decodeIfPresent(String.self, forKey: DynamicCodingKey("en_US"))
        en = try container.decodeIfPresent(String.self, forKey: DynamicCodingKey("en"))
        zh_Hans = try container.decodeIfPresent(String.self, forKey: DynamicCodingKey("zh_Hans"))
        zh_Hant = try container.decodeIfPresent(String.self, forKey: DynamicCodingKey("zh_Hant"))
        zh_CN = try container.decodeIfPresent(String.self, forKey: DynamicCodingKey("zh_CN"))
    }

    public func display(locale: Locale = .current) -> String {
        let identifier = locale.identifier
        if identifier.hasPrefix("zh-Hant") || identifier.hasPrefix("zh_TW") || identifier.hasPrefix("zh_HK") {
            return zh_Hant?.nonEmpty ?? zh_Hans?.nonEmpty ?? zh_CN?.nonEmpty ?? en_US?.nonEmpty ?? en?.nonEmpty ?? ""
        }
        if identifier.hasPrefix("zh") {
            return zh_Hans?.nonEmpty ?? zh_CN?.nonEmpty ?? zh_Hant?.nonEmpty ?? en_US?.nonEmpty ?? en?.nonEmpty ?? ""
        }
        return en_US?.nonEmpty ?? en?.nonEmpty ?? zh_Hans?.nonEmpty ?? zh_CN?.nonEmpty ?? zh_Hant?.nonEmpty ?? ""
    }
}

public struct ViewActionDefinition: Codable, Equatable, Hashable, Identifiable, Sendable {
    public var id: String { key }
    public let key: String
    public let label: LocalizedText
    public let placement: String?
    public let actionType: String
    public let transport: String?
}

public struct ViewParameterDefinition: Codable, Equatable, Hashable, Identifiable, Sendable {
    public var id: String { key }
    public let key: String
    public let label: LocalizedText
    public let required: Bool?
    public let type: String?
}

public struct XpertViewSchema: Codable, Equatable, Hashable, Sendable {
    public let type: String
    public let items: [ViewField]?
    public let columns: [ViewField]?
    public let fields: [ViewField]?
    public let item: ViewListItemSchema?
    public let runtime: String?
    public let protocolVersion: Int?
    public let component: JSONValue?
}

public struct ViewField: Codable, Equatable, Hashable, Identifiable, Sendable {
    public var id: String { key }
    public let key: String
    public let label: LocalizedText
    public let valueType: String?
    public let dataType: String?
}

public struct ViewListItemSchema: Codable, Equatable, Hashable, Sendable {
    public let titleKey: String
    public let subtitleKey: String?
    public let descriptionKey: String?
    public let metaKeys: [String]?
}

public struct XpertExtensionViewManifest: Codable, Equatable, Hashable, Identifiable, Sendable {
    public var id: String { key }
    public let key: String
    public let title: LocalizedText
    public let description: LocalizedText?
    public let hostType: String
    public let slot: String
    public let order: Int?
    public let visible: Bool?
    public let view: XpertViewSchema
    public let parameters: [ViewParameterDefinition]?
    public let actions: [ViewActionDefinition]?
    public let clientCommands: [ViewClientCommandDefinition]?
}

public struct ViewClientCommandDefinition: Codable, Equatable, Hashable, Identifiable, Sendable {
    public var id: String { key }
    public let key: String
    public let label: LocalizedText?
}

public struct XpertViewQuery: Codable, Equatable, Hashable, Sendable {
    public var page: Int?
    public var pageSize: Int?
    public var cursor: String?
    public var search: String?
    public var sortBy: String?
    public var sortDirection: String?
    public var selectionId: String?
    public var parameters: [String: JSONValue]?
    public var filters: [JSONValue]?

    public init(page: Int? = nil, pageSize: Int? = nil, cursor: String? = nil, search: String? = nil) {
        self.page = page
        self.pageSize = pageSize
        self.cursor = cursor
        self.search = search
    }
}

public struct XpertViewDataResult: Codable, Equatable, Sendable {
    public let items: [[String: JSONValue]]?
    public let item: [String: JSONValue]?
    public let total: Int?
    public let nextCursor: String?
    public let summary: [String: JSONValue]?
    public let meta: JSONValue?
}

public struct XpertViewActionResult: Codable, Equatable, Sendable {
    public let success: Bool
    public let message: LocalizedText?
    public let data: JSONValue?
    public let refresh: Bool?
}

public struct XpertTaskSummary: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String?
    public let name: String?
    public let status: String?
    public let schedule: JSONValue?
    public let options: JSONValue?

    public var displayTitle: String {
        title?.nonEmpty ?? name?.nonEmpty ?? "Task"
    }
}

public struct PaginatedResponse<Item: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    public let items: [Item]
    public let total: Int?
}

public struct MemoryFileItem: Codable, Equatable, Identifiable, Sendable {
    public var id: String { path }
    public let path: String
    public let name: String?
    public let type: String?
    public let size: Int?
    public let updatedAt: String?
}

public struct PublicChatKitSession: Codable, Equatable, Sendable {
    public let clientSecret: String
    public let expiresAt: String?
    public let xpertId: String?
    public let assistantId: String?
    public let organizationId: String?

    enum CodingKeys: String, CodingKey {
        case clientSecret = "client_secret"
        case expiresAt = "expires_at"
        case xpertId
        case assistantId
        case organizationId
    }
}

public struct DynamicCodingKey: CodingKey, Hashable {
    public let stringValue: String
    public let intValue: Int?

    public init(_ stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    public init?(stringValue: String) {
        self.init(stringValue)
    }

    public init?(intValue: Int) {
        self.stringValue = String(intValue)
        self.intValue = intValue
    }
}

public extension String {
    var nonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
