// menu-ax-helper.swift
//
// W0-SHELL-MENU-P/F 原生菜单验收助手（macOS）。
//
// 使用 ApplicationServices 的 AX C API 直接读取/操作目标应用的 NSMenu 树，
// 不依赖 osascript / System Events：本机实测 System Events 在本会话下会返回
// -10004 权限违例，而同进程直接调用 AX API 可用（与 ui-shell/ax-shell-helper.swift
// 一致）。所有结果以 JSON 写入调用方指定路径，便于验收脚本归档与断言。
//
// 用法：
//   menu-ax-helper tree  <out.json>
//   menu-ax-helper state <out.json>
//   menu-ax-helper click <out.json> <一级菜单标题> <菜单项标题>
//   menu-ax-helper key   <out.json> <escape|cmd-k|cmd-comma|cmd-o|cmd-n|cmd-w|cmd-r>
//   menu-ax-helper window <out.json> <minimize|zoom|fullscreen|close>
import AppKit
import ApplicationServices
import Darwin
import Foundation

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : ""
let bundleIdentifier = "com.vinkey.desktop"
let processName = "Vinkey"

// MARK: - AX 基础工具

func axAttr<T>(_ el: AXUIElement, _ key: String) -> T? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success, let value = v else { return nil }
    return value as? T
}
func children(of el: AXUIElement) -> [AXUIElement] { axAttr(el, kAXChildrenAttribute) ?? [] }
func windows(of app: AXUIElement) -> [AXUIElement] { axAttr(app, kAXWindowsAttribute) ?? [] }
func title(of el: AXUIElement) -> String? { axAttr(el, kAXTitleAttribute) }
func role(of el: AXUIElement) -> String? { axAttr(el, kAXRoleAttribute) }
func subrole(of el: AXUIElement) -> String? { axAttr(el, kAXSubroleAttribute) }
func description(of el: AXUIElement) -> String? { axAttr(el, kAXDescriptionAttribute) }
func boolAttr(_ el: AXUIElement, _ key: String) -> Bool? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success, let value = v else { return nil }
    if let b = value as? Bool { return b }
    if CFGetTypeID(value) == CFBooleanGetTypeID() { return CFBooleanGetValue(value as! CFBoolean) }
    return nil
}
func performPress(_ el: AXUIElement) -> Bool { AXUIElementPerformAction(el, kAXPressAction as CFString) == .success }
func setAttr(_ el: AXUIElement, _ key: String, _ value: CFTypeRef) -> Bool {
    AXUIElementSetAttributeValue(el, key as CFString, value) == .success
}
func valueAttr(_ el: AXUIElement, _ key: String) -> String? { axAttr(el, key) }

func findApp() -> (pid: pid_t, app: AXUIElement)? {
    for p in NSWorkspace.shared.runningApplications {
        if p.bundleIdentifier == bundleIdentifier || p.localizedName == processName {
            return (p.processIdentifier, AXUIElementCreateApplication(p.processIdentifier))
        }
    }
    return nil
}
func frontWindow(_ app: AXUIElement) -> AXUIElement? {
    if let w: AXUIElement = axAttr(app, kAXFocusedWindowAttribute) { return w }
    return windows(of: app).first
}
func menuBar(_ app: AXUIElement) -> AXUIElement? { axAttr(app, kAXMenuBarAttribute) }
func menuBarItems(_ app: AXUIElement) -> [AXUIElement] {
    guard let mb = menuBar(app) else { return [] }
    return children(of: mb)
}

// MARK: - 键盘事件

func keyCode(for name: String) -> (CGKeyCode, CGEventFlags)? {
    switch name.lowercased() {
    case "escape": return (53, [])
    case "cmd-k": return (40, .maskCommand)
    case "cmd-comma": return (43, .maskCommand)
    case "cmd-o": return (31, .maskCommand)
    case "cmd-n": return (45, .maskCommand)
    case "cmd-w": return (13, .maskCommand)
    case "cmd-r": return (15, .maskCommand)
    case "cmd-a": return (0, .maskCommand)
    case "cmd-c": return (8, .maskCommand)
    case "cmd-v": return (9, .maskCommand)
    default: return nil
    }
}
func postKey(_ code: CGKeyCode, _ flags: CGEventFlags) {
    let src = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: true)
    down?.flags = flags
    down?.post(tap: .cghidEventTap)
    usleep(30_000)
    let up = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: false)
    up?.flags = flags
    up?.post(tap: .cghidEventTap)
}
func pressEscape() { postKey(53, []) }

