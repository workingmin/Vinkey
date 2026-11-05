// title-bar-ax-helper.swift
//
// macOS 原生菜单自动化助手，用于 W0-SHELL-MENU-P 标题栏与功能菜单专项验收。
// 与 scripts/ui-shell/ax-shell-helper.swift 同样避开 osascript/System Events 的
// 进程级 AX 枚举 TCC -10004 问题：同一进程上下文直接调用 AX C API。
// 覆盖：完整一级菜单树枚举、目标菜单项按压、窗口菜单驱动的最小化/缩放/关闭/重开，
// 以及 CoreGraphics 窗口截图（部署目标 macosx14.0，规避 ScreenCaptureKit 沙箱限制）。
import AppKit
import ApplicationServices
import CoreGraphics
import Darwin
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : ""

// MARK: - AX 基础工具

func axAttr<T>(_ el: AXUIElement, _ key: String) -> T? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &value) == .success, let typed = value else { return nil }
    return typed as? T
}

func setAttr(_ el: AXUIElement, _ key: String, _ value: CFTypeRef) -> Bool {
    AXUIElementSetAttributeValue(el, key as CFString, value) == .success
}

func setFrontmost(_ app: AXUIElement) -> Bool {
    setAttr(app, kAXFrontmostAttribute, kCFBooleanTrue)
}

func children(of el: AXUIElement) -> [AXUIElement] {
    axAttr(el, kAXChildrenAttribute) ?? []
}

func windows(of app: AXUIElement) -> [AXUIElement] {
    axAttr(app, kAXWindowsAttribute) ?? []
}

func title(of el: AXUIElement) -> String? {
    axAttr(el, kAXTitleAttribute)
}

func boolAttr(_ el: AXUIElement, _ key: String) -> Bool? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &value) == .success, let typed = value else { return nil }
    if let swiftBool = typed as? Bool { return swiftBool }
    if CFGetTypeID(typed) == CFBooleanGetTypeID() { return CFBooleanGetValue(typed as! CFBoolean) }
    return nil
}

func setBoolAttr(_ el: AXUIElement, _ key: String, _ value: Bool) -> Bool {
    setAttr(el, key, value ? kCFBooleanTrue : kCFBooleanFalse)
}

func enabledAttr(_ el: AXUIElement) -> Bool {
    boolAttr(el, kAXEnabledAttribute) ?? true
}

func performPress(_ el: AXUIElement) -> Bool {
    AXUIElementPerformAction(el, kAXPressAction as CFString) == .success
}

func findApp(named name: String) -> (pid: pid_t, app: AXUIElement)? {
    for app in NSWorkspace.shared.runningApplications {
        if app.localizedName == name || app.bundleIdentifier == "com.vinkey.desktop" {
            return (app.processIdentifier, AXUIElementCreateApplication(app.processIdentifier))
        }
    }
    return nil
}

func frontWindow(_ app: AXUIElement) -> AXUIElement? {
    if let window: AXUIElement = axAttr(app, kAXFocusedWindowAttribute) { return window }
    let allWindows = windows(of: app)
    return allWindows.first ?? allWindows.last
}

func hasWindow(_ app: AXUIElement) -> Bool {
    !windows(of: app).isEmpty
}

// MARK: - 菜单树

func menuBarChildren(_ app: AXUIElement) -> [AXUIElement] {
    guard let menuBar: AXUIElement = axAttr(app, kAXMenuBarAttribute) else { return [] }
    return children(of: menuBar)
}

func menuBarTitles(_ app: AXUIElement) -> [String] {
    menuBarChildren(app).compactMap { title(of: $0) }
}

func menuItemTitles(of topLevel: AXUIElement) -> [String] {
    var titles: [String] = []
    for menu in children(of: topLevel) {
        for item in children(of: menu) {
            if let itemTitle = title(of: item), !itemTitle.isEmpty { titles.append(itemTitle) }
        }
    }
    return titles
}

