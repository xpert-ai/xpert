import SwiftUI

public struct ExtensionViewsView: View {
    let session: AuthSession
    let xpert: XpertSummary
    @State private var manifests: [XpertExtensionViewManifest] = []
    @State private var selectedViewKey: String?
    @State private var data: XpertViewDataResult?
    @State private var loading = false
    @State private var dataLoading = false
    @State private var error: String?

    public init(session: AuthSession, xpert: XpertSummary) {
        self.session = session
        self.xpert = xpert
    }

    public var body: some View {
        Group {
            if loading && manifests.isEmpty {
                ProgressView()
            } else if let error, manifests.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load views", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry") {
                        Task { await loadManifests() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else if manifests.isEmpty {
                ContentUnavailableView("No extension views", systemImage: "rectangle.grid.2x2")
            } else {
                VStack(spacing: 0) {
                    ExtensionViewSelector(
                        manifests: manifests,
                        selectedViewKey: selectedViewKey,
                        onSelect: select
                    )
                    .padding(.horizontal)
                    .padding(.bottom, 8)

                    Divider()

                    if let selectedManifest {
                        selectedViewBody(for: selectedManifest)
                    } else {
                        ContentUnavailableView("View unavailable", systemImage: "rectangle.grid.2x2")
                    }
                }
            }
        }
        .task {
            await loadManifests()
        }
        .refreshable {
            await loadManifests()
        }
        .task(id: selectedViewKey) {
            await loadDataForSelectedView()
        }
    }

    @ViewBuilder
    private func selectedViewBody(for manifest: XpertExtensionViewManifest) -> some View {
        ZStack {
            if manifest.view.type == "remote_component" {
                RemoteComponentWebView(session: session, hostType: "agent", hostId: xpert.id, manifest: manifest)
                    .id(manifest.key)
            } else {
                NativeExtensionViewRenderer(manifest: manifest, data: data)
                    .refreshable {
                        await loadDataForSelectedView()
                    }
            }

            if dataLoading {
                ProgressView()
                    .padding()
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var selectedManifest: XpertExtensionViewManifest? {
        manifests.first { $0.key == selectedViewKey } ?? manifests.first
    }

    private func loadManifests() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let loaded = try await session.apiClient.slotViews(
                hostType: "agent",
                hostId: xpert.id,
                slot: "agent.workbench.main"
            )
            manifests = loaded.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
            if selectedViewKey.flatMap({ key in manifests.first { $0.key == key } }) == nil {
                selectedViewKey = manifests.first?.key
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadDataForSelectedView() async {
        guard let selectedManifest, selectedManifest.view.type != "remote_component" else {
            data = nil
            return
        }

        dataLoading = true
        defer { dataLoading = false }
        do {
            data = try await session.apiClient.viewData(
                hostType: "agent",
                hostId: xpert.id,
                viewKey: selectedManifest.key,
                query: XpertViewQuery(page: 1, pageSize: 50)
            )
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func select(_ manifest: XpertExtensionViewManifest) {
        guard selectedViewKey != manifest.key else {
            return
        }
        data = nil
        error = nil
        selectedViewKey = manifest.key
    }
}

private struct ExtensionViewSelector: View {
    let manifests: [XpertExtensionViewManifest]
    let selectedViewKey: String?
    let onSelect: (XpertExtensionViewManifest) -> Void

    private let maxVisibleTabs = 3

    var body: some View {
        HStack(spacing: 8) {
            ForEach(visibleManifests) { manifest in
                Button {
                    onSelect(manifest)
                } label: {
                    Label(manifest.title.display(), systemImage: icon(for: manifest.view.type))
                        .lineLimit(1)
                }
                .buttonStyle(ExtensionViewTabButtonStyle(isSelected: manifest.key == selectedViewKey))
            }

            if !overflowManifests.isEmpty {
                Menu {
                    ForEach(overflowMenuManifests) { manifest in
                        Button {
                            onSelect(manifest)
                        } label: {
                            if manifest.key == selectedViewKey {
                                Label(manifest.title.display(), systemImage: "checkmark")
                            } else {
                                Label(manifest.title.display(), systemImage: icon(for: manifest.view.type))
                            }
                        }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                        .lineLimit(1)
                }
                .buttonStyle(ExtensionViewTabButtonStyle(isSelected: isSelectedInOverflow))
            }

            Spacer(minLength: 0)
        }
        .padding(.top, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var visibleManifests: [XpertExtensionViewManifest] {
        guard manifests.count > maxVisibleTabs + 1 else {
            return manifests
        }

        var visible = Array(manifests.prefix(maxVisibleTabs))
        if let selected = selectedManifest, !visible.contains(where: { $0.key == selected.key }) {
            visible[maxVisibleTabs - 1] = selected
        }
        return visible
    }

    private var overflowManifests: [XpertExtensionViewManifest] {
        let visibleKeys = Set(visibleManifests.map(\.key))
        return manifests.filter { !visibleKeys.contains($0.key) }
    }

    private var overflowMenuManifests: [XpertExtensionViewManifest] {
        manifests.count > maxVisibleTabs + 1 ? manifests : overflowManifests
    }

    private var selectedManifest: XpertExtensionViewManifest? {
        manifests.first { $0.key == selectedViewKey }
    }

    private var isSelectedInOverflow: Bool {
        guard let selectedViewKey else {
            return false
        }
        return overflowManifests.contains { $0.key == selectedViewKey }
    }

    private func icon(for type: String) -> String {
        switch type {
        case "stats":
            return "chart.bar"
        case "table":
            return "tablecells"
        case "list":
            return "list.bullet"
        case "detail":
            return "doc.text"
        case "remote_component":
            return "safari"
        default:
            return "curlybraces"
        }
    }
}

private struct ExtensionViewTabButtonStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(isSelected ? .semibold : .regular))
            .foregroundStyle(isSelected ? Color.accentColor : .primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background {
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.accentColor.opacity(0.35) : Color.secondary.opacity(0.12))
            }
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

public struct ExtensionViewDetail: View {
    let session: AuthSession
    let xpertId: String
    let viewKey: String
    @State private var manifest: XpertExtensionViewManifest?
    @State private var data: XpertViewDataResult?
    @State private var loading = false
    @State private var error: String?

    public init(session: AuthSession, xpertId: String, viewKey: String) {
        self.session = session
        self.xpertId = xpertId
        self.viewKey = viewKey
    }

    public var body: some View {
        Group {
            if let manifest {
                if manifest.view.type == "remote_component" {
                    RemoteComponentWebView(session: session, hostType: "agent", hostId: xpertId, manifest: manifest)
                } else {
                    NativeExtensionViewRenderer(manifest: manifest, data: data)
                        .refreshable {
                            await loadData()
                        }
                }
            } else if loading {
                ProgressView()
            } else {
                ContentUnavailableView("View unavailable", systemImage: "rectangle.grid.2x2")
            }
        }
        .navigationTitle(manifest?.title.display() ?? "View")
        .mobileInlineNavigationTitle()
        .task {
            await load()
        }
        .alert("View error", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let views = try await session.apiClient.slotViews(
                hostType: "agent",
                hostId: xpertId,
                slot: "agent.workbench.main"
            )
            manifest = views.first(where: { $0.key == viewKey })
            if manifest?.view.type != "remote_component" {
                await loadData()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadData() async {
        do {
            data = try await session.apiClient.viewData(
                hostType: "agent",
                hostId: xpertId,
                viewKey: viewKey,
                query: XpertViewQuery(page: 1, pageSize: 50)
            )
        } catch {
            self.error = error.localizedDescription
        }
    }
}