// MARK: - 菜单树读取

func menuItemInfo(_ el: AXUIElement) -> [String: Any] {
    let t = title(of: el) ?? ""
    let enabled = boolAttr(el, kAXEnabledAttribute) ?? true
    let char: String? = axAttr(el, kAXMenuItemCmdCharAttribute)
    let virtualKey: String? = axAttr(el, "AXMenuItemCmdVirtualKey")
    let glyph: String? = axAttr(el, "AXMenuItemCmdGlyph")
    let mark: String? = axAttr(el, kAXMenuItemMarkCharAttribute)
    let kids = children(of: el)
    var info: [String: Any] = [
        "title": t,
        "enabled": enabled,
        "role": role(of: el) ?? "",
        "hasSubmenu": !kids.isEmpty,
    ]
    if let c = char, !c.isEmpty { info["cmdChar"] = c }
    if let v = virtualKey { info["cmdVirtualKey"] = v }
    if let g = glyph { info["cmdGlyph"] = g }
    if let m = mark, !m.isEmpty { info["markChar"] = m }
    return info
}

/// 展开一个 AXMenuBarItem 并读取其 AXMenu 子项。
func readSubmenu(of barItem: AXUIElement, app: AXUIElement) -> [[String: Any]] {
    _ = performPress(barItem)
    usleep(220_000)
    var items: [[String: Any]] = []
    // 路径 1：菜单项自身的 children → AXMenu → AXMenuItem
    for child in children(of: barItem) {
        let r = role(of: child) ?? ""
        if r == "AXMenu" {
            for item in children(of: child) { items.append(menuItemInfo(item)) }
        } else if r == "AXMenuItem" {
            items.append(menuItemInfo(child))
        }
    }
    // 路径 2：某些 Tauri/NSMenu 版本把展开菜单挂在应用窗口 AX 树里
    if items.isEmpty {
        for win in windows(of: app) {
            for child in children(of: win) where role(of: child) == "AXMenu" {
                for item in children(of: child) { items.append(menuItemInfo(item)) }
            }
        }
    }
    // 路径 3：从 AXMenuBar 的 children 中查找新出现的 AXMenu
    if items.isEmpty, let mb = menuBar(app) {
        for child in children(of: mb) where role(of: child) == "AXMenu" {
            for item in children(of: child) { items.append(menuItemInfo(item)) }
        }
    }
    return items
}

func readTree(_ app: AXUIElement) -> [[String: Any]] {
    var result: [[String: Any]] = []
    for barItem in menuBarItems(app) {
        let t = title(of: barItem) ?? ""
        let items = readSubmenu(of: barItem, app: app)
        let expanded = boolAttr(barItem, "AXExpanded") ?? false
        result.append([
            "title": t,
            "enabled": boolAttr(barItem, kAXEnabledAttribute) ?? true,
            "expandedAfterPress": expanded,
            "itemCount": items.count,
            "items": items,
        ])
        pressEscape()
        usleep(120_000)
    }
    return result
}

func readState(_ app: AXUIElement) -> [String: Any] {
    let titles = menuBarItems(app).map { title(of: $0) ?? "" }
    // 计划 §4.1 要求核对 AXExpanded；本机 macOS 26.x 的 AXMenuBarItem 实际暴露
    // AXSelected（展开时为 1）+ AXChildren 中的 AXMenu。两者取并集作为等价展开态。
    let expanded = menuBarItems(app).filter {
        boolAttr($0, "AXExpanded") == true || boolAttr($0, "AXSelected") == true
    }.compactMap { title(of: $0) }
    var focused: [String: Any] = [:]
    if let el: AXUIElement = axAttr(app, kAXFocusedUIElementAttribute) {
        focused = [
            "role": role(of: el) ?? "",
            "title": title(of: el) ?? "",
            "description": description(of: el) ?? "",
            "value": valueAttr(el, kAXValueAttribute) ?? "",
        ]
    }
    var windowInfo: [String: Any] = [:]
    if let win = frontWindow(app) {
        var p: CGPoint = .zero
        var s: CGSize = .zero
        if let pv: AXValue = axAttr(win, kAXPositionAttribute), AXValueGetType(pv) == .cgPoint { AXValueGetValue(pv, .cgPoint, &p) }
        if let sv: AXValue = axAttr(win, kAXSizeAttribute), AXValueGetType(sv) == .cgSize { AXValueGetValue(sv, .cgSize, &s) }
        windowInfo = [
            "title": title(of: win) ?? "",
            "position": [Int(p.x), Int(p.y)],
            "size": [Int(s.width), Int(s.height)],
            "minimized": boolAttr(win, kAXMinimizedAttribute) ?? false,
            "fullScreen": boolAttr(win, "AXFullScreen") ?? false,
        ]
    }
    return [
        "menuBarTitles": titles,
        "expandedMenus": expanded,
        "expandedAttribute": "AXExpanded or AXSelected (platform equivalent)",
        "focusedElement": focused,
        "frontWindow": windowInfo,
        "windowCount": windows(of: app).count,
    ]
}

