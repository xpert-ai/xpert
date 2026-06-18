import SwiftUI

public struct SettingsView: View {
    @Bindable var session: AuthSession

    public init(session: AuthSession) {
        self.session = session
    }

    public var body: some View {
        List {
            if let user = session.user {
                Section("Account") {
                    LabeledContent("Name", value: user.fullName?.nonEmpty ?? user.name?.nonEmpty ?? user.email ?? user.id)
                    if let email = user.email {
                        LabeledContent("Email", value: email)
                    }
                }
            }

            Section("Organization") {
                ForEach(session.organizations) { organization in
                    Button {
                        Task {
                            await session.selectOrganization(organization)
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(organization.name)
                                if organization.isDefault {
                                    Text("Default")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if organization.id == session.activeOrganizationId {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    session.logout()
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .navigationTitle("Settings")
    }
}
