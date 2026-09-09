use serde::Serialize;
use std::{
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalHardware {
    pub platform: String,
    pub architecture: String,
    pub total_memory_bytes: Option<u64>,
    pub gpu_memory_bytes: Option<u64>,
    pub unified_memory: bool,
}

// Hardware utilities must not hold the settings page indefinitely.
fn output(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                return String::from_utf8(child.wait_with_output().ok()?.stdout).ok();
            }
            Ok(Some(_)) => return None,
            Ok(None) if started.elapsed() < Duration::from_secs(5) => {
                thread::sleep(Duration::from_millis(50))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn nvidia_memory() -> Option<u64> {
    output(
        "nvidia-smi",
        &["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
    )?
    .lines()
    .filter_map(|line| line.trim().parse::<u64>().ok())
    .filter_map(|mib| mib.checked_mul(1024 * 1024))
    .max()
}

pub fn detect() -> LocalHardware {
    let mut hardware = LocalHardware {
        platform: std::env::consts::OS.into(),
        architecture: std::env::consts::ARCH.into(),
        total_memory_bytes: None,
        gpu_memory_bytes: None,
        unified_memory: false,
    };
    match std::env::consts::OS {
        "macos" => {
            hardware.total_memory_bytes = output("/usr/sbin/sysctl", &["-n", "hw.memsize"])
                .and_then(|value| value.trim().parse().ok());
            // hw.optional.arm64 also identifies Apple Silicon under Rosetta.
            hardware.unified_memory = output("/usr/sbin/sysctl", &["-n", "hw.optional.arm64"])
                .is_some_and(|value| value.trim() == "1");
        }
        "windows" => {
            // AdapterRAM is a 32-bit WMI field and cannot represent modern GPUs.
            let script = r#"$ram=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; $gpu=@(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\*' -ErrorAction SilentlyContinue | ForEach-Object { $m=$_.'HardwareInformation.qwMemorySize'; if($m -is [byte[]] -and $m.Length -eq 8){[BitConverter]::ToUInt64($m,0)} elseif($m -is [long] -or $m -is [ulong]){[ulong]$m} } | Measure-Object -Maximum).Maximum; @{ram=$ram; gpu=$gpu} | ConvertTo-Json -Compress"#;
            if let Some(value) = output(
                "powershell.exe",
                &["-NoProfile", "-NonInteractive", "-Command", script],
            )
            .and_then(|value| serde_json::from_str::<serde_json::Value>(value.trim()).ok())
            {
                hardware.total_memory_bytes = value["ram"].as_u64();
                hardware.gpu_memory_bytes = value["gpu"].as_u64().filter(|value| *value > 0);
            }
            hardware.gpu_memory_bytes = nvidia_memory().or(hardware.gpu_memory_bytes);
        }
        "linux" => {
            hardware.total_memory_bytes =
                std::fs::read_to_string("/proc/meminfo")
                    .ok()
                    .and_then(|value| {
                        value.lines().find_map(|line| {
                            line.strip_prefix("MemTotal:")
                                .and_then(|value| {
                                    value.split_whitespace().next()?.parse::<u64>().ok()
                                })
                                .and_then(|kib| kib.checked_mul(1024))
                        })
                    });
            hardware.gpu_memory_bytes = nvidia_memory().or_else(|| {
                std::fs::read_dir("/sys/class/drm")
                    .ok()?
                    .filter_map(Result::ok)
                    .filter_map(|entry| {
                        std::fs::read_to_string(entry.path().join("device/mem_info_vram_total"))
                            .ok()
                    })
                    .filter_map(|value| value.trim().parse::<u64>().ok())
                    .filter(|value| *value > 0)
                    .max()
            });
        }
        _ => {}
    }
    hardware
}
