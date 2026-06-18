import Foundation
import XCTest
@testable import XpertAI

final class ModelDecodingTests: XCTestCase {
    func testDecodesBootstrap() throws {
        let json = """
        {
          "deployment": {
            "apiBaseUrl": "https://api.example.com",
            "apiBasePath": "/api",
            "aiApiPath": "/api/ai",
            "chatkitFrameUrl": "/chatkit",
            "viewHostsPath": "/api/view-hosts",
            "socketNamespaces": { "sandboxTerminal": "sandbox-terminal" },
            "capabilities": {
              "chatkit": true,
              "extensionViews": true,
              "scheduledTasks": true,
              "fileMemory": true,
              "sandboxTerminal": true,
              "publicChatkitSessions": true
            }
          },
          "user": { "id": "user-1", "tenantId": "tenant-1", "email": "person@example.com" },
          "organizations": [
            { "id": "org-1", "tenantId": "tenant-1", "name": "Org", "isDefault": true, "isActive": true }
          ],
          "activeOrganizationId": "org-1",
          "defaultOrganizationId": "org-1",
          "assistantBindings": []
        }
        """

        let bootstrap = try JSONDecoder().decode(MobileBootstrap.self, from: Data(json.utf8))

        XCTAssertEqual(bootstrap.deployment.aiApiPath, "/api/ai")
        XCTAssertEqual(bootstrap.organizations.first?.name, "Org")
        XCTAssertEqual(bootstrap.deployment.socketNamespaces.sandboxTerminal, "sandbox-terminal")
    }

    func testDecodesViewManifestAndJSONValues() throws {
        let json = """
        {
          "key": "review",
          "title": { "en_US": "Review", "zh_Hans": "审核" },
          "hostType": "agent",
          "slot": "main",
          "view": {
            "type": "table",
            "columns": [
              { "key": "name", "label": { "en_US": "Name" }, "dataType": "text" }
            ]
          },
          "dataSource": { "mode": "platform" }
        }
        """

        let manifest = try JSONDecoder().decode(XpertExtensionViewManifest.self, from: Data(json.utf8))

        XCTAssertEqual(manifest.key, "review")
        XCTAssertEqual(manifest.view.type, "table")
        XCTAssertEqual(manifest.view.columns?.first?.key, "name")
        XCTAssertEqual(manifest.title.display(locale: Locale(identifier: "zh-Hans")), "审核")
    }
}
