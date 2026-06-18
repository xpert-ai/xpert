import SwiftUI

public struct AssistantWorkspaceView: View {
    @Bindable var session: AuthSession
    let xpert: XpertSummary
    @State private var selectedMode: WorkspaceMode = .chat

    public init(session: AuthSession, xpert: XpertSummary) {
        self.session = session
        self.xpert = xpert
    }

    public var body: some View {
        VStack(spacing: 0) {
            Picker("Mode", selection: $selectedMode) {
                ForEach(WorkspaceMode.allCases) { mode in
                    Label(mode.title, systemImage: mode.systemImage).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            Group {
                switch selectedMode {
                case .chat:
                    ChatKitWebView(session: session, xpert: xpert)
                case .views:
                    ExtensionViewsView(session: session, xpert: xpert)
                case .files:
                    FilesView(session: session, xpert: xpert)
                case .terminal:
                    TerminalView(session: session)
                }
            }
        }
        .navigationTitle(xpert.displayTitle)
        .mobileInlineNavigationTitle()
        .onAppear {
            session.selectedXpert = xpert
        }
    }
}

private enum WorkspaceMode: String, CaseIterable, Identifiable {
    case chat
    case views
    case files
    case terminal

    var id: String { rawValue }

    var title: String {
        switch self {
        case .chat:
            return "Chat"
        case .views:
            return "Views"
        case .files:
            return "Files"
        case .terminal:
            return "Terminal"
        }
    }

    var systemImage: String {
        switch self {
        case .chat:
            return "message"
        case .views:
            return "rectangle.grid.2x2"
        case .files:
            return "folder"
        case .terminal:
            return "terminal"
        }
    }
}
