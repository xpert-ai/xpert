import AppKit
import ApplicationServices
import ScreenCaptureKit

struct Failure: Error {
  let code: String
  init(_ code: String) { self.code = code }
}
struct Candidate {
  let window: SCWindow
  let ax: AXUIElement
  let app: NSRunningApplication
  let title: String
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var result: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else {
    return nil
  }
  return result
}
func bounds(_ element: AXUIElement) -> CGRect? {
  guard let pos = attribute(element, kAXPositionAttribute), CFGetTypeID(pos) == AXValueGetTypeID(),
    let size = attribute(element, kAXSizeAttribute), CFGetTypeID(size) == AXValueGetTypeID()
  else { return nil }
  var origin = CGPoint.zero
  var extent = CGSize.zero
  guard AXValueGetValue(pos as! AXValue, .cgPoint, &origin),
    AXValueGetValue(size as! AXValue, .cgSize, &extent)
  else { return nil }
  return CGRect(origin: origin, size: extent)
}
func permissions() -> [String: Bool] {
  ["accessibility": AXIsProcessTrusted(), "screen": CGPreflightScreenCaptureAccess()]
}
@MainActor
final class WindowControl {
  var offered: [CGWindowID: Candidate] = [:]
  var chosen: Candidate?
  var snapshot = ""
  var elements: [AXUIElement] = []

