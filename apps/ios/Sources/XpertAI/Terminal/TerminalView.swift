import SwiftUI

public struct TerminalView: View {
    let session: AuthSession
    @State private var client: TerminalSocketClient

    public init(session: AuthSession) {
        self.session = session
        _client = State(initialValue: TerminalSocketClient(apiClient: session.apiClient))
    }

    public var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    TextField("Conversation ID", text: $client.conversationId)
                        .mobileNoAutocapitalization()
                    HStack {
                        Button(client.connected ? "Open" : "Connect") {
                            if client.connected {
                                client.open()
                            } else {
                                client.connect()
                            }
                        }
                        Button("Close", role: .destructive) {
                            client.close()
                        }
                    }
                }
            }
            .frame(maxHeight: 150)

            ScrollView {
                Text(client.lines.joined(separator: "\n"))
                    .font(.system(.caption, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .background(Color.black)
            .foregroundStyle(Color.green)

            HStack {
                TextField("Input", text: $client.input)
                    .textFieldStyle(.roundedBorder)
                Button {
                    client.sendInput()
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
        .navigationTitle("Terminal")
        .alert("Terminal error", isPresented: Binding(get: { client.error != nil }, set: { if !$0 { client.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(client.error ?? "")
        }
        .onDisappear {
            client.close()
        }
    }
}
