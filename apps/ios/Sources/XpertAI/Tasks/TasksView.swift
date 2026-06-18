import SwiftUI

public struct TasksView: View {
    let session: AuthSession
    @State private var tasks: [XpertTaskSummary] = []
    @State private var loading = false
    @State private var error: String?

    public init(session: AuthSession) {
        self.session = session
    }

    public var body: some View {
        List {
            if loading {
                ProgressView()
            }
            ForEach(tasks) { task in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(task.displayTitle)
                                .font(.headline)
                            Text(task.status ?? "unknown")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Menu {
                            Button("Schedule") {
                                Task { await schedule(task) }
                            }
                            Button("Pause") {
                                Task { await pause(task) }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .overlay {
            if !loading && tasks.isEmpty {
                ContentUnavailableView("No scheduled tasks", systemImage: "calendar.badge.clock")
            }
        }
        .navigationTitle("Tasks")
        .task {
            await load()
        }
        .refreshable {
            await load()
        }
        .alert("Task error", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            tasks = try await session.apiClient.tasks().items
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func schedule(_ task: XpertTaskSummary) async {
        do {
            _ = try await session.apiClient.scheduleTask(id: task.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func pause(_ task: XpertTaskSummary) async {
        do {
            _ = try await session.apiClient.pauseTask(id: task.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