  func candidates(only id: CGWindowID? = nil) async throws -> [Candidate] {
    guard permissions().values.allSatisfy({ $0 }) else { throw Failure("Permissions required") }
    let content = try await SCShareableContent.excludingDesktopWindows(
      true, onScreenWindowsOnly: true)
    let windows = content.windows.filter { $0.windowLayer == 0 && !$0.frame.isEmpty }
    var found: [Candidate] = []
    for window in windows where id == nil || window.windowID == id {
      guard let owner = window.owningApplication,
        let app = NSRunningApplication(processIdentifier: owner.processID),
        app.activationPolicy == .regular, let title = window.title, !title.isEmpty
      else { continue }
      // Pair public AX and ScreenCaptureKit identities only when the match is one-to-one.
      let matches = windows.filter {
        $0.owningApplication?.processID == owner.processID && $0.title == title
          && $0.frame == window.frame
      }
      guard matches.count == 1 else { continue }
      let appAX = AXUIElementCreateApplication(owner.processID)
      let axWindows = attribute(appAX, kAXWindowsAttribute) as? [AXUIElement] ?? []
      let matched = axWindows.filter {
        attribute($0, kAXTitleAttribute) as? String == title && bounds($0) == window.frame
      }
      if matched.count == 1 {
        found.append(Candidate(window: window, ax: matched[0], app: app, title: title))
      }
    }
    return found
  }
  func current() async throws -> Candidate {
    guard let chosen, !chosen.app.isTerminated,
      let item = try await candidates(only: chosen.window.windowID).first(where: {
        $0.window.windowID == chosen.window.windowID && CFEqual($0.ax, chosen.ax)
          && $0.app.processIdentifier == chosen.app.processIdentifier
      })
    else { throw Failure("Window changed") }
    if let children = attribute(item.ax, kAXChildrenAttribute) as? [AXUIElement],
      children.contains(where: { attribute($0, kAXRoleAttribute) as? String == kAXSheetRole })
    {
      throw Failure("Window changed")
    }
    return item
  }
  func observe() async throws -> [String: Any] {
    let item = try await current()
    snapshot = ""
    elements.removeAll()
    let filter = SCContentFilter(desktopIndependentWindow: item.window)
    let config = SCStreamConfiguration()
    let ratio = min(1, 1024 / max(item.window.frame.width, item.window.frame.height))
    config.width = max(1, Int(item.window.frame.width * ratio))
    config.height = max(1, Int(item.window.frame.height * ratio))
    config.showsCursor = false
    let image: CGImage
    do {
      image = try await SCScreenshotManager.captureImage(
        contentFilter: filter, configuration: config)
    } catch { throw Failure("Window capture failed (\((error as NSError).code))") }
    guard
      let data = NSBitmapImageRep(cgImage: image).representation(
        using: .jpeg, properties: [.compressionFactor: 0.55]),
      data.count <= 256 * 1024
    else { throw Failure("Window image too large") }
    _ = try await current()
    var rows: [[String: Any]] = []
    var queue = [item.ax]
    var index = 0
    while index < queue.count && index < 160 {
      let el = queue[index]
      index += 1
      let role = attribute(el, kAXRoleAttribute) as? String ?? ""
      let subrole = attribute(el, kAXSubroleAttribute) as? String ?? ""
      if subrole == kAXSecureTextFieldSubrole { continue }
      let label = attribute(el, kAXTitleAttribute) as? String ?? ""
      let value = attribute(el, kAXValueAttribute) as? String ?? ""
      elements.append(el)
      rows.append([
        "id": elements.count - 1, "role": role, "label": String(label.prefix(160)),
        "value": String(value.prefix(2000)),
      ])
      let children = attribute(el, kAXChildrenAttribute) as? [AXUIElement] ?? []
      queue.append(contentsOf: children.prefix(max(0, 160 - queue.count)))
    }
    snapshot = UUID().uuidString
    return ["snapshot": snapshot, "elements": rows, "image": data.base64EncodedString()]
  }
  func execute(_ input: [String: Any]) async throws -> [String: Any] {
    let action = input["action"] as? String
    switch action {
    case "status": return permissions()
    case "requestScreenPermission": return ["screen": CGRequestScreenCaptureAccess()]
    case "windows":
      let choices = try await candidates()
      offered = Dictionary(uniqueKeysWithValues: choices.map { ($0.window.windowID, $0) })
      return [
        "windows": choices.map {
          ["id": $0.window.windowID, "title": $0.title, "app": $0.app.localizedName ?? ""]
            as [String: Any]
        }
      ]
    case "select":
      guard chosen == nil, let id = input["window"] as? UInt32,
        let item = offered[id],
        input["title"] as? String == item.title
      else { throw Failure("Window changed") }
      offered.removeAll()
      chosen = item
      return try await observe()
    case "observe": return try await observe()
    default:
      let item = try await current()
      guard !snapshot.isEmpty, input["snapshot"] as? String == snapshot,
        let index = input["element"] as? Int, elements.indices.contains(index)
      else { throw Failure("Observe again") }
      snapshot = ""
      let element = elements[index]
      guard let owner = attribute(element, kAXWindowAttribute), CFEqual(owner, item.ax),
        attribute(element, kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole
      else { throw Failure("Window changed") }
      let result: AXError
      switch action {
      case "type":
        guard let text = input["text"] as? String, !text.isEmpty, text.utf8.count <= 8192,
          [kAXTextAreaRole, kAXTextFieldRole].contains(
            attribute(element, kAXRoleAttribute) as? String ?? "")
        else { throw Failure("Unsupported window action") }
        result = AXUIElementSetAttributeValue(
          element, kAXSelectedTextAttribute as CFString, text as CFString)
      case "click": result = AXUIElementPerformAction(element, kAXPressAction as CFString)
      case "scroll":
        let inc = input["direction"] as? String == "down"
        guard ["up", "down"].contains(input["direction"] as? String ?? ""),
          attribute(element, kAXRoleAttribute) as? String == kAXScrollBarRole,
          attribute(element, kAXOrientationAttribute) as? String == kAXVerticalOrientationValue
        else { throw Failure("Unsupported window action") }
        result = AXUIElementPerformAction(
          element, (inc ? kAXIncrementAction : kAXDecrementAction) as CFString)
      default: throw Failure("Unsupported window action")
      }
      guard result == .success else {
        throw Failure("Window action was not confirmed; observe again")
      }
      return ["applied": true]
    }
  }
}

@main struct Helper {
  @MainActor static func main() async {
    NSApplication.shared.setActivationPolicy(.prohibited)
    let control = WindowControl()
    while let line = await Task.detached(operation: { readLine() }).value {
      let response: [String: Any]
      do {
        guard
          let request = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
        else { throw Failure("Invalid input") }
        response = ["value": try await control.execute(request)]
      } catch { response = ["error": (error as? Failure)?.code ?? "Window is unavailable"] }
      if let data = try? JSONSerialization.data(withJSONObject: response) {
        FileHandle.standardOutput.write(data + Data([10]))
      }
    }
  }
}
