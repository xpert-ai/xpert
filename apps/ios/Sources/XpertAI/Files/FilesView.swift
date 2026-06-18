import SwiftUI
import UniformTypeIdentifiers

public struct FilesView: View {
    let session: AuthSession
    let xpert: XpertSummary?
    @State private var files: [MemoryFileItem] = []
    @State private var loading = false
    @State private var error: String?
    @State private var selectedFile: MemoryFileItem?
    @State private var fileContent = ""
    @State private var importing = false

    public init(session: AuthSession, xpert: XpertSummary?) {
        self.session = session
        self.xpert = xpert
    }

    public var body: some View {
        Group {
            if let xpert {
                List {
                    if loading {
                        ProgressView()
                    }
                    ForEach(files) { file in
                        FileListItem(
                            file: file,
                            open: { Task { await open(file) } },
                            delete: { Task { await delete(file) } }
                        )
                    }
                }
                .overlay {
                    if !loading && files.isEmpty {
                        ContentUnavailableView("No files", systemImage: "folder")
                    }
                }
                .toolbar {
                    Button {
                        importing = true
                    } label: {
                        Label("Upload", systemImage: "square.and.arrow.up")
                    }
                }
                .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
                    Task {
                        await handleImport(result, xpert: xpert)
                    }
                }
                .sheet(item: $selectedFile) { file in
                    editorSheet(file: file)
                }
                .task {
                    await load(xpert)
                }
                .refreshable {
                    await load(xpert)
                }
            } else {
                ContentUnavailableView("Select an assistant", systemImage: "sparkles")
            }
        }
        .navigationTitle("Files")
        .alert("File error", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }

    private func load(_ xpert: XpertSummary) async {
        loading = true
        defer { loading = false }
        do {
            files = try await session.apiClient.files(xpertId: xpert.id)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func open(_ file: MemoryFileItem) async {
        guard let xpert else { return }
        do {
            fileContent = try await session.apiClient.readFile(xpertId: xpert.id, path: file.path)
            selectedFile = file
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save(_ file: MemoryFileItem, xpert: XpertSummary) async {
        do {
            try await session.apiClient.saveFile(xpertId: xpert.id, path: file.path, content: fileContent)
            selectedFile = nil
            await load(xpert)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ file: MemoryFileItem) async {
        guard let xpert else { return }
        do {
            try await session.apiClient.deleteFile(xpertId: xpert.id, path: file.path)
            await load(xpert)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func handleImport(_ result: Result<[URL], Error>, xpert: XpertSummary) async {
        do {
            guard let url = try result.get().first else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer {
                if scoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }
            try await session.apiClient.uploadFile(xpertId: xpert.id, fileURL: url)
            await load(xpert)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func editorSheet(file: MemoryFileItem) -> some View {
        FileEditorView(file: file, content: $fileContent) {
            Task {
                guard let xpert else { return }
                await save(file, xpert: xpert)
            }
        }
    }
}

private struct FileRow: View {
    let file: MemoryFileItem

    var body: some View {
        HStack {
            Image(systemName: "doc.text")
            VStack(alignment: .leading) {
                Text(file.name?.nonEmpty ?? file.path)
                if let size = file.size {
                    Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct FileListItem: View {
    let file: MemoryFileItem
    let open: () -> Void
    let delete: () -> Void

    var body: some View {
        Button(action: open) {
            FileRow(file: file)
        }
        #if os(iOS)
        .swipeActions {
            Button(role: .destructive, action: delete) {
                Label("Delete", systemImage: "trash")
            }
        }
        #endif
    }
}

private struct FileEditorView: View {
    let file: MemoryFileItem
    @Binding var content: String
    let save: () -> Void

    var body: some View {
        NavigationStack {
            TextEditor(text: $content)
                .font(.system(.body, design: .monospaced))
                .navigationTitle(file.name?.nonEmpty ?? file.path)
                .toolbar {
                    Button("Save", action: save)
                }
        }
    }
}
