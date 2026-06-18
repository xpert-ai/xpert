import SwiftUI

public struct NativeExtensionViewRenderer: View {
    let manifest: XpertExtensionViewManifest
    let data: XpertViewDataResult?

    public init(manifest: XpertExtensionViewManifest, data: XpertViewDataResult?) {
        self.manifest = manifest
        self.data = data
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                switch manifest.view.type {
                case "stats":
                    statsView
                case "table":
                    tableView
                case "list":
                    listView
                case "detail":
                    detailView
                default:
                    rawJSONView
                }
            }
            .padding()
        }
    }

    private var statsView: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
            ForEach(manifest.view.items ?? []) { field in
                VStack(alignment: .leading, spacing: 8) {
                    Text(field.label.display())
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(value(for: field.key, in: data?.summary ?? data?.item ?? [:]))
                        .font(.title3.bold())
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var tableView: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(data?.items ?? [], id: \.self) { row in
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(manifest.view.columns ?? []) { column in
                        LabeledContent(column.label.display(), value: value(for: column.key, in: row))
                    }
                }
                .padding()
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var listView: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(data?.items ?? [], id: \.self) { row in
                VStack(alignment: .leading, spacing: 6) {
                    if let titleKey = manifest.view.item?.titleKey {
                        Text(value(for: titleKey, in: row))
                            .font(.headline)
                    }
                    if let subtitleKey = manifest.view.item?.subtitleKey {
                        Text(value(for: subtitleKey, in: row))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let descriptionKey = manifest.view.item?.descriptionKey {
                        Text(value(for: descriptionKey, in: row))
                            .font(.body)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var detailView: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(manifest.view.fields ?? []) { field in
                LabeledContent(field.label.display(), value: value(for: field.key, in: data?.item ?? [:]))
            }
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var rawJSONView: some View {
        Text(encodedJSON(data) ?? "{}")
            .font(.system(.caption, design: .monospaced))
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }

    private func value(for key: String, in object: [String: JSONValue]) -> String {
        guard let value = object[key] else {
            return "-"
        }
        switch value {
        case .string(let value):
            return value
        case .number(let value):
            return value.rounded() == value ? String(Int(value)) : String(value)
        case .bool(let value):
            return value ? "Yes" : "No"
        case .null:
            return "-"
        case .object, .array:
            return encodedJSON(value) ?? "-"
        }
    }

    private func encodedJSON(_ value: Encodable?) -> String? {
        guard let value else { return nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(value) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
}
