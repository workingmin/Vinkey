#[cfg(any(target_os = "macos", test))]
#[path = "window_controls_layout.rs"]
mod layout;

#[tauri::command]
pub async fn sync_native_window_controls(
    window: tauri::WebviewWindow,
    sidebar_width: f64,
) -> Result<(), String> {
    if !sidebar_width.is_finite() || sidebar_width < 40.0 {
        return Err("Invalid sidebar width for native window controls".into());
    }
    if window.label() != "main" {
        return Err("Native window controls are only available on the main window".into());
    }
    #[cfg(target_os = "macos")]
    {
        let (send, receive) = tokio::sync::oneshot::channel();
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = send.send(native::apply(&target, Some(sidebar_width)));
            })
            .map_err(|error| error.to_string())?;
        receive.await.map_err(|error| error.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    Ok(())
}

#[cfg(target_os = "macos")]
pub use native::install;

#[cfg(target_os = "macos")]
mod native {
    use objc2_app_kit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use std::sync::Mutex;
    use tauri::{Manager, WebviewWindow, WindowEvent};

    #[derive(Default)]
    struct LayoutState {
        sidebar_width: Option<f64>,
        baseline: Option<([NSRect; 3], [NSRect; 3])>,
    }

    #[derive(Default)]
    struct WindowControls(Mutex<LayoutState>);

    pub fn install(window: &WebviewWindow) -> Result<(), String> {
        window.app_handle().manage(WindowControls::default());
        apply(window, None)?;
        let target = window.clone();
        window.on_window_event(move |event| {
            if matches!(
                event,
                WindowEvent::Resized(_)
                    | WindowEvent::ScaleFactorChanged { .. }
                    | WindowEvent::Focused(true)
                    | WindowEvent::ThemeChanged(_)
            ) {
                let window = target.clone();
                if let Err(error) = target.run_on_main_thread(move || {
                    if let Err(error) = apply(&window, None) {
                        eprintln!("Native window controls layout failed: {error}");
                    }
                }) {
                    eprintln!("Native window controls dispatch failed: {error}");
                }
            }
        });
        Ok(())
    }

    // Called only on the AppKit main thread; no native pointers leave this scope.
    pub(super) fn apply(window: &WebviewWindow, sidebar_width: Option<f64>) -> Result<(), String> {
        let state = window.state::<WindowControls>();
        let mut state = state.0.lock().map_err(|error| error.to_string())?;
        if let Some(width) = sidebar_width {
            state.sidebar_width = Some(width);
        }
        let pointer = window.ns_window().map_err(|error| error.to_string())?;
        let native = unsafe { (pointer as *const NSWindow).as_ref() }
            .ok_or("Native window is unavailable")?;
        // AppKit owns the fullscreen title bar. The exit resize event restores our layout.
        if native.styleMask().contains(NSWindowStyleMask::FullScreen) {
            return Ok(());
        }
        let buttons = [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ]
        .map(|kind| native.standardWindowButton(kind));
        let [Some(close), Some(minimize), Some(zoom)] = buttons else {
            return Err("Native window buttons are unavailable".into());
        };
        let buttons = [close, minimize, zoom];
        let (frames, bounds) = *state.baseline.get_or_insert_with(|| {
            (
                std::array::from_fn(|index| NSView::frame(&buttons[index])),
                std::array::from_fn(|index| buttons[index].bounds()),
            )
        });
        let Some(sidebar_width) = state.sidebar_width else {
            return Ok(());
        };
        let native_width = frames[2].origin.x + frames[2].size.width - frames[0].origin.x;
        if native_width <= 0.0 {
            return Err("Native window button geometry is invalid".into());
        }
        let (left, scale) =
            super::layout::fitted_group(sidebar_width, native_width, frames[0].origin.x);
        let parent =
            unsafe { buttons[0].superview() }.ok_or("Window button container is missing")?;
        let title_bar = unsafe { parent.superview() }.ok_or("Native title bar is missing")?;
        // Keep the original title bar height: Wry recalculates it from the scaled close button.
        let height = frames
            .iter()
            .map(|frame| frame.size.height)
            .fold(0.0, f64::max)
            + 17.0;
        let mut title_frame = title_bar.frame();
        title_frame.size.height = height;
        title_frame.origin.y = native.frame().size.height - height;
        if title_bar.frame() != title_frame {
            title_bar.setFrame(title_frame);
        }
        for (index, button) in buttons.iter().enumerate() {
            let frame = frames[index];
            let size = NSSize::new(frame.size.width * scale, frame.size.height * scale);
            let position = NSPoint::new(
                left + (frame.origin.x - frames[0].origin.x) * scale,
                native.frame().size.height - 21.0 - size.height / 2.0,
            );
            button.setFrame(parent.convertRect_fromView(NSRect::new(position, size), None));
            // Preserve native drawing coordinates so visuals and hit testing scale together.
            button.setBounds(bounds[index]);
        }
        Ok(())
    }
}