func clickItem(_ app: AXUIElement, menu: String, item: String) -> [String: Any] {
    guard let barItem = menuBarItems(app).first(where: { title(of: $0) == menu }) else {
        return ["ok": false, "reason": "menu-not-found", "menu": menu]
    }
    let items = readSubmenu(of: barItem, app: app)
    guard let targetIndex = items.firstIndex(where: { ($0["title"] as? String) == item }) else {
        pressEscape()
        return ["ok": false, "reason": "item-not-found", "menu": menu, "item": item, "observedItems": items.map { $0["title"] ?? "" }]
    }
    // 按标题精确匹配目标项，避免 readSubmenu 来源不同导致 index 错位
    var pressed = false
    var pressedItemTitle = ""
    func pressMatching(_ menuChildren: [AXUIElement]) -> Bool {
        guard let target = menuChildren.first(where: { title(of: $0) == item }) else { return false }
        pressedItemTitle = title(of: target) ?? ""
        return performPress(target)
    }
    for child in children(of: barItem) where role(of: child) == "AXMenu" {
        if pressMatching(children(of: child)) { pressed = true; break }
    }
    if !pressed {
        // 回退：从窗口 AX 树中定位 AXMenu
        for win in windows(of: app) {
            for child in children(of: win) where role(of: child) == "AXMenu" {
                if pressMatching(children(of: child)) { pressed = true; break }
            }
            if pressed { break }
        }
    }
    usleep(320_000)
    var result: [String: Any] = [
        "ok": pressed,
        "menu": menu,
        "item": item,
        "pressedItemTitle": pressedItemTitle,
        "itemEnabled": items[targetIndex]["enabled"] ?? true,
        "observedItems": items.map { $0["title"] ?? "" },
    ]
    if !pressed { result["reason"] = "press-failed" }
    return result
}

func windowAction(_ app: AXUIElement, action: String) -> [String: Any] {
    let key: String
    switch action {
    case "minimize": key = kAXMinimizeButtonAttribute
    case "zoom": key = kAXZoomButtonAttribute
    case "fullscreen": key = kAXFullScreenButtonAttribute
    case "close": key = kAXCloseButtonAttribute
    default: return ["ok": false, "reason": "unknown-action"]
    }
    // 缩放/全屏切换后 kAXFocusedWindow 可能指向另一个窗口，遍历所有窗口找带目标按钮的那个
    var candidates = windows(of: app)
    if let focused: AXUIElement = axAttr(app, kAXFocusedWindowAttribute) {
        candidates = [focused] + candidates.filter { $0 !== focused }
    }
    for win in candidates {
        guard let button: AXUIElement = axAttr(win, key) else { continue }
        let ok = performPress(button)
        usleep(350_000)
        return ["ok": ok, "action": action, "button": key, "windowTitle": title(of: win) ?? "", "after": readState(app)]
    }
    return ["ok": false, "reason": "button-not-found", "button": key, "windowCount": windows(of: app).count]
}

// MARK: - WebView 文本与输入焦点

