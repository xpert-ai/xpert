import Foundation
import XCTest
@testable import XpertAI

final class APIClientTests: XCTestCase {
    func testInjectsTenantOrganizationAndLanguageHeaders() throws {
        let store = InMemoryCredentialStore(credentials: SessionCredentials(
            accessToken: "jwt-token",
            refreshToken: "refresh-token",
            tenantId: "tenant-1",
            organizationId: "org-1"
        ))
        let client = APIClient(
            configuration: AppConfiguration(baseURL: URL(string: "https://api.example.com")!),
            credentialStore: store,
            languageCode: "zh-Hans"
        )

        let request = try client.makeURLRequest(path: "/api/mobile/bootstrap")

        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Tenant-Id"), "tenant-1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Organization-Id"), "org-1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Scope-Level"), "organization")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Language"), "zh-Hans")
    }

    func testPersistsOrganizationSwitch() throws {
        let store = InMemoryCredentialStore(credentials: SessionCredentials(
            accessToken: "jwt-token",
            refreshToken: "refresh-token",
            tenantId: "tenant-1"
        ))
        let client = APIClient(
            configuration: AppConfiguration(baseURL: URL(string: "https://api.example.com")!),
            credentialStore: store
        )

        try client.setActiveOrganizationId("org-2")

        XCTAssertEqual(try store.loadCredentials()?.organizationId, "org-2")
        XCTAssertEqual(try client.makeURLRequest(path: "/api/mobile/xperts").value(forHTTPHeaderField: "Organization-Id"), "org-2")
    }
}
