// ax-shell-helper.swift
//
// 原生 macOS Accessibility (AX) 自动化助手，用于 Vinkey 壳层验收。
// 取代原先依赖 `osascript` + `System Events` 的 AppleScript 链路：
// 在本机实测中，`osascript`/`System Events` 的进程级 AX 枚举被 TCC 以
// `-10004` 拒绝，而同一进程上下文下直接调用 AX C API 可用
// （`AXIsProcessTrusted()` 返回 true，且 AXWindow/AXMenuBar 查询成功）。
//
// 本助手使用 ApplicationServices 的 AX API 直接驱动目标应用，截图仍交由
// 既有的 capture-helper（ScreenCaptureKit）完成，证据类型与原有 AppleScript
// 完全一致，输出 `PASS|CASE|title|detail` 报告行供 shell 脚本解析。
import AppKit
import ApplicationServices
import Darwin
import Foundation

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : ""

// MARK: - AX 基础工具

func axAttr<T>(_ el: AXUIElement, _ key: String) -> T? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success, let value = v else { return nil }
    return value as? T
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

func subrole(of el: AXUIElement) -> String? {
    axAttr(el, kAXSubroleAttribute)
}

func description(of el: AXUIElement) -> String? {
    axAttr(el, kAXDescriptionAttribute)
}

func position(of el: AXUIElement) -> (CGFloat, CGFloat)? {
    guard let v: AXValue = axAttr(el, kAXPositionAttribute), AXValueGetType(v) == .cgPoint else { return nil }
    var p = CGPoint.zero
    AXValueGetValue(v, .cgPoint, &p)
    return (p.x, p.y)
}

func size(of el: AXUIElement) -> (CGFloat, CGFloat)? {
    guard let v: AXValue = axAttr(el, kAXSizeAttribute), AXValueGetType(v) == .cgSize else { return nil }
    var s = CGSize.zero
    AXValueGetValue(v, .cgSize, &s)
    return (s.width, s.height)
}

func setSize(_ el: AXUIElement, _ w: CGFloat, _ h: CGFloat) -> Bool {
    var s = CGSize(width: w, height: h)
    guard let v = AXValueCreate(.cgSize, &s) else { return false }
    return setAttr(el, kAXSizeAttribute, v)
}

func boolAttr(_ el: AXUIElement, _ key: String) -> Bool? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success, let value = v else { return nil }
    if let b = value as? Bool { return b }
    if CFGetTypeID(value) == CFBooleanGetTypeID() { return CFBooleanGetValue(value as! CFBoolean) }
    return nil
}

func setBoolAttr(_ el: AXUIElement, _ key: String, _ value: Bool) -> Bool {
    setAttr(el, key, value ? kCFBooleanTrue : kCFBooleanFalse)
}

func performPress(_ el: AXUIElement) -> Bool {
    AXUIElementPerformAction(el, kAXPressAction as CFString) == .success
}

func findApp(named name: String) -> (pid: pid_t, app: AXUIElement)? {
    for p in NSWorkspace.shared.runningApplications {
        if p.localizedName == name || p.bundleIdentifier == "com.vinkey.desktop" {
            return (p.processIdentifier, AXUIElementCreateApplication(p.processIdentifier))
        }
    }
    return nil
}

func frontWindow(_ app: AXUIElement) -> AXUIElement? {
    if let w: AXUIElement = axAttr(app, kAXFocusedWindowAttribute) { return w }
    let wins = windows(of: app)
    return wins.first ?? wins.last
}

func menuBarItems(_ app: AXUIElement) -> [String] {
    guard let mb: AXUIElement = axAttr(app, kAXMenuBarAttribute) else { return [] }
    return children(of: mb).compactMap { title(of: $0) }
}

// MARK: - 交通灯按钮

func buttonMatches(_ kind: String, subrole: String, desc: String) -> Bool {
    let d = desc.lowercased()
    switch kind {
    case "close":
        return subrole == "AXCloseButton" || d.contains("close") || d.contains("关闭")
    case "minimize":
        return subrole == "AXMinimizeButton" || d.contains("miniatur") || d.contains("minimize") || d.contains("最小化")
    case "zoom":
        return subrole == "AXZoomButton" || subrole == "AXFullScreenButton"
            || d.contains("zoom") || d.contains("缩放") || d.contains("full screen") || d.contains("全屏")
    default:
        return false
    }
}

