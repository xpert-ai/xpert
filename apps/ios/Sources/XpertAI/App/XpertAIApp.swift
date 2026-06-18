import SwiftUI

@main
struct XpertAIApp: App {
    @State private var session: AuthSession

    init() {
        let configuration = AppConfiguration.fromBundle()
        let store = KeychainCredentialStore(service: "ai.xpert.mobile")
        _session = State(initialValue: AuthSession(apiClient: APIClient(configuration: configuration, credentialStore: store)))
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session)
                .task {
                    await session.restore()
                }
        }
    }
}