/// 递归读取窗口 AX 树中的可见文本，用于机器断言内容页、设置页与诊断弹窗。
func collectTexts(_ el: AXUIElement, into result: inout [[String: Any]], depth: Int, limit: Int) {
    guard depth <= 14, result.count < limit else { return }
    let r = role(of: el) ?? ""
    if ["AXStaticText", "AXHeading", "AXTextField", "AXTextArea", "AXButton", "AXMenuItem"].contains(r) {
        let t = valueAttr(el, kAXValueAttribute) ?? title(of: el) ?? description(of: el) ?? ""
        if !t.isEmpty {
            result.append(["role": r, "text": String(t.prefix(180))])
        }
    }
    for child in children(of: el) {
        if result.count >= limit { break }
        collectTexts(child, into: &result, depth: depth + 1, limit: limit)
    }
}
func readTexts(_ app: AXUIElement, limit: Int = 160) -> [[String: Any]] {
    var result: [[String: Any]] = []
    guard let win = frontWindow(app) else { return result }
    collectTexts(win, into: &result, depth: 0, limit: limit)
    return result
}

func clickAt(_ point: CGPoint) {
    let src = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(mouseEventSource: src, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
    down?.post(tap: .cghidEventTap)
    usleep(40_000)
    let up = CGEvent(mouseEventSource: src, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
    up?.post(tap: .cghidEventTap)
}
func axPoint(_ el: AXUIElement, _ key: String) -> CGPoint? {
    guard let v: AXValue = axAttr(el, key), AXValueGetType(v) == .cgPoint else { return nil }
    var p = CGPoint.zero
    AXValueGetValue(v, .cgPoint, &p)
    return p
}
func axSize(_ el: AXUIElement) -> CGSize? {
    guard let v: AXValue = axAttr(el, kAXSizeAttribute), AXValueGetType(v) == .cgSize else { return nil }
    var s = CGSize.zero
    AXValueGetValue(v, .cgSize, &s)
    return s
}
/// 找到第一个匹配 role 的输入控件并点击其中心，建立真实 WebView 焦点。
func focusInput(_ app: AXUIElement, roleName: String, index: Int) -> [String: Any] {
    var matches: [AXUIElement] = []
    func walk(_ el: AXUIElement, _ depth: Int) {
        guard depth <= 14 else { return }
        if role(of: el) == roleName { matches.append(el) }
        for child in children(of: el) { walk(child, depth + 1) }
    }
    if let win = frontWindow(app) { walk(win, 0) }
    guard index < matches.count else { return ["ok": false, "reason": "no-match", "role": roleName, "matched": matches.count] }
    let target = matches[index]
    guard let p = axPoint(target, kAXPositionAttribute), let s = axSize(target) else {
        return ["ok": false, "reason": "no-geometry", "role": roleName]
    }
    clickAt(CGPoint(x: p.x + s.width / 2, y: p.y + s.height / 2))
    usleep(300_000)
    return ["ok": true, "role": roleName, "index": index, "matched": matches.count, "stateAfter": readState(app)]
}

/// 把目标应用切到前台。未激活时 CGEvent 点击不会落到 WebView，
/// kAXFocusedUIElementAttribute 也可能返回空，导致焦点前置条件无法建立。
func activateApp(_ pid: pid_t) -> Bool {
    guard let running = NSRunningApplication(processIdentifier: pid) else { return false }
    return running.activate(options: [.activateAllWindows])
}

/// 只关闭「帮助/诊断」类弹窗的关闭按钮；避免误按主界面其他「关闭」按钮。
func dismissHelpDialog(_ app: AXUIElement) -> [String: Any] {
    var target: AXUIElement?
    var label = ""
    func walk(_ el: AXUIElement, _ depth: Int) {
        guard target == nil, depth <= 14 else { return }
        if role(of: el) == "AXButton" {
            let text = "\(title(of: el) ?? "") \(description(of: el) ?? "")"
            if text.contains("关闭") && (text.contains("诊断") || text.contains("快捷键") || text.contains("关于")) {
                target = el
                label = text.trimmingCharacters(in: .whitespaces)
                return
            }
        }
        for child in children(of: el) { walk(child, depth + 1) }
    }
    if let win = frontWindow(app) { walk(win, 0) }
    guard let button = target else { return ["ok": false, "reason": "no-help-dialog"] }
    let ok = performPress(button)
    usleep(250_000)
    return ["ok": ok, "dismissed": label, "stateAfter": readState(app)]
}

// MARK: - 输出

func writeJSON(_ payload: [String: Any], to path: String) {
    var payload = payload
    payload["trusted"] = AXIsProcessTrusted()
    payload["bundleIdentifier"] = bundleIdentifier
    payload["capturedAt"] = ISO8601DateFormatter().string(from: Date())
    do {
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .withoutEscapingSlashes, .sortedKeys])
        try data.write(to: URL(fileURLWithPath: path))
    } catch {
        FileHandle.standardError.write(Data("writeJSON failed: \(error)\n".utf8))
        exit(3)
    }
}

