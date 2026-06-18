import SwiftUI

public struct AssistantsView: View {
    @Bindable var session: AuthSession
    @State private var search = ""
    @State private var loading = false

    public init(session: AuthSession) {
        self.session = session
    }

    public var body: some View {
        List {
            if loading && session.xperts.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }

            ForEach(session.xperts) { xpert in
                NavigationLink(value: AppRoute.assistant(xpert.id)) {
                    AssistantRow(xpert: xpert, selected: xpert.id == session.selectedXpert?.id)
                }
            }
        }
        .overlay {
            if !loading && session.xperts.isEmpty {
                ContentUnavailableView("No assistants", systemImage: "sparkles")
            }
        }
        .navigationTitle("Assistants")
        .searchable(text: $search)
        .refreshable {
            await load()
        }
        .task {
            await load()
        }
        .task(id: search) {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await load()
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            try await session.loadXperts(search: search.nonEmpty)
        } catch {
            session.lastError = error.localizedDescription
        }
    }
}

private struct AssistantRow: View {
    let xpert: XpertSummary
    let selected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: selected ? "sparkles.square.filled.on.square" : "sparkles")
                .font(.title3)
                .foregroundStyle(selected ? Color.accentColor : Color.secondary)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 4) {
                Text(xpert.displayTitle)
                    .font(.headline)
                if let description = xpert.description?.nonEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