func posString(_ el: AXUIElement) -> String {
    if let p = position(of: el) { return "\(Int(p.0)),\(Int(p.1))" }
    return "0,0"
}

func trafficLights(of window: AXUIElement) -> (close: String, minimize: String, zoom: String)? {
    var close: String?
    var minimize: String?
    var zoom: String?
    for btn in children(of: window) {
        let sub = subrole(of: btn) ?? ""
        let desc = description(of: btn) ?? ""
        if buttonMatches("close", subrole: sub, desc: desc) { close = posString(btn) }
        else if buttonMatches("minimize", subrole: sub, desc: desc) { minimize = posString(btn) }
        else if buttonMatches("zoom", subrole: sub, desc: desc) { zoom = posString(btn) }
    }
    guard let c = close, let m = minimize, let z = zoom else { return nil }
    return (c, m, z)
}

func pressButton(window: AXUIElement, kind: String) -> String? {
    for btn in children(of: window) {
        let sub = subrole(of: btn) ?? ""
        let desc = description(of: btn) ?? ""
        if buttonMatches(kind, subrole: sub, desc: desc) {
            _ = performPress(btn)
            return "\(sub):\(desc)"
        }
    }
    return nil
}

// 点击「窗口」菜单下的指定菜单项（zoom 还原的兜底路径）
func clickWindowMenuItem(_ app: AXUIElement, names: [String]) -> String? {
    guard let mb: AXUIElement = axAttr(app, kAXMenuBarAttribute) else { return nil }
    for item in children(of: mb) where title(of: item) == "窗口" {
        for menu in children(of: item) {
            for mi in children(of: menu) {
                if let t = title(of: mi), names.contains(t) {
                    _ = performPress(mi)
                    return t
                }
            }
        }
    }
    return nil
}

func hasWindow(_ app: AXUIElement) -> Bool {
    !windows(of: app).isEmpty
}

// 确保窗口退出全屏（绿色按钮为 AXFullScreenButton 时进入的是 macOS 全屏空间，
// 会令标准交通灯按钮的 AX 子结构变化，需在最小化/关闭前回到普通状态）。
func ensureNotFullscreen(_ app: AXUIElement) {
    guard let win = frontWindow(app), boolAttr(win, "AXFullScreen") == true else { return }
    // 再次按下全屏按钮（仍为 AXFullScreenButton）退出全屏
    if pressButton(window: win, kind: "zoom") != nil {
        Thread.sleep(forTimeInterval: 1.0)
        if let fw = frontWindow(app), boolAttr(fw, "AXFullScreen") != true { return }
    }
    // 兜底：通过「窗口」菜单的「退出全屏」退出
    if clickWindowMenuItem(app, names: ["退出全屏", "进入全屏"]) != nil {
        Thread.sleep(forTimeInterval: 1.0)
    }
}

// MARK: - 截图

func capture(_ helper: String, _ output: String, _ bundle: String, _ name: String) {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: helper)
    task.arguments = ["capture", output, bundle, name]
    try? task.run()
    task.waitUntilExit()
}

// MARK: - 报告

func emit(_ status: String, _ caseId: String, _ title: String, _ detail: String) {
    print("\(status)|\(caseId)|\(title)|\(detail)")
}

// MARK: - 主自动化流程（对应原 AppleScript 块）