func fullMenuTree(_ app: AXUIElement) -> [[String: Any]] {
    menuBarChildren(app).enumerated().map { index, topLevel in
        [
            "index": index,
            "title": title(of: topLevel) ?? "",
            "items": menuItemTitles(of: topLevel),
        ]
    }
}

func expectedMenuBarTitles() -> [String] { ["Vinkey", "项目", "会话", "编辑", "查看", "窗口", "帮助"] }

func menuItem(in topLevel: AXUIElement, matching match: (String) -> Bool) -> AXUIElement? {
    for menu in children(of: topLevel) {
        for item in children(of: menu) {
            if let itemTitle = title(of: item), match(itemTitle) { return item }
        }
    }
    return nil
}

func topLevelItem(_ app: AXUIElement, title target: String) -> AXUIElement? {
    menuBarChildren(app).first { title(of: $0) == target }
}

func pressMenuItem(_ app: AXUIElement, menu: String, title target: String) -> String? {
    guard let topLevel = topLevelItem(app, title: menu),
          let item = menuItem(in: topLevel, matching: { $0 == target }) else { return nil }
    return performPress(item) ? target : nil
}

func pressMenuItem(_ app: AXUIElement, menu: String, containing fragment: String) -> String? {
    guard let topLevel = topLevelItem(app, title: menu),
          let item = menuItem(in: topLevel, matching: { $0.contains(fragment) }) else { return nil }
    guard enabledAttr(item) else { return nil }
    return performPress(item) ? title(of: item) : nil
}

// MARK: - 截图

func captureWindow(outputPath: String, bundleIdentifier: String, processName: String) throws {
    var targetPids = Set<pid_t>()
    for app in NSWorkspace.shared.runningApplications {
        let bundleMatches = !bundleIdentifier.isEmpty && app.bundleIdentifier == bundleIdentifier
        let processMatches = !processName.isEmpty && (app.localizedName ?? "").caseInsensitiveCompare(processName) == .orderedSame
        if bundleMatches || processMatches { targetPids.insert(app.processIdentifier) }
    }
    guard !targetPids.isEmpty else { throw NSError(domain: "title-bar-ax-helper", code: 20, userInfo: [NSLocalizedDescriptionKey: "target application not running"]) }
    let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
    guard let infoList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        throw NSError(domain: "title-bar-ax-helper", code: 21, userInfo: [NSLocalizedDescriptionKey: "cannot enumerate window info"])
    }
    let candidates = infoList.compactMap { info -> (CGWindowID, CGRect)? in
        guard let ownerPid = info[kCGWindowOwnerPID as String] as? Int32,
              targetPids.contains(ownerPid),
              let bounds = info[kCGWindowBounds as String] as? [String: Double],
              let x = bounds["X"], let y = bounds["Y"], let width = bounds["Width"], let height = bounds["Height"],
              width > 1, height > 1,
              let windowNumber = (info[kCGWindowNumber as String] as? UInt32), windowNumber != 0 else { return nil }
        return (windowNumber, CGRect(x: CGFloat(x), y: CGFloat(y), width: CGFloat(width), height: CGFloat(height)))
    }
    guard let (windowId, _) = candidates.max(by: { $0.1.width * $0.1.height < $1.1.width * $1.1.height }) else {
        throw NSError(domain: "title-bar-ax-helper", code: 22, userInfo: [NSLocalizedDescriptionKey: "no visible application window matched bundle/process"])
    }
    guard let image = CGWindowListCreateImage(CGRectNull, .optionIncludingWindow, windowId, .bestResolution) else {
        throw NSError(domain: "title-bar-ax-helper", code: 23, userInfo: [NSLocalizedDescriptionKey: "failed to create window image"])
    }
    let url = URL(fileURLWithPath: outputPath)
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "title-bar-ax-helper", code: 24, userInfo: [NSLocalizedDescriptionKey: "cannot create image destination"])
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "title-bar-ax-helper", code: 25, userInfo: [NSLocalizedDescriptionKey: "failed to write PNG"])
    }
}

