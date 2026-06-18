import SwiftUI

public struct RootView: View {
    @Bindable var session: AuthSession

    public init(session: AuthSession) {
        self.session = session
    }

    public var body: some View {
        Group {
            switch session.state {
            case .restoring:
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .signedOut:
                LoginView(session: session)
            case .signedIn:
                AppShellView(session: session)
            }
        }
    }
}

public enum AppTab: String, CaseIterable, Identifiable, Hashable {
    case assistants
    case tasks
    case files
    case terminal
    case settings

    public var id: String { rawValue }

    @ViewBuilder
    func label() -> some View {
        switch self {
        case .assistants:
            Label("Assistants", systemImage: "sparkles")
        case .tasks:
            Label("Tasks", systemImage: "calendar.badge.clock")
        case .files:
            Label("Files", systemImage: "folder")
        case .terminal:
            Label("Terminal", systemImage: "terminal")
        case .settings:
            Label("Settings", systemImage: "gearshape")
        }
    }
}

public enum AppRoute: Hashable {
    case assistant(String)
    case extensionView(xpertId: String, viewKey: String)
}

public struct AppShellView: View {
    @Bindable var session: AuthSession
    @State private var selectedTab: AppTab = .assistants
    @State private var assistantsPath: [AppRoute] = []
    @State private var tasksPath: [AppRoute] = []
    @State private var filesPath: [AppRoute] = []
    @State private var terminalPath: [AppRoute] = []
    @State private var settingsPath: [AppRoute] = []

    public init(session: AuthSession) {
        self.session = session
    }

    public var body: some View {
        TabView(selection: $selectedTab) {
            tabStack(path: $assistantsPath) {
                AssistantsView(session: session)
            }
            .tabItem { AppTab.assistants.label() }
            .tag(AppTab.assistants)

            tabStack(path: $tasksPath) {
                TasksView(session: session)
            }
            .tabItem { AppTab.tasks.label() }
            .tag(AppTab.tasks)

            tabStack(path: $filesPath) {
                FilesView(session: session, xpert: session.selectedXpert)
            }
            .tabItem { AppTab.files.label() }
            .tag(AppTab.files)

            tabStack(path: $terminalPath) {
                TerminalView(session: session)
            }
            .tabItem { AppTab.terminal.label() }
            .tag(AppTab.terminal)

            tabStack(path: $settingsPath) {
                SettingsView(session: session)
            }
            .tabItem { AppTab.settings.label() }
            .tag(AppTab.settings)
        }
        .onChange(of: session.activeOrganizationId) {
            assistantsPath = []
            tasksPath = []
            filesPath = []
            terminalPath = []
            settingsPath = []
        }
    }

    private func tabStack<Content: View>(path: Binding<[AppRoute]>, @ViewBuilder content: () -> Content) -> some View {
        NavigationStack(path: path) {
            content()
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .assistant(let id):
                        if let xpert = session.xperts.first(where: { $0.id == id }) {
                            AssistantWorkspaceView(session: session, xpert: xpert)
                        } else {
                            ContentUnavailableView("Assistant unavailable", systemImage: "sparkles")
                        }
                    case .extensionView(let xpertId, let viewKey):
                        ExtensionViewDetail(session: session, xpertId: xpertId, viewKey: viewKey)
                    }
                }
        }
    }
}