guard let found = findApp() else {
    if args.count > 2 { writeJSON(["ok": false, "command": command, "error": "app-not-running"], to: args[2]) }
    FileHandle.standardError.write(Data("target application not running\n".utf8))
    exit(2)
}
let app = found.app
var payload: [String: Any] = ["ok": true, "command": command, "pid": Int(found.pid)]

switch command {
case "tree":
    let tree = readTree(app)
    payload["menus"] = tree
    payload["topLevelTitles"] = tree.map { $0["title"] ?? "" }
case "state":
    payload["state"] = readState(app)
case "click":
    if args.count < 5 {
        payload = ["ok": false, "error": "usage: click <out> <menu> <item>"]
    } else {
        let r = clickItem(app, menu: args[3], item: args[4])
        payload["click"] = r
        payload["ok"] = r["ok"] as? Bool ?? false
        payload["stateAfter"] = readState(app)
    }
case "key":
    if args.count < 4 {
        payload = ["ok": false, "error": "usage: key <out> <name>"]
    } else if let (code, flags) = keyCode(for: args[3]) {
        postKey(code, flags)
        usleep(300_000)
        payload["key"] = args[3]
        payload["stateAfter"] = readState(app)
    } else {
        payload = ["ok": false, "error": "unknown-key", "key": args[3]]
    }
case "window":
    if args.count < 4 {
        payload = ["ok": false, "error": "usage: window <out> <action>"]
    } else {
        let r = windowAction(app, action: args[3])
        payload["window"] = r
        payload["ok"] = r["ok"] as? Bool ?? false
    }
case "attrs":
    if args.count < 4 {
        payload = ["ok": false, "error": "usage: attrs <out> <menu>"]
    } else if let barItem = menuBarItems(app).first(where: { title(of: $0) == args[3] }) {
        _ = performPress(barItem)
        usleep(220_000)
        var namesRef: CFArray?
        AXUIElementCopyAttributeNames(barItem, &namesRef)
        let names = (namesRef as? [String]) ?? []
        var values: [String: String] = [:]
        for name in names {
            var v: CFTypeRef?
            if AXUIElementCopyAttributeValue(barItem, name as CFString, &v) == .success, let raw = v {
                values[name] = "\(raw)"
            }
        }
        payload["menu"] = args[3]
        payload["attributeNames"] = names
        payload["attributeValues"] = values
        payload["stateAfter"] = readState(app)
    } else {
        payload = ["ok": false, "error": "menu-not-found", "menu": args[3]]
    }
case "open":
    if args.count < 4 {
        payload = ["ok": false, "error": "usage: open <out> <menu>"]
    } else if let barItem = menuBarItems(app).first(where: { title(of: $0) == args[3] }) {
        let ok = performPress(barItem)
        usleep(250_000)
        payload["opened"] = args[3]
        payload["ok"] = ok
        payload["stateAfter"] = readState(app)
    } else {
        payload = ["ok": false, "error": "menu-not-found", "menu": args[3]]
    }
case "texts":
    let limit = args.count > 3 ? Int(args[3]) ?? 160 : 160
    let texts = readTexts(app, limit: limit)
    payload["texts"] = texts
    payload["textCount"] = texts.count
case "activate":
    let activated = activateApp(found.pid)
    usleep(350_000)
    payload["activated"] = activated
    payload["stateAfter"] = readState(app)
case "dismiss":
    let r = dismissHelpDialog(app)
    payload["dismiss"] = r
    payload["ok"] = r["ok"] as? Bool ?? false
    payload["stateAfter"] = r["stateAfter"]
case "focus":
    if args.count < 4 {
        payload = ["ok": false, "error": "usage: focus <out> <role> [index]"]
    } else {
        let r = focusInput(app, roleName: args[3], index: args.count > 4 ? Int(args[4]) ?? 0 : 0)
        payload["focus"] = r
        payload["ok"] = r["ok"] as? Bool ?? false
        payload["texts"] = readTexts(app, limit: 60)
    }
default:
    payload = ["ok": false, "error": "unknown-command", "command": command]
}

let outPath = args.count > 2 && args[2].hasSuffix(".json") ? args[2] : "/tmp/vinkey-menu-ax.json"
writeJSON(payload, to: outPath)
print(outPath)