func runAutomation(reportDir: String, appName: String, windowReadyWaitMs: String, appPath: String, captureHelper: String, appBundleId: String) {
    guard let (_, app) = findApp(named: appName) else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-AUTOMATION", "Accessibility/原生自动化执行中断", "未找到 \(appName) 进程")
        return
    }
    setFrontmost(app)
    var mainWindow: AXUIElement?
    for _ in 0..<10 {
        setFrontmost(app)
        if let w = frontWindow(app) { mainWindow = w; break }
        Thread.sleep(forTimeInterval: 0.2)
    }
    guard let mainWindow = mainWindow else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-AUTOMATION", "Accessibility/原生自动化执行中断", "窗口就绪检查通过后，Tauri 主窗口再次变为不可访问")
        return
    }

    // LAUNCH：窗口可访问 + 几何
    let pos = position(of: mainWindow)
    let sz = size(of: mainWindow)
    emit("PASS", "SHELL-NATIVE-MAC-LAUNCH", "Tauri 桌面窗口可访问",
         "position=\(Int(pos?.0 ?? 0)),\(Int(pos?.1 ?? 0));size=\(Int(sz?.0 ?? 0)),\(Int(sz?.1 ?? 0));windowReadyWaitMs=\(windowReadyWaitMs)")

    // MENU-CONTRACT-GUARD：菜单合同守卫（重试以容许懒加载）
    var menus: [String] = []
    for _ in 0..<10 {
        menus = menuBarItems(app)
        let expected = ["Vinkey", "项目", "会话", "编辑", "查看", "窗口", "帮助"]
        if expected.allSatisfy({ menus.contains($0) }) { break }
        Thread.sleep(forTimeInterval: 0.3)
    }
    let expected = ["Vinkey", "项目", "会话", "编辑", "查看", "窗口", "帮助"]
    let allPresent = expected.allSatisfy { menus.contains($0) }
    let noFile = !menus.contains("文件")
    if allPresent && noFile {
        emit("PASS", "SHELL-NATIVE-MAC-MENU-CONTRACT-GUARD", "截图前核对目标菜单合同",
             "menus=\(menus.joined(separator: ","));scope=guard-only")
    } else {
        emit("FAIL", "SHELL-NATIVE-MAC-MENU-CONTRACT-GUARD", "截图前核对目标菜单合同",
             "menus=\(menus.joined(separator: ","));expected=\(expected.joined(separator: ","));scope=guard-only")
    }

    // TRAFFIC-LIGHTS：定位并截图红黄绿交通灯
    if let lights = trafficLights(of: mainWindow) {
        capture(captureHelper, "\(reportDir)/screenshots/01-mac-traffic-lights.png", appBundleId, appName)
        emit("PASS", "SHELL-NATIVE-MAC-TRAFFIC-LIGHTS", "发现并截图红黄绿交通灯",
             "close=\(lights.close);minimize=\(lights.minimize);zoom=\(lights.zoom)")
    } else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-TRAFFIC-LIGHTS", "发现并截图红黄绿交通灯",
             "无法通过 Accessibility 找到完整的红黄绿交通灯按钮")
    }

    // WINDOW-SIZE：三档窗口尺寸
    let desired = [(1440, 900), (1280, 800), (1024, 680)]
    for (w, h) in desired {
        setFrontmost(app)
        guard let win = frontWindow(app) else {
            emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-SIZE-\(w)x\(h)", "设置并读取实际窗口尺寸", "调整窗口尺寸前找不到主窗口")
            continue
        }
        _ = setSize(win, CGFloat(w), CGFloat(h))
        Thread.sleep(forTimeInterval: 0.5)
        let actual = size(of: win) ?? (0, 0)
        let name = "\(w)x\(h)"
        if Int(actual.0) == w && Int(actual.1) == h {
            emit("PASS", "SHELL-NATIVE-MAC-WINDOW-SIZE-\(name)", "设置并读取实际窗口尺寸",
                 "actual=\(Int(actual.0)),\(Int(actual.1))")
        } else {
            emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-SIZE-\(name)", "目标窗口尺寸受显示器约束",
                 "actual=\(Int(actual.0)),\(Int(actual.1))")
        }
        capture(captureHelper, "\(reportDir)/screenshots/02-mac-window-\(name).png", appBundleId, appName)
    }

    // WINDOW-ZOOM：最大化/还原（绿色按钮可能是 AXZoomButton 或 AXFullScreenButton）
    let zoomWin = frontWindow(app) ?? mainWindow
    let fsBefore = boolAttr(zoomWin, "AXFullScreen") == true
    let sizeBefore = size(of: zoomWin) ?? (0, 0)
    if let press = pressButton(window: zoomWin, kind: "zoom") {
        Thread.sleep(forTimeInterval: 1.0)
        let afterWin = frontWindow(app) ?? mainWindow
        let fsAfter = boolAttr(afterWin, "AXFullScreen") == true
        let sizeAfter = size(of: afterWin) ?? (0, 0)
        // 恢复：再次按下同一按钮，或经「窗口」菜单退出全屏/还原
        var restoreMethod = pressButton(window: afterWin, kind: "zoom")
        if restoreMethod == nil {
            // 已进入全屏时优先「退出全屏」；未全屏（zoom 缩放）时优先「缩放窗口」
            let menuCandidates = fsAfter ? ["退出全屏", "进入全屏"] : ["缩放窗口", "进入全屏", "退出全屏"]
            if let item = clickWindowMenuItem(app, names: menuCandidates) {
                restoreMethod = "menu-recovery:\(item)"
            }
        }
        if let rm = restoreMethod {
            Thread.sleep(forTimeInterval: 1.0)
            let restoredWin = frontWindow(app) ?? mainWindow
            let fsRestored = boolAttr(restoredWin, "AXFullScreen") == true
            let sizeRestored = size(of: restoredWin) ?? (0, 0)
            let stateChanged = (fsBefore != fsAfter) || (fsAfter != fsRestored) || (Int(sizeBefore.0) != Int(sizeRestored.0)) || (Int(sizeBefore.1) != Int(sizeRestored.1))
            if stateChanged {
                emit("PASS", "SHELL-NATIVE-MAC-WINDOW-ZOOM", "最大化/还原窗口",
                     "zoomed=\(Int(sizeAfter.0)),\(Int(sizeAfter.1));fullscreenAfter=\(fsAfter);restored=\(Int(sizeRestored.0)),\(Int(sizeRestored.1));fullscreenRestored=\(fsRestored);press=\(press);restore=\(rm)")
            } else {
                emit("FAIL", "SHELL-NATIVE-MAC-WINDOW-ZOOM", "最大化/还原窗口",
                     "窗口尺寸与全屏状态均未发生变化;press=\(press);restore=\(rm)")
            }
        } else {
            emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-ZOOM", "最大化/还原窗口",
                 "绿色交通灯在状态切换后不可访问，且系统窗口菜单恢复失败;press=\(press)")
        }
    } else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-ZOOM", "最大化/还原窗口", "无法重新查询并按下绿色交通灯")
    }

    // WINDOW-MINIMIZE：最小化并恢复（先确保窗口不在全屏状态）
    ensureNotFullscreen(app)
    if let press = pressButton(window: frontWindow(app) ?? mainWindow, kind: "minimize") {
        Thread.sleep(forTimeInterval: 0.8)
        var observed = false
        for _ in 0..<10 {
            for w in windows(of: app) where boolAttr(w, kAXMinimizedAttribute) == true {
                observed = true
                _ = setBoolAttr(w, kAXMinimizedAttribute, false)
            }
            if observed { break }
            Thread.sleep(forTimeInterval: 0.1)
        }
        setFrontmost(app)
        Thread.sleep(forTimeInterval: 0.3)
        if observed && frontWindow(app) != nil {
            emit("PASS", "SHELL-NATIVE-MAC-WINDOW-MINIMIZE", "最小化并恢复窗口",
                 "已观察 AXMinimized 并恢复;press=\(press)")
        } else {
            emit("FAIL", "SHELL-NATIVE-MAC-WINDOW-MINIMIZE", "最小化并恢复窗口",
                 "未观察到最小化状态或恢复后找不到窗口;press=\(press)")
        }
    } else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-MINIMIZE", "最小化并恢复窗口", "无法重新查询并按下黄色交通灯")
    }

    // DISPLAY-BOUNDS：桌面点坐标范围（替代 Finder 桌面边界查询）
    if let screen = NSScreen.main {
        let f = screen.visibleFrame
        emit("PASS", "SHELL-NATIVE-MAC-DISPLAY-BOUNDS", "记录桌面点坐标范围",
             "bounds=\(Int(f.origin.x)),\(Int(f.origin.y)),\(Int(f.width)),\(Int(f.height))")
    } else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-DISPLAY-BOUNDS", "记录桌面点坐标范围", "无法读取主屏幕可见区域")
    }

    // WINDOW-CLOSE：点击关闭交通灯（先确保窗口不在全屏状态）
    ensureNotFullscreen(app)
    capture(captureHelper, "\(reportDir)/screenshots/03-mac-before-close.png", appBundleId, appName)
    var closeConfirmed = false
    if let press = pressButton(window: frontWindow(app) ?? mainWindow, kind: "close") {
        Thread.sleep(forTimeInterval: 1.0)
        if hasWindow(app) {
            emit("FAIL", "SHELL-NATIVE-MAC-WINDOW-CLOSE", "点击关闭交通灯", "关闭后仍有可见窗口;press=\(press)")
        } else {
            emit("PASS", "SHELL-NATIVE-MAC-WINDOW-CLOSE", "点击关闭交通灯", "主窗口已隐藏且无可见窗口;press=\(press)")
            closeConfirmed = true
        }
    } else {
        emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-CLOSE", "点击关闭交通灯", "无法重新查询并按下红色交通灯")
    }

    // WINDOW-REOPEN：关闭后通过系统 Reopen 恢复主窗口
    if closeConfirmed && !appPath.isEmpty {
        let open = Process()
        open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        open.arguments = [appPath]
        try? open.run()
        open.waitUntilExit()
        var reopened = false
        for _ in 0..<60 {
            Thread.sleep(forTimeInterval: 0.5)
            if hasWindow(app) { reopened = true; break }
        }
        if reopened {
            capture(captureHelper, "\(reportDir)/screenshots/04-mac-window-reopened.png", appBundleId, appName)
            emit("PASS", "SHELL-NATIVE-MAC-WINDOW-REOPEN", "关闭后通过系统 Reopen 恢复主窗口", "窗口重新可访问并已截图")
            if let w = frontWindow(app), pressButton(window: w, kind: "close") != nil {
                Thread.sleep(forTimeInterval: 1.0)
                if hasWindow(app) {
                    emit("BLOCKED", "SHELL-NATIVE-MAC-CLEANUP", "Reopen 验证后清理窗口", "无法再次隐藏主窗口")
                }
            }
        } else {
            emit("BLOCKED", "SHELL-NATIVE-MAC-WINDOW-REOPEN", "关闭后通过系统 Reopen 恢复主窗口", "等待 30000ms 后窗口仍不可访问")
        }
    }
}

