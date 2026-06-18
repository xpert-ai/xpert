import SwiftUI

public extension View {
    @ViewBuilder
    func mobileInlineNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    @ViewBuilder
    func mobileEmailInput() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never)
            .keyboardType(.emailAddress)
            .textContentType(.username)
        #else
        self
        #endif
    }

    @ViewBuilder
    func mobilePasswordInput() -> some View {
        #if os(iOS)
        textContentType(.password)
        #else
        self
        #endif
    }

    @ViewBuilder
    func mobileNoAutocapitalization() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never)
        #else
        self
        #endif
    }
}
