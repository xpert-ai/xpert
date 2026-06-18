// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "XpertAI",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "XpertAI", targets: ["XpertAI"])
    ],
    dependencies: [
        .package(
            url: "https://github.com/socketio/socket.io-client-swift",
            .upToNextMinor(from: "16.1.1")
        )
    ],
    targets: [
        .target(
            name: "XpertAI",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift")
            ],
            path: "Sources/XpertAI",
            exclude: [
                "App/XpertAIApp.swift",
                "Info.plist"
            ]
        ),
        .testTarget(
            name: "XpertAITests",
            dependencies: ["XpertAI"],
            path: "Tests/XpertAITests"
        )
    ]
)
