import Foundation
import XCTest
@testable import XpertAI

final class RemoteComponentMessageTests: XCTestCase {
    func testAcceptsProtocolV1Envelope() throws {
        let message = RemoteComponentMessage(jsonObject: [
            "channel": "xpertai.remote_component",
            "protocolVersion": 1,
            "instanceId": "view:1",
            "type": "requestData",
            "requestId": "request-1",
            "query": [
                "page": 1,
                "search": "invoice"
            ]
        ])

        XCTAssertEqual(message?.type, "requestData")
        XCTAssertEqual(message?.requestId, "request-1")
        XCTAssertEqual(message?.object("query")?["search"]?.stringValue, "invoice")
    }

    func testRejectsWrongChannelAndVersion() {
        XCTAssertNil(RemoteComponentMessage(jsonObject: [
            "channel": "other",
            "protocolVersion": 1,
            "type": "requestData"
        ]))
        XCTAssertNil(RemoteComponentMessage(jsonObject: [
            "channel": "xpertai.remote_component",
            "protocolVersion": 2,
            "type": "requestData"
        ]))
    }
}
