import SwiftUI

public struct LoginView: View {
    @Bindable var session: AuthSession
    @State private var email = ""
    @State private var password = ""

    public init(session: AuthSession) {
        self.session = session
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .mobileEmailInput()
                    SecureField("Password", text: $password)
                        .mobilePasswordInput()
                }

                if let error = session.lastError {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task {
                            await session.login(email: email, password: password)
                        }
                    } label: {
                        HStack {
                            Text("Sign In")
                            Spacer()
                            if session.isLoading {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(email.nonEmpty == nil || password.isEmpty || session.isLoading)
                }
            }
            .navigationTitle("XpertAI")
        }
    }
}