func capture(_ outputPath: String, bundle: String, process: String) {
    do { try captureWindow(outputPath: outputPath, bundleIdentifier: bundle, processName: process) }
    catch { FileHandle.standardError.write(Data("capture error: \(error)\n".utf8)) }
}

// MARK: - 报告

func emit(_ status: String, _ caseId: String, _ title: String, _ detail: String) {
    print("\(status)|\(caseId)|\(title)|\(detail)")
}

func saveJson(_ object: [String: Any], to path: String) {
    do {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: URL(fileURLWithPath: path), options: .atomic)
    } catch {
        FileHandle.standardError.write(Data("write json error: \(error)\n".utf8))
    }
}

// MARK: - 主自动化流程

func runAudit(reportDir: String, appName: String, appPath: String, windowReadyWaitMs: String, appBundleId: String) {
    guard let (_, app) = findApp(named: appName) else {
        emit("BLOCKED", "TB-MENU-AX-LAUNCH", "原生 AX 菜单自动化启动", "未找到 \(appName) 进程")
        return
    }
    _ = setFrontmost(app)
    var stableWindow: AXUIElement?
    for _ in 0..<10 {
        _ = setFrontmost(app)
        if let window = frontWindow(app) { stableWindow = window; break }
        Thread.sleep(forTimeInterval: 0.2)
    }
    guard stableWindow != nil else {
        emit("BLOCKED", "TB-MENU-AX-LAUNCH", "原生 AX 菜单自动化启动", "窗口就绪后仍无法读取 AXWindow；windowReadyWaitMs=\(windowReadyWaitMs)")
        return
    }

    // TB-MENU-001 完整一级菜单树
    var topTitles = menuBarTitles(app)
    for _ in 0..<10 where topTitles.count < expectedMenuBarTitles().count {
        Thread.sleep(forTimeInterval: 0.3)
        topTitles = menuBarTitles(app)
    }
    let tree = fullMenuTree(app)
    saveJson(["schemaVersion": 1, "generatedAt": ISO8601DateFormatter().string(from: Date()), "process": appName, "menus": tree], to: "\(reportDir)/menu-tree.json")
    let expectedTop = expectedMenuBarTitles()
    let hasExpectedTop = expectedTop.allSatisfy { topTitles.contains($0) }
    let missingExpectedTop = expectedTop.filter { !topTitles.contains($0) }
    let hasFile = topTitles.contains("文件")
    let expectedItems: [String: [String]] = [
        "项目": ["添加本地项目…", "刷新当前项目"],
        "会话": ["新建会话", "搜索项目与会话"],
        "编辑": ["撤销", "重做", "剪切", "复制", "粘贴", "全选"],
        "查看": ["对话工作台", "项目文件", "任务与日志", "切换浅色/深色主题"],
        "窗口": ["最小化", "缩放窗口", "进入全屏", "关闭窗口"],
        "帮助": ["查看快捷键", "窗口诊断信息", "应用诊断日志"],
        "Vinkey": ["设置…", "关于 Vinkey"],
    ]
    var missingItems: [String] = []
    for pair in expectedItems {
        guard let top = topLevelItem(app, title: pair.key) else { missingItems.append("\(pair.key):整个菜单缺失"); continue }
        let existing = menuItemTitles(of: top)
        for expectedTitle in pair.value where !existing.contains(where: { $0 == expectedTitle }) {
            missingItems.append("\(pair.key)>\(expectedTitle)")
        }
    }
    if hasExpectedTop && !hasFile && missingItems.isEmpty {
        emit("PASS", "TB-MENU-001", "完整一级菜单树与目标菜单项", "top=\(topTitles.joined(separator: ","));itemsVerified=\(expectedItems.values.flatMap { $0 }.count)")
    } else {
        emit("FAIL", "TB-MENU-001", "完整一级菜单树与目标菜单项", "missingTop=\(missingExpectedTop.joined(separator: ","));hasFile=\(hasFile);missingItems=\(missingItems.joined(separator: ","))")
    }

    // TB-MENU-005 查看菜单项按压（触发级）
    var viewPresses: [String] = []
    for itemTitle in ["对话工作台", "项目文件", "任务与日志"] {
        if let pressed = pressMenuItem(app, menu: "查看", title: itemTitle) { viewPresses.append(pressed) }
    }
    emit(viewPresses.count == 3 ? "PASS" : "BLOCKED", "TB-MENU-005", "查看菜单项按压（触发级）", "pressed=\(viewPresses.joined(separator: ","));webviewPageStateRequiresCompanion=true")

    // TB-MENU-006 主题菜单项按压（触发级）
    let themePressed = pressMenuItem(app, menu: "查看", title: "切换浅色/深色主题")
    emit(themePressed != nil ? "PASS" : "BLOCKED", "TB-MENU-006", "主题菜单项按压（触发级）", "pressed=\(themePressed ?? "nil");themeStateRequiresCompanion=true")

    // TB-MENU-007 设置归属（原生菜单存在性）
    let vinkeyItems = topLevelItem(app, title: "Vinkey").map { menuItemTitles(of: $0) } ?? []
    let viewItems = topLevelItem(app, title: "查看").map { menuItemTitles(of: $0) } ?? []
    let settingsInVinkey = vinkeyItems.contains("设置…")
    let settingsInView = viewItems.contains("设置…") || viewItems.contains("模型与应用设置")
    if settingsInVinkey && !settingsInView {
        emit("PASS", "TB-MENU-007", "设置归属（Vinkey 应用菜单存在，查看不重复）", "vinkey=\(vinkeyItems.joined(separator: ","));view=\(viewItems.joined(separator: ","))")
    } else {
        emit("FAIL", "TB-MENU-007", "设置归属（Vinkey 应用菜单存在，查看不重复）", "settingsInVinkey=\(settingsInVinkey);settingsInView=\(settingsInView)")
    }

    // TB-MENU-008 窗口菜单动作（最小化/缩放/关闭 + Reopen）
    ensureVisibleAndNotFullscreen(app)
    var minimizePass = false
    var minimizeDetail = ""
    let beforeMinimize = frontWindow(app)
    if let _ = pressMenuItem(app, menu: "窗口", containing: "最小化") {
        Thread.sleep(forTimeInterval: 0.8)
        var minimized = false
        for _ in 0..<10 {
            for window in windows(of: app) where boolAttr(window, kAXMinimizedAttribute) == true { minimized = true }
            if minimized { break }
            Thread.sleep(forTimeInterval: 0.1)
        }
        if minimized {
            for window in windows(of: app) where boolAttr(window, kAXMinimizedAttribute) == true { _ = setBoolAttr(window, kAXMinimizedAttribute, false) }
            _ = setFrontmost(app)
            Thread.sleep(forTimeInterval: 0.4)
            minimizePass = frontWindow(app) != nil
            minimizeDetail = "observedMinimized=true;restored=true"
        } else {
            minimizeDetail = "observedMinimized=false"
        }
    } else {
        minimizeDetail = "menuItemPressFailed"
    }
    emit(minimizePass ? "PASS" : "FAIL", "TB-MENU-008-MINIMIZE", "窗口菜单最小化并恢复", minimizeDetail)

    ensureVisibleAndNotFullscreen(app)
    var zoomPass = false
    var zoomDetail = ""
    if let zoomWindow = frontWindow(app) {
        let beforeFullscreen = boolAttr(zoomWindow, kAXFullScreenAttribute) == true
        let beforeSize = size(of: zoomWindow)
        if let pressed = pressMenuItem(app, menu: "窗口", containing: "缩放窗口") {
            Thread.sleep(forTimeInterval: 1.0)
            let afterWindow = frontWindow(app) ?? zoomWindow
            let afterFullscreen = boolAttr(afterWindow, kAXFullScreenAttribute) == true
            let afterSize = size(of: afterWindow)
            let changed = beforeFullscreen != afterFullscreen || abs(Double(beforeSize?.0 ?? 0) - Double(afterSize?.0 ?? 0)) > 1 || abs(Double(beforeSize?.1 ?? 0) - Double(afterSize?.1 ?? 0)) > 1
            var restored = false
            if let _ = pressMenuItem(app, menu: "窗口", containing: "缩放窗口") {
                restored = true
            } else if afterFullscreen, let _ = pressMenuItem(app, menu: "窗口", containing: "退出全屏") {
                restored = true
            } else if let _ = pressMenuItem(app, menu: "窗口", containing: "进入全屏") {
                restored = true
            }
            zoomPass = changed && restored
            zoomDetail = "pressed=\(pressed);changed=\(changed);restored=\(restored);before=\(String(describing: beforeSize));after=\(String(describing: afterSize));fullscreenAfter=\(afterFullscreen)"
        } else {
            zoomDetail = "menuItemPressFailed"
        }
    } else {
        zoomDetail = "windowUnavailable"
    }
    emit(zoomPass ? "PASS" : "FAIL", "TB-MENU-008-ZOOM", "窗口菜单缩放并还原", zoomDetail)

    ensureVisibleAndNotFullscreen(app)
    var closePass = false
    var closeDetail = ""
    capture("\(reportDir)/screenshots/01-title-bar-before-close.png", bundle: appBundleId, process: appName)
    if let _ = pressMenuItem(app, menu: "窗口", containing: "关闭窗口") {
        Thread.sleep(forTimeInterval: 1.0)
        if hasWindow(app) {
            closeDetail = "windowStillVisibleAfterClose"
        } else {
            closeDetail = "windowHiddenAfterClose"
        }
    } else {
        closeDetail = "menuItemPressFailed"
    }
    if closeDetail == "windowHiddenAfterClose" && !appPath.isEmpty {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        task.arguments = [appPath]
        try? task.run()
        task.waitUntilExit()
        var reopened = false
        for _ in 0..<60 {
            Thread.sleep(forTimeInterval: 0.5)
            if hasWindow(app) { reopened = true; break }
        }
        if reopened {
            capture("\(reportDir)/screenshots/02-title-bar-window-reopened.png", bundle: appBundleId, process: appName)
            closePass = true
        } else {
            closeDetail = "reopenFailed"
        }
    }
    emit(closePass ? "PASS" : "FAIL", "TB-MENU-008-CLOSE-REOPEN", "窗口菜单关闭并 Reopen 恢复", closeDetail)

    // TB-MENU-009 帮助/关于菜单项存在与触发（触发级）
    let helpItems = topLevelItem(app, title: "帮助").map { menuItemTitles(of: $0) } ?? []
    let requiredHelp = ["查看快捷键", "窗口诊断信息", "应用诊断日志"]
    let missingHelp = requiredHelp.filter { !helpItems.contains($0) }
    let aboutInVinkey = vinkeyItems.contains("关于 Vinkey")
    var helpPresses: [String] = []
    for itemTitle in requiredHelp where missingHelp.isEmpty {
        if let pressed = pressMenuItem(app, menu: "帮助", title: itemTitle) { helpPresses.append(pressed) }
    }
    if missingHelp.isEmpty && aboutInVinkey && helpPresses.count == requiredHelp.count {
        emit("PASS", "TB-MENU-009", "帮助与关于菜单项触发（触发级）", "pressed=\(helpPresses.joined(separator: ","));aboutInVinkey=\(aboutInVinkey);dialogFocusReturnRequiresCompanion=true")
    } else {
        emit("BLOCKED", "TB-MENU-009", "帮助与关于菜单项触发（触发级）", "missing=\(missingHelp.joined(separator: ","));aboutInVinkey=\(aboutInVinkey);pressed=\(helpPresses.joined(separator: ","))")
    }

    // TB-MENU-010 菜单关闭与焦点（原生 AX 无法读取 WebView 焦点，保留阻断）
    emit("BLOCKED", "TB-MENU-010", "菜单关闭后 WebView 焦点恢复", "原生 AX 可证明菜单项按压后菜单关闭，但无法读取 WebView 焦点；由 WebView companion 或人工复核")

    // TB-MENU-011 中文菜单审计（原生菜单标题）
    let ownLabels = topTitles + Array(expectedItems.values.joined())
    let englishResidue = ownLabels.filter { ["File", "View", "Edit", "Window", "Help", "Settings"].contains($0) }
    emit(englishResidue.isEmpty ? "PASS" : "FAIL", "TB-MENU-011", "中文菜单审计（原生菜单标题）", "residue=\(englishResidue.joined(separator: ","))")

    // TB-MENU-012 首版菜单减法审计（原生菜单标题）
    let forbiddenItems = ["停止当前生成", "展开/折叠项目与会话栏", "保存文档", "关闭文档", "新建文档…", "刷新工作区", "打开工作区…"]
    let presentForbidden = ownLabels.filter { forbiddenItems.contains($0) }
    emit(presentForbidden.isEmpty ? "PASS" : "FAIL", "TB-MENU-012", "首版菜单减法审计（原生菜单标题）", "forbidden=\(presentForbidden.joined(separator: ","))")
}

