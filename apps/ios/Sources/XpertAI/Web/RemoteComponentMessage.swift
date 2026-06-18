import Foundation

public struct RemoteComponentMessage: Equatable, Sendable {
    public static let channel = "xpertai.remote_component"
    public static let protocolVersion = 1

    public let channel: String
    public let protocolVersion: Int
    public let instanceId: String?
    public let type: String
    public let requestId: String?
    public let fields: [String: JSONValue]

    public init?(jsonObject: Any) {
        guard JSONSerialization.isValidJSONObject(jsonObject),
              let data = try? JSONSerialization.data(withJSONObject: jsonObject, options: []),
              let payload = try? JSONDecoder().decode([String: JSONValue].self, from: data),
              payload["channel"]?.stringValue == Self.channel,
              case .number(let version)? = payload["protocolVersion"],
              Int(version) == Self.protocolVersion,
              let type = payload["type"]?.stringValue?.nonEmpty
        else {
            return nil
        }

        channel = Self.channel
        protocolVersion = Self.protocolVersion
        instanceId = payload["instanceId"]?.stringValue
        self.type = type
        requestId = payload["requestId"]?.stringValue
        fields = payload
    }

    public func string(_ key: String) -> String? {
        fields[key]?.stringValue?.nonEmpty
    }

    public func object(_ key: String) -> [String: JSONValue]? {
        fields[key]?.objectValue
    }

    public func number(_ key: String) -> Double? {
        if case .number(let value)? = fields[key] {
            return value
        }
        return nil
    }

    public func bool(_ key: String) -> Bool? {
        if case .bool(let value)? = fields[key] {
            return value
        }
        return nil
    }
}

public struct RemoteComponentHostMessage: Encodable, Sendable {
    public let channel = RemoteComponentMessage.channel
    public let protocolVersion = RemoteComponentMessage.protocolVersion
    public let instanceId: String
    public let type: String
    public let requestId: String?
    public let payload: [String: JSONValue]

    public init(instanceId: String, type: String, requestId: String? = nil, payload: [String: JSONValue] = [:]) {
        self.instanceId = instanceId
        self.type = type
        self.requestId = requestId
        self.payload = payload
    }

    enum CodingKeys: String, CodingKey {
        case channel
        case protocolVersion
        case instanceId
        case type
        case requestId
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicCodingKey.self)
        try container.encode(channel, forKey: DynamicCodingKey("channel"))
        try container.encode(protocolVersion, forKey: DynamicCodingKey("protocolVersion"))
        try container.encode(instanceId, forKey: DynamicCodingKey("instanceId"))
        try container.encode(type, forKey: DynamicCodingKey("type"))
        try container.encodeIfPresent(requestId, forKey: DynamicCodingKey("requestId"))
        for (key, value) in payload {
            try container.encode(value, forKey: DynamicCodingKey(key))
        }
    }
}