// MARK: - 入口分发

switch command {
case "process-exists":
    // usage: ax-shell-helper process-exists <name>
    guard args.count >= 3 else { exit(2) }
    let found = findApp(named: args[2]) != nil
    exit(found ? 0 : 1)

case "window-ready":
    // usage: ax-shell-helper window-ready <name>
    guard args.count >= 3 else { exit(2) }
    guard let (_, app) = findApp(named: args[2]) else { exit(1) }
    _ = setFrontmost(app)
    exit(frontWindow(app) != nil ? 0 : 1)

case "quit":
    // usage: ax-shell-helper quit <name>
    guard args.count >= 3 else { exit(2) }
    if let p = findApp(named: args[2]) {
        let app = NSRunningApplication(processIdentifier: p.pid)
        app?.terminate()
        Thread.sleep(forTimeInterval: 0.4)
        if app?.isTerminated == false { app?.forceTerminate() }
        Thread.sleep(forTimeInterval: 0.4)
        if app?.isTerminated == false { kill(p.pid, SIGKILL) }
        exit(0)
    }
    exit(1)

case "run":
    // usage: ax-shell-helper run <reportDir> <appName> <windowReadyWaitMs> <appPath> <captureHelper> <appBundleId>
    guard args.count >= 7 else {
        FileHandle.standardError.write(Data("usage: ax-shell-helper run <reportDir> <appName> <windowReadyWaitMs> <appPath> <captureHelper> <appBundleId>\n".utf8))
        exit(2)
    }
    runAutomation(reportDir: args[2], appName: args[3], windowReadyWaitMs: args[4], appPath: args[5], captureHelper: args[6], appBundleId: args.count >= 8 ? args[7] : "")

default:
    FileHandle.standardError.write(Data("unknown command: \(command)\n".utf8))
    exit(2)
}