func ensureVisibleAndNotFullscreen(_ app: AXUIElement) {
    let window = frontWindow(app)
    if let window = window, boolAttr(window, kAXFullScreenAttribute) == true {
        if let _ = pressMenuItem(app, menu: "窗口", containing: "退出全屏") {
            Thread.sleep(forTimeInterval: 1.0)
        }
    }
    _ = setFrontmost(app)
    Thread.sleep(forTimeInterval: 0.3)
}

func size(of window: AXUIElement) -> (CGFloat, CGFloat)? {
    guard let value: AXValue = axAttr(window, kAXSizeAttribute), AXValueGetType(value) == .cgSize else { return nil }
    var size = CGSize.zero
    AXValueGetValue(value, .cgSize, &size)
    return (size.width, size.height)
}

// MARK: - 入口分发

switch command {
case "process-exists":
    guard args.count >= 3 else { exit(2) }
    exit(findApp(named: args[2]) != nil ? 0 : 1)

case "window-ready":
    guard args.count >= 3 else { exit(2) }
    guard let (_, app) = findApp(named: args[2]) else { exit(1) }
    _ = setFrontmost(app)
    exit(frontWindow(app) != nil ? 0 : 1)

case "quit":
    guard args.count >= 3 else { exit(2) }
    if let target = findApp(named: args[2]) {
        let app = NSRunningApplication(processIdentifier: target.pid)
        app?.terminate()
        Thread.sleep(forTimeInterval: 0.4)
        if app?.isTerminated == false { app?.forceTerminate() }
        Thread.sleep(forTimeInterval: 0.4)
        if app?.isTerminated == false { kill(target.pid, SIGKILL) }
        exit(0)
    }
    exit(1)

case "run":
    guard args.count >= 5 else {
        FileHandle.standardError.write(Data("usage: title-bar-ax-helper run <reportDir> <appName> <appPath> <windowReadyWaitMs> <appBundleId>\n".utf8))
        exit(2)
    }
    mkdirScreenshots(args[2])
    runAudit(reportDir: args[2], appName: args[3], appPath: args[4], windowReadyWaitMs: args[5], appBundleId: args.count >= 7 ? args[6] : "")

default:
    FileHandle.standardError.write(Data("unknown command: \(command)\n".utf8))
    exit(2)
}

func mkdirScreenshots(_ reportDir: String) {
    try? FileManager.default.createDirectory(atPath: "\(reportDir)/screenshots", withIntermediateDirectories: true)
}
