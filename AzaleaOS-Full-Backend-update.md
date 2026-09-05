# AzaleaOS Full App - Backend / Native Core Blueprint

> Dokumen ini adalah spesifikasi backend/native core khusus untuk **AzaleaOS Full**, yaitu **aplikasi Windows terpisah** dengan binary, app identity, installer, dan local data path sendiri.
>
> Backend bukan backend web. Ia adalah **local native core Rust** yang berjalan di Windows dan menghubungkan frontend Tauri dengan Windows APIs, process/window management, filesystem, resource metrics, application discovery, dan resource lifecycle.
>
> **AzaleaOS Full tidak memakai runtime switch untuk berubah menjadi edition lain.** Shared source code boleh digunakan untuk maintenance, tetapi build output dan capability surface harus dipisahkan.


# 0. ATURAN EKSEKUSI UNTUK AI AGENT

## 0.1 WAJIB STEP-BY-STEP

- Edition aktif: **AzaleaOS Full**.
- Binary: `azaleaos-full.exe`.
- App ID: `com.azalea.azaleaos.full`.
- Install/config/log/cache paths harus terpisah dari AzaleaOS Lite.
- Tidak ada runtime switch `lite` ↔ `full`.
- Capability authority berada di native build/configuration contract, bukan frontend atau file JSON user.


AI agent hanya boleh mengerjakan **satu STEP aktif**.

Setelah acceptance criteria STEP aktif terpenuhi:

```text
STOP.
Jangan lanjut ke STEP berikutnya.
Tunggu perintah user.
```

Tidak boleh melakukan beberapa STEP sekaligus karena dependency terlihat sederhana.

## 0.2 Backend adalah local native core

Tidak ada:

- backend server;
- REST API publik;
- GraphQL server;
- cloud database;
- auth server;
- remote command execution;
- cloud dependency untuk core feature.

Arsitektur:

```text
React/TypeScript
      ↓
Tauri IPC
      ↓
Rust Native Core
      ↓
Windows APIs / Windows Runtime
      ↓
Windows
```

Tauri menyediakan mekanisme komunikasi dua arah antara frontend dan Rust melalui commands, events, dan channels. citeturn306474search6

---

# 1. TUJUAN BACKEND

Backend bertanggung jawab atas:

```text
App Discovery
Process Monitoring
Window Tracking
Window Management
CPU Monitoring
RAM Monitoring
GPU Monitoring jika tersedia
Disk Activity
Network Activity
Application Classification
Application Launch
Application Lifecycle
Resource Policy
Adaptive Resource Management
Filesystem Integration
Global Hotkeys
Local Configuration
Logging
Diagnostics
Crash/Recovery Supervision
Edition/Capability Enforcement
```

Backend tidak bertanggung jawab atas:

- visual layout;
- warna;
- spacing;
- animation;
- UI navigation;
- visual tab state.

---

# 2. STACK BACKEND YANG DIKUNCI

## 2.1 Bahasa

```text
Rust
```

Gunakan Rust stable dan pin versi toolchain pada repository agar build reproducible.

## 2.2 Desktop bridge

```text
Tauri 2.x
```

## 2.3 Windows API

Gunakan Windows APIs melalui crate Rust yang sesuai, terutama ekosistem `windows`/`windows-sys` sesuai kebutuhan modul.

## 2.4 Storage

MVP:

```text
JSON / TOML / small local config files
```

SQLite **tidak wajib**.

Gunakan SQLite hanya jika kebutuhan history/index/query sudah benar-benar melebihi file config sederhana.

## 2.5 Filesystem

User files selalu berada pada filesystem Windows.

Backend tidak membuat:

```text
AzaleaDrive
AzaleaFS
Virtual user filesystem
```

---


# 2A. SEPARATE APP IDENTITY - AZALEAOS FULL

Backend Full harus dibangun dan dipaketkan sebagai native application terpisah.

```text
Product Name       = AzaleaOS Full
Executable         = azaleaos-full.exe
App ID             = com.azalea.azaleaos.full
Config root        = %LOCALAPPDATA%\AzaleaOS\Full
Cache root         = %LOCALAPPDATA%\AzaleaOS\Full\Cache
Logs root          = %LOCALAPPDATA%\AzaleaOS\Full\Logs

Max OS Tabs        = 10
Max apps / OS Tab  = 10
```

### Build boundary

- Tidak ada runtime switch yang mengubah edition.
- Capability limit adalah compile/build product contract dan divalidasi lagi oleh Rust core.
- Shared internal crates/modules diperbolehkan untuk mengurangi duplikasi, tetapi binary identity dan installer tetap terpisah.
- Lite dan Full harus dapat di-install berdampingan tanpa berbagi config/cache/log secara tidak sengaja.

# 3. BACKEND ARCHITECTURE

```text
src-tauri/
│
├── app_core/
│   ├── state.rs
│   ├── edition.rs
│   └── capabilities.rs
│
├── applications/
│   ├── discovery.rs
│   ├── descriptor.rs
│   ├── launcher.rs
│   ├── classifier.rs
│   └── registry.rs
│
├── processes/
│   ├── discovery.rs
│   ├── identity.rs
│   ├── metrics.rs
│   └── lifecycle.rs
│
├── windows/
│   ├── enumeration.rs
│   ├── identity.rs
│   ├── tracking.rs
│   ├── focus.rs
│   ├── bounds.rs
│   └── host.rs
│
├── resources/
│   ├── cpu.rs
│   ├── memory.rs
│   ├── gpu.rs
│   ├── disk.rs
│   ├── network.rs
│   ├── pressure.rs
│   └── sampler.rs
│
├── resource_manager/
│   ├── policy.rs
│   ├── state.rs
│   ├── safety.rs
│   ├── activity.rs
│   ├── protection.rs
│   └── optimizer.rs
│
├── filesystem/
│   ├── browse.rs
│   ├── operations.rs
│   ├── picker.rs
│   └── recent.rs
│
├── workspace/
│   ├── model.rs
│   ├── manager.rs
│   └── persistence.rs
│
├── hotkeys/
│   └── global.rs
│
├── config/
│   ├── schema.rs
│   └── repository.rs
│
├── diagnostics/
│   ├── logging.rs
│   ├── crash.rs
│   └── report.rs
│
├── ipc/
│   ├── commands.rs
│   ├── events.rs
│   └── DTOs
│
└── main.rs
```

---

# 4. NATIVE DATA OWNERSHIP

## 4.1 Backend adalah source of truth untuk native state

Frontend boleh meminta:

```text
app state
process metrics
window state
resource state
```

Tetapi frontend tidak boleh mengarangnya.

## 4.2 ID system

Gunakan ID internal Azalea, jangan bergantung pada nama aplikasi sebagai identifier.

Contoh:

```text
appId: stable generated identifier
processId: Windows PID
windowId: HWND represented safely
workspaceId: UUID
appTabId: UUID
```

---

# 5. APPLICATION DISCOVERY

## 5.1 Tujuan

Mendeteksi aplikasi Windows yang terpasang dan dapat diluncurkan.

Sumber discovery dapat mencakup:

- Start Menu shortcuts;
- registered applications;
- known install metadata;
- executable path yang valid;
- Windows application registration.

Jangan hanya scan seluruh disk `C:\` karena mahal dan menghasilkan noise.

## 5.2 Descriptor

```rust
struct AppDescriptor {
    id: String,
    name: String,
    executable_path: Option<String>,
    icon_ref: Option<String>,
    source: AppSource,
    category: AppCategory,
    supported: bool,
    unsupported_reason: Option<String>,
}
```

---

# 6. GAME CLASSIFICATION

User menetapkan bahwa game secara default ditolak dari normal Azalea application management.

Tetapi Windows tidak selalu menyediakan metadata sederhana yang mengatakan "ini game".

Maka gunakan classifier berlapis:

```text
Executable metadata
+
Known publisher/package information
+
Known game launcher/install patterns
+
Shortcut metadata
+
Heuristics
+
Optional user override
```

Output:

```text
GAME
NON_GAME
UNKNOWN
```

### UNKNOWN

Jangan otomatis memblokir.

Gunakan safe default:

```text
UNKNOWN → allow launch, conservative management
```

Kecuali user/product policy mengaturnya.

---

# 7. APPLICATION LAUNCHER

Backend menerima:

```text
app.launch(appId)
```

Flow:

```text
AppDescriptor
   ↓
Validate executable
   ↓
Validate supported state
   ↓
Create process
   ↓
Wait for process/window
   ↓
Bind runtime identity
   ↓
Emit app.started
```

Jangan melakukan shell command string concatenation.

Gunakan structured process creation.

---

# 8. PROCESS MANAGER

## 8.1 Data

Backend minimal membaca:

- PID;
- executable name;
- executable path bila tersedia;
- process start time;
- CPU usage;
- memory metrics;
- child-process relation bila tersedia;
- status.

## 8.2 RAM metric

Gunakan metrik yang tepat dan konsisten.

Untuk proses Windows, Working Set, Private Usage/Commit, dan metrik terkait memiliki arti berbeda. Windows mendokumentasikan Working Set sebagai halaman memori yang sedang resident dan tersedia untuk digunakan tanpa page fault tertentu; nilai ini merupakan snapshot yang dipengaruhi kondisi sistem dan trimming OS. citeturn306474search0turn306474search1

**Jangan menampilkan satu angka seolah-olah itu "seluruh RAM aplikasi".**

MVP Resource Center:

```text
RAM / Working Set
Private / Commit jika aman tersedia
```

Label harus jelas.

---

# 9.3 CPU METRIC

Gunakan sampling interval yang stabil.

Jangan membaca CPU ratusan kali per detik.

Windows mendokumentasikan performance counters sebagai mekanisme pengukuran resource, tetapi untuk akses berfrekuensi lebih tinggi dapat digunakan API yang lebih langsung. citeturn306474search11

Target sampling internal dapat berbeda per metric.

UI tidak perlu menerima setiap sample.

---

# 10. WINDOW TRACKING

Windows menyediakan API seperti `EnumWindows` untuk enumerasi top-level windows dan `GetWindowThreadProcessId` untuk mengaitkan window dengan process identifier. citeturn306474search14turn306474search7

Gunakan ini untuk membangun mapping:

```text
App
  ↓
Process(es)
  ↓
Window(s)
```

## 10.1 Window identity

```text
HWND
PID
process start time
window title
class name jika relevan
visibility
bounds
foreground state
```

Jangan mengandalkan HWND saja sebagai identity permanen.

HWND dapat berubah ketika aplikasi membuat ulang window.

---

# 11. WINDOW MANAGEMENT

Azalea perlu mengetahui:

- active window;
- window position;
- size;
- visibility;
- focus;
- minimize/restore;
- ownership/parenting relationship jika digunakan.

## 11.1 Embedding warning

**Jangan langsung mengasumsikan semua aplikasi Windows bisa di-embed dengan aman ke dalam satu Tauri window.**

Teknik seperti window parenting/reparenting menggunakan Win32 memiliki batasan dan perilaku berbeda berdasarkan aplikasi.

Dokumentasi Microsoft menegaskan perbedaan owner/parent dan penggunaan API seperti `SetParent`, sehingga integrasi native window harus diprototipe dan diuji per aplikasi. citeturn306474search3turn306474search4

### Strategy wajib

```text
MODE A: Managed/Hosted Window
MODE B: External Managed Window
MODE C: Unsupported
```

Backend mengembalikan:

```text
integrationMode
```

Frontend menyesuaikan UI.

Ini mencegah seluruh produk bergantung pada satu teknik fragile.

---

# 12. WORKSPACE MANAGER

Workspace model:

```rust
Workspace {
    id,
    name,
    order,
    app_tab_ids,
}
```

Workspace bukan filesystem.

Workspace hanya metadata + runtime association.

User files tetap Windows.

---

# 13. APP TAB MANAGER

Model:

```text
AppTab
├── id
├── workspace_id
├── app_id
├── runtime_id
├── lifecycle_state
├── protection_state
├── resource_state
└── last_focus_timestamp
```

Satu aplikasi bisa memiliki lebih dari satu window.

Jangan membuat asumsi:

```text
1 app = 1 process
1 app = 1 window
```

Browser modern, IDE, electron apps, launcher, dan banyak aplikasi lain dapat menggunakan beberapa process. Windows sendiri menyediakan konsep performance/work-unit yang menunjukkan bahwa satu aplikasi dapat menggunakan beberapa process/work unit. citeturn306474search12

---

# 14. RESOURCE MONITOR

Modul:

```text
CPU
RAM
GPU
Disk
Network
```

## 14.1 System snapshot

```rust
SystemResourceSnapshot {
    cpu_percent,
    ram_total,
    ram_used,
    ram_available,
    gpu_percent: Option<f32>,
    disk_activity,
    network_rx,
    network_tx,
    timestamp,
}
```

## 14.2 Process snapshot

```rust
ProcessResourceSnapshot {
    pid,
    cpu_percent,
    working_set_bytes,
    private_bytes: Option<u64>,
    timestamp,
}
```

---

# 15. RESOURCE PRESSURE ENGINE

Jangan gunakan hanya satu angka RAM.

Input:

```text
Available RAM
System memory load
Committed memory jika tersedia
Active app count
Background app count
Disk pressure
Recent paging/latency signals jika tersedia
```

Output:

```text
NORMAL
MODERATE
HIGH
CRITICAL
```

Tujuan:

> menentukan seberapa agresif Azalea boleh mengurangi resource background.

---

# 16. APPLICATION ACTIVITY ENGINE

Backend harus menentukan apakah aplikasi masih melakukan pekerjaan penting.

Input yang mungkin:

```text
foreground state
CPU activity
network activity
disk I/O
child processes
known app profile
known operation state
```

Contoh:

```text
Chrome
Network ↑
Download active
Foreground = false

→ BACKGROUND + PROTECTED
```

File copy:

```text
Disk I/O ↑
Known file operation

→ PROTECTED
```

Game:

```text
Category = GAME

→ GAME PROTECTED
```

---

# 17. LIFECYCLE ENGINE

State resmi:

```text
ACTIVE
BACKGROUND
PROTECTED
OPTIMIZING
GAME
UNSUPPORTED
ERROR
```

Flow normal:

```text
ACTIVE
  ↓ user changes focus
BACKGROUND
  ↓ important work?
  ├── YES → PROTECTED
  └── NO
       ↓
   resource pressure?
       ├── NO → BACKGROUND
       └── YES → OPTIMIZING
```

Jika user kembali:

```text
BACKGROUND / PROTECTED / OPTIMIZING
            ↓
         ACTIVE
```

---

# 18. "FREEZE" BUKAN TUJUAN UTAMA

Azalea **tidak boleh** memiliki aturan:

```text
not focused = freeze
```

Tujuan sebenarnya:

> **Adaptive Background Resource Management**

Aplikasi tetap berjalan bila memungkinkan.

Resource dikurangi secara bertahap dan aman.

---

# 19. SAFE RESOURCE REDUCTION

## 19.1 Prinsip

Jika aplikasi background dan tidak sedang melakukan tugas penting:

```text
observe
 ↓
light intervention
 ↓
measure
 ↓
check stability
 ↓
intervene again only if safe
```

Tidak boleh:

```text
RAM 1.2 GB
↓
force to 300 MB
```

## 19.2 Windows memory reality

Windows menyediakan APIs untuk membaca dan memengaruhi working set, termasuk `GetProcessMemoryInfo` dan working-set related APIs. Microsoft juga memperingatkan bahwa memanipulasi working set terlalu agresif dapat menurunkan performa dan bukan jaminan bahwa memory akan benar-benar "hilang" dari kebutuhan proses. citeturn306474search1turn306474search10

Karena itu Azalea harus menganggap optimisasi sebagai **best-effort**, bukan angka yang dijamin.

---

# 20. OPTIMIZATION LEVELS

Gunakan tiga level implementasi:

### LEVEL 0 - Observe

Tidak melakukan intervensi.

### LEVEL 1 - Gentle

- menurunkan background priority bila aman;
- meminta/reclaim memory secara konservatif bila aman;
- mengurangi pekerjaan Azalea sendiri yang tidak perlu;
- monitor hasil.

### LEVEL 2 - Aggressive

Hanya ketika:

```text
resource pressure HIGH/CRITICAL
+
app BACKGROUND
+
not PROTECTED
+
not GAME
+
policy allows
```

Tindakan agresif harus melalui safety governor.

---

# 21. SAFETY GOVERNOR

Sebelum tindakan optimisasi:

```text
Is app foreground?
Is download active?
Is file operation active?
Is video/audio operation active?
Is game?
Is process protected?
Has app recently crashed?
Is system already under disk pressure?
Did previous intervention improve anything?
```

Jika salah satu condition kritis terpenuhi:

```text
DO NOT OPTIMIZE
```

---

# 22. DOWNLOAD PROTECTION

Contoh Chrome download:

```text
Chrome
Foreground: false
Network activity: high
Known download: true

State = PROTECTED
```

Setelah download selesai:

```text
Protected → Background
```

Baru optimization policy boleh bekerja.

### Penting

Backend **tidak boleh menganggap semua network activity = download**.

Gunakan:

- app-specific provider bila memungkinkan;
- explicit integration bila tersedia;
- heuristic sebagai fallback.

Jika tidak yakin:

```text
unknown → protect
```

lebih baik daripada merusak proses user.

---

# 23. GAME POLICY

Default:

```text
GAME
 ↓
No aggressive optimization
```

Game tetap bisa:

```text
DISCOVERED
LAUNCHED
MONITORED
```

Tetapi tidak dimasukkan ke normal resource optimization.

Nantinya dapat dibuat Game Mode, tetapi itu bukan MVP pertama.

---

# 24. MEMORY BUDGET

AzaleaOS Full exposes a advanced resource policy. Any numeric budget is a target/pressure threshold, not a hard guarantee that Windows applications will stay under an exact RAM value.

Jika user memilih budget 2 GB:

**Jangan memperlakukan ini sebagai kontrak keras:**

```text
All managed apps must total ≤ 2 GB
```

Gunakan sebagai:

```text
optimization target / pressure threshold
```

Karena working set dan memory behavior bergantung pada Windows, aplikasi, dan kondisi sistem. citeturn306474search0turn306474search1

---

# 25. BACKGROUND RESOURCE STRATEGY

Strategi:

```text
ACTIVE
→ full normal priority

BACKGROUND
→ no forced optimization unless needed

PROTECTED
→ no optimization

OPTIMIZING
→ gentle resource intervention

GAME
→ protected by default
```

Ini membuat user yang berpindah app selama 2 detik tidak merasakan perubahan besar.

---

# 26. FRONTEND EVENT STREAM

Backend harus emit event, misalnya:

```text
app.discovered
app.started
app.exited
app.state_changed
app.protection_changed
app.optimization_started
app.optimization_finished

window.created
window.destroyed
window.focused
window.bounds_changed

resource.snapshot
resource.pressure_changed

workspace.changed

system.error
```

Jangan mengirim event dengan frekuensi tidak terkendali.

Gunakan throttling/coalescing.

---

# 27. IPC CONTRACT

## 27.1 Command

Commands bersifat request/response.

Contoh:

```text
app.list
app.launch
app.get
app.close

window.list
window.focus
window.minimize
window.restore
window.get_bounds

resource.snapshot
resource.get_process

workspace.list
workspace.create
workspace.rename
workspace.close
workspace.switch

filesystem.list
filesystem.create_folder
filesystem.rename
filesystem.delete
filesystem.open
```

## 27.2 Event

Events bersifat asynchronous.

Contoh:

```text
resource.snapshot
resource.pressure_changed
app.state_changed
window.focused
```

---

# 28. IPC DTO RULES

Jangan expose internal Rust struct sembarangan.

Buat DTO khusus untuk frontend:

```text
internal model
    ↓
DTO mapping
    ↓
Tauri IPC
```

Tujuannya agar perubahan internal tidak merusak frontend.

---

# 29. LOCAL CONFIG

Direktori data:

```text
AzaleaOS/
├── config/
├── workspaces/
├── cache/
├── logs/
└── diagnostics/
```

Contoh config:

```json
{
  "edition": "full",
  "theme": "system",
  "sidebarMode": "compact",
  "shortcuts": {},
  "resourcePolicy": {
    "mode": "smart",
    "backgroundOptimization": true
  }
}
```

User files **tidak** disimpan di sini.

---

# 30. SETTINGS OWNERSHIP

Backend menyimpan preference Azalea:

- theme;
- sidebar;
- workspace metadata;
- resource policy;
- app policy;
- shortcut mapping;
- notification preference.

Backend **tidak** menjadikan config Azalea sebagai sumber kebenaran untuk Windows itself.

---

# 31. FILESYSTEM BRIDGE

Frontend meminta:

```text
filesystem.list(path)
```

Backend:

```text
validate path
 ↓
Windows filesystem API
 ↓
DTO
 ↓
frontend
```

## Security

MVP boleh memberi akses user-selected path dan normal Windows user permissions.

Jangan menambahkan privileged filesystem access tanpa kebutuhan.

Jangan otomatis meminta Administrator.

---

# 32. GLOBAL HOTKEYS

Default:

```text
Shift + Esc
Ctrl + Space
Ctrl + Alt + A
Ctrl + Alt + Left
Ctrl + Alt + Right
Ctrl + Alt + N
Ctrl + Alt + W
Ctrl + Tab
Ctrl + Shift + Tab
```

Backend harus:

- register;
- detect conflict jika memungkinkan;
- unregister saat shutdown;
- handle failure gracefully.

---

# 33. RESOURCE MONITOR PERFORMANCE RULE

Jangan melakukan:

```text
for every process
  every few milliseconds
    expensive Win32 calls
```

Gunakan scheduler sampling.

Contoh konsep:

```text
System metrics: ~500–1000 ms UI cadence
Process metrics: ~700–1500 ms
Window focus: event-driven bila memungkinkan
Filesystem: on-demand
App discovery: startup + explicit refresh + debounced background refresh
```

Interval akhir harus divalidasi lewat profiling nyata.

---

# 34. LOGGING

Gunakan structured logging.

Level:

```text
TRACE
DEBUG
INFO
WARN
ERROR
```

Contoh:

```text
INFO app.discovered
INFO app.started
INFO app.backgrounded
INFO resource.protection_enabled
WARN resource.optimization_skipped
ERROR window.attach_failed
```

Jangan log password, file contents, token, atau data sensitif user.

---

# 35. DIAGNOSTICS

Buat command:

```text
azalea diagnostics
```

atau equivalent internal command.

Output lokal:

```text
Azalea version
Windows version
Architecture
Edition
CPU summary
RAM summary
GPU summary
Known compatibility issues
Recent errors
```

Tidak otomatis upload ke server.

---

# 36. ERROR CATEGORIES

Gunakan error type yang eksplisit:

```text
AppNotFound
AppLaunchFailed
ProcessAccessDenied
WindowNotFound
WindowIntegrationUnsupported
ResourceReadFailed
FilesystemAccessDenied
InvalidPath
HotkeyRegistrationFailed
ConfigReadFailed
ConfigWriteFailed
UnsupportedEdition
OptimizationRejected
```

Frontend menerima error code + user-safe message.

Jangan mengirim stack trace mentah ke UI kecuali Diagnostics mode.

---

# 37. CRASH RECOVERY

Azalea harus memisahkan:

```text
Azalea Core
Azalea UI
Managed Windows Apps
```

Jika UI rusak:

```text
UI crash
 ↓
Core remains if architecture allows
 ↓
UI restart
```

Jika managed app crash:

```text
App crash
 ↓
Azalea detects process exit
 ↓
App state = ERROR / CLOSED
 ↓
User chooses restart
```

Jangan otomatis restart semua aplikasi.

---

# 38. APP STATE RESTORATION

Azalea boleh menyimpan:

- last workspace;
- app identity;
- window bounds;
- active app tab;
- app-specific metadata jika integration aman.

Azalea **tidak boleh mengklaim dapat menyimpan seluruh internal state setiap aplikasi**.

Untuk browser/IDE tertentu, state restore dapat dibantu integration provider.

Fallback:

```text
Window metadata
+
last known visual state
+
app launch parameters jika ada
```

Screenshot bukan pengganti state aplikasi.

---

# 39. PROVIDER SYSTEM

Karena setiap aplikasi berbeda, gunakan adapter/provider.

```text
AppProvider
├── ChromeProvider
├── VSCodeProvider
├── GenericWindowsAppProvider
└── FutureProvider
```

Provider dapat mendeskripsikan:

```text
canDetectActivity
canDetectProtectedTask
canRestoreLaunchContext
canManageWindow
canOptimizeSafely
```

Generic provider harus selalu tersedia.

---

# 40. NO FALSE PROMISES

Backend tidak boleh mengklaim:

```text
"RAM reduced by exactly 50%."
```

kecuali angka itu benar-benar diukur sesuai definisi metric tertentu.

Lebih tepat:

```text
Working Set before
Working Set after
System pressure before
System pressure after
```

Gunakan telemetry lokal/diagnostics untuk pengujian.

---

# 41. AZALEAOS FULL - EDITION ENFORCEMENT

Backend untuk AzaleaOS Full harus mengunci capability pada build/application identity ini. Jangan membuat one-binary edition switch.

```text
Edition                = Full
Max OS Tabs             = 10
Max apps / OS Tab       = 10
Advanced resource mgmt  = ON / FULL policy
Advanced automation     = ON
Advanced customization  = FULL
```

Rules:

1. Capability limits wajib ditegakkan di Rust/native core.
2. Command yang melampaui limit harus ditolak dengan typed error.
3. Frontend hanya merefleksikan capability yang dikirim backend.
4. Mengubah JSON/config/frontend state tidak boleh mengubah edition.
5. Binary AzaleaOS Full tidak boleh memiliki hidden flag untuk membuka capability AzaleaOS Lite.


# 42. NO DATABASE MVP

Jangan gunakan SQLite untuk:

- OS tabs sederhana;
- settings;
- shortcuts;
- app policies;
- recent workspace.

Gunakan JSON/config.

SQLite dipertimbangkan jika nanti dibutuhkan:

- resource history panjang;
- app usage analytics lokal;
- large indexed app metadata;
- automation rules kompleks;
- searchable logs.

---

# 43. SECURITY

Minimum principles:

- Least privilege.
- Jangan minta Administrator tanpa alasan.
- Validate paths.
- Validate executable paths.
- Jangan menjalankan shell command dari string user tanpa sanitization/structured API.
- Jangan expose arbitrary process control ke frontend.
- Batasi native commands.
- Log security failures.

---

# 44. TEST ENVIRONMENT

## Development

Testing utama:

```text
Developer Windows host
```

## VM

Gunakan VM sebagai sandbox tambahan untuk:

- installer;
- crash/recovery testing;
- registry/app discovery edge cases;
- aggressive resource policy experiments;
- clean-machine testing.

VM bukan pengganti hardware testing nyata.

---

# 45. TEST MATRIX

Minimal aplikasi:

```text
Chrome
VS Code
Windows Terminal
Notepad
Discord
File Explorer
One heavy application
One game
One app with multiple windows
One app with multiple processes
```

Scenarios:

```text
Launch
Focus
Background
Return quickly
Background for long time
Download
File copy
High RAM pressure
High CPU pressure
App closes
App crashes
Window recreates
Multi-monitor
Sidebar hidden
OS Tab switched
```

---

# 46. RESOURCE OPTIMIZATION TESTS

Tidak boleh langsung menguji optimizer pada semua aplikasi.

Urutan:

```text
observe-only
 ↓
read metrics
 ↓
log-only policy
 ↓
gentle policy
 ↓
measure
 ↓
selected app tests
 ↓
broader compatibility
```

Setiap tindakan optimizer harus bisa dimatikan melalui feature flag internal.

---

# 47. FEATURE FLAGS

Contoh:

```text
ENABLE_APP_DISCOVERY
ENABLE_WINDOW_HOSTING
ENABLE_RESOURCE_OPTIMIZER
ENABLE_GAME_CLASSIFIER
ENABLE_GLOBAL_HOTKEYS
ENABLE_CRASH_RECOVERY
```

Pada development, feature flag dapat diaktifkan satu per satu.

Production build tidak boleh membawa debug backdoor.

---

# 48. STEP PLAN BACKEND

## STEP 1 - Rust + Tauri Foundation

Buat:

- Tauri shell.
- Rust project structure.
- error type dasar.
- logging dasar.
- configuration directory.
- capability/edition model.
- health command.

Acceptance:

```text
Tauri starts.
Rust command responds.
Config directory created.
Logs created.
Edition reports Full and cannot be changed at runtime.
```

**STOP.**

---

## STEP 2 - Local Configuration

Implement:

- read config;
- write config;
- atomic write;
- defaults;
- schema validation;
- migration version.

Tidak ada SQLite.

**STOP.**

---

## STEP 3 - App Discovery

Implement:

- Windows app scan;
- descriptors;
- stable app IDs;
- icon metadata;
- category placeholder.

Belum melakukan optimization.

**STOP.**

---

## STEP 4 - Process Monitoring

Implement:

- PID discovery;
- process identity;
- CPU sample;
- RAM sample;
- process lifetime detection.

Acceptance:

Azalea dapat mendeteksi Chrome/VS Code/Notepad jika berjalan.

**STOP.**

---

## STEP 5 - Window Enumeration + Tracking

Implement:

- EnumWindows;
- HWND → PID mapping;
- window title;
- visibility;
- foreground detection;
- bounds;
- window lifecycle tracking.

**STOP.**

---

## STEP 6 - Application Launcher

Implement:

- launch by appId;
- wait for process;
- associate process;
- associate window;
- emit lifecycle events.

**STOP.**

---

## STEP 7 - Workspace Backend

Implement:

- create;
- rename;
- close;
- switch;
- per-workspace app associations;
- persistence.

Full max 10 OS Tabs and 10 apps per OS Tab enforced in backend.

**STOP.**

---

## STEP 8 - Window Management

Implement safe operations:

- focus;
- minimize;
- restore;
- bounds;
- visibility.

**STOP.**

---

## STEP 9 - Window Hosting Prototype

**Hanya satu aplikasi uji dahulu.**

Tujuan:

- menentukan apakah native window dapat di-host dengan aman;
- menentukan fallback external managed mode;
- handle resize/focus/close.

Jangan mengklaim universal embedding.

**STOP.**

---

## STEP 10 - Resource Monitor

Implement:

- system CPU;
- system RAM;
- process CPU;
- process RAM;
- optional GPU;
- disk/network metrics.

Buat sampling scheduler.

**STOP.**

---

## STEP 11 - Resource Pressure Engine

Implement:

```text
NORMAL
MODERATE
HIGH
CRITICAL
```

Belum mengubah process behavior.

**STOP.**

---

## STEP 12 - Activity Detection

Implement:

- foreground/background;
- CPU activity;
- network/disk signals;
- protected conditions;
- game category signal;
- unknown condition handling.

**STOP.**

---

## STEP 13 - Lifecycle Engine

Implement:

```text
ACTIVE
BACKGROUND
PROTECTED
GAME
OPTIMIZING
ERROR
```

Masih observe-only untuk optimizer.

**STOP.**

---

## STEP 14 - Gentle Resource Optimization

Implement hanya level gentle.

Flow:

```text
Background
 ↓
Safe check
 ↓
Small intervention
 ↓
Measure
 ↓
Stability check
 ↓
Stop or repeat
```

Semua tindakan direkam di diagnostics.

**STOP.**

---

## STEP 15 - Aggressive Policy Under Pressure

Hanya jika:

```text
HIGH/CRITICAL memory pressure
+
not protected
+
not game
+
not active
```

Implement safety governor.

**STOP.**

---

## STEP 16 - Game Classification + Protection

Implement classifier berlapis.

Acceptance:

- known game → protected;
- unknown app → conservative;
- non-game → normal.

**STOP.**

---

## STEP 17 - Filesystem Bridge

Implement:

- list;
- metadata;
- folder creation;
- rename;
- move/copy;
- delete;
- Windows file picker integration.

User data tetap Windows filesystem.

**STOP.**

---

## STEP 18 - Global Hotkeys

Implement:

- Shift+Esc;
- Ctrl+Space;
- Sidebar shortcut;
- OS Tab shortcuts;
- App Tab shortcuts.

Conflict handling wajib.

**STOP.**

---

## STEP 19 - Diagnostics + Recovery

Implement:

- structured logs;
- native error logs;
- diagnostics export;
- core health;
- UI restart strategy jika feasible;
- managed app crash detection.

**STOP.**

---

## STEP 20 - IPC Hardening

Audit:

- command permissions;
- DTOs;
- validation;
- throttling;
- event volume;
- error contracts.

**STOP.**

---

## STEP 21 - Full Capability Enforcement

Implement dan audit capability khusus AzaleaOS Full:

```text
OS Tabs max             = 10
Apps/OS Tab max         = 10
Resource policy         = Full/adaptive
Advanced automation     = enabled
```

Acceptance:

- command beyond edition limit returns typed error;
- capability endpoint hanya melaporkan Full;
- config editing tidak membuka capability tambahan;
- executable tidak memiliki runtime flag untuk mengubah edition.

**STOP.**


## STEP 22 - Real App Compatibility Pass

Test:

- browser;
- IDE;
- utility;
- multi-process app;
- multi-window app;
- app with downloads;
- media app;
- game;
- unknown app.

Perbaiki adapter, bukan merusak core.

**STOP.**

---

## STEP 23 - Performance Pass

Profile:

- CPU overhead Azalea;
- RAM overhead Azalea;
- process scanner cost;
- window tracker cost;
- resource sampler cost;
- event throughput;
- idle consumption.

Target penting:

> Azalea tidak boleh menjadi aplikasi yang menghabiskan resource besar hanya untuk menghemat resource aplikasi lain.

**STOP.**

---

## STEP 24 - Reliability Pass

Uji:

- app crash;
- Azalea crash;
- Explorer restart;
- display changes;
- sleep/wake;
- monitor disconnect/reconnect;
- Windows restart;
- user logout/login;
- permission denied;
- executable removed.

**STOP.**

---

## STEP 25 - Packaging Readiness

Implement:

- release config;
- Windows installer;
- upgrade;
- uninstall;
- config preservation policy;
- logs/diagnostics;
- signing preparation.

**STOP.**

---

# 49. DEFINITION OF DONE BACKEND

Backend dianggap siap MVP jika:

- berjalan 100% lokal;
- tidak membutuhkan server;
- dapat menemukan aplikasi Windows;
- dapat meluncurkan aplikasi;
- dapat memantau process/window;
- dapat membaca CPU/RAM;
- dapat mengaitkan app ↔ process ↔ window;
- dapat menjalankan workspace model;
- Full limit ditegakkan native;
- protected tasks tidak dioptimisasi agresif;
- game default protected;
- unknown app default conservative;
- resource optimizer bertahap;
- optimizer dapat dimatikan;
- logging tersedia;
- error terstruktur;
- filesystem tetap milik Windows;
- tidak mengklaim universal app embedding;
- performa overhead Azalea masuk akal.

---

# 50. ARSITEKTUR AKHIR

```text
                       AZALEAOS APP
                              │
               ┌──────────────┴──────────────┐
               │                             │
          FRONTEND                       NATIVE CORE
       React + TypeScript                   Rust
               │                             │
               └──────────────┬──────────────┘
                              Tauri
                                │
                     ┌──────────┼───────────┐
                     │          │           │
                  Windows    Filesystem   Processes
                     │          │           │
                  Windows APIs / Runtime   │
                     │                      │
                     └──────────┬───────────┘
                                │
                             Hardware
```

---

# 51. PRINSIP INTI AZALEA RESOURCE MANAGER

```text
1. Detect first.
2. Understand activity.
3. Protect important work.
4. Never optimize blindly.
5. Reduce gently.
6. Measure again.
7. Stop when stable.
8. Restore priority immediately when focused.
9. Games are protected by default.
10. Unknown behavior gets conservative treatment.
```

---

# 52. PRINSIP STABILITAS

**UX lebih penting daripada angka RAM.**

Jika sebuah intervensi menurunkan memory tetapi:

- membuat CPU naik tajam;
- meningkatkan disk I/O;
- menyebabkan app lag;
- menyebabkan crash;
- membuat download gagal;
- membuat window rusak;

maka intervensi dianggap gagal dan harus dihentikan.

---

# 53. PRINSIP SOLO-DEVELOPER

AI agent boleh membantu:

- menulis Rust;
- menulis Win32 integration;
- membuat tests;
- membuat DTO;
- memperbaiki compile error;
- membaca log;
- melakukan refactor.

Tetapi setiap perubahan native yang berisiko harus memiliki:

```text
reproduction
log
test
rollback path
```

Jangan menerima perubahan besar tanpa build + test.

---

# 54. GOLDEN RULE BACKEND

> **AzaleaOS harus bekerja bersama Windows, bukan melawan Windows.**

Jangan memaksa aplikasi Windows berperilaku seperti aplikasi yang dibuat khusus untuk Azalea.

Jika Windows atau aplikasi tidak memberikan cara aman untuk mengelola sesuatu:

```text
Fallback
Protect
Observe
```

bukan:

```text
Force
Kill
Pretend success
```

---

# 55. FINAL EXECUTION RULE

Ketika AI agent menerima dokumen ini:

```text
1. Baca seluruh dokumen.
2. Tentukan STEP aktif dari instruksi user.
3. Kerjakan hanya STEP tersebut.
4. Build.
5. Test.
6. Perbaiki sampai acceptance criteria STEP terpenuhi.
7. Laporkan file yang berubah dan hasil test.
8. STOP.
9. Jangan memulai STEP berikutnya.
```

**Tidak ada auto-continue.**

---

# 56. OUT OF SCOPE UNTUK MVP

Jangan implementasikan tanpa instruksi baru:

- Linux kernel;
- Android/AOSP;
- cloud sync;
- account system;
- multiplayer;
- remote control;
- custom filesystem;
- custom package manager;
- game launcher ecosystem;
- AI assistant bawaan;
- browser engine sendiri;
- kernel driver sendiri.

AzaleaOS App tetap:

```text
A LOCAL WINDOWS DESKTOP EXPERIENCE
```

bukan proyek OS kernel baru.

## APP SEPARATION CHECKLIST

Sebelum release AzaleaOS Full, pastikan:

```text
azaleaos-full.exe
com.azalea.azaleaos.full
separate install path
separate config path
separate logs/cache path
no runtime edition switch
backend capability authority enabled
```

Shared crates/modules dengan AzaleaOS Lite boleh digunakan bila membantu maintenance, tetapi binary output, app identity, capability surface, installer identity, dan local data paths tetap terpisah.


---

# AMENDMENT 1.1 - PLATFORM SUPPORT + UPDATE SYSTEM

> **Purpose:** synchronize the backend blueprint with the current frontend blueprint and the product decision to support Windows 10/11 while keeping AzaleaOS Core local-first. This amendment does **not** renumber or rewrite STEP 1–25.

## A. Supported Windows Platform

Initial compatibility target:

```text
OS family:
- Windows 10 22H2
- Windows 11

Architecture:
- x64
```

### Platform policy

- **Windows 11 = primary development and compatibility target.**
- **Windows 10 22H2 = legacy compatibility target.**
- Windows API availability must be checked at runtime when an API/capability may differ between supported environments.
- Missing optional capabilities must degrade gracefully to `Unavailable` instead of crashing the core.
- Compatibility detection must be exposed through diagnostics so unsupported/limited functionality can be explained to the user.
- The backend must not assume every Windows build exposes identical metrics or window-integration behavior.

> Current ecosystem note: Microsoft ended standard Windows 10 support on 14 October 2025. AzaleaOS may still retain Windows 10 22H2 as a compatibility target, but Windows 11 remains the primary supported/tested platform for the product. This is a **product compatibility decision**, not a statement that Windows 10 remains supported by Microsoft.

## B. Update System - Product Architecture

AzaleaOS Core remains local-first. Updating the Azalea application is the explicit exception that may require an internet connection.

```text
AzaleaOS Core
    ↓
100% local

AzaleaOS Update System
    ↓
HTTPS
    ↓
Release / Update Metadata
    ↓
Signed Update Artifact
```

The update system is **not** a backend server for Azalea core features.

It must not introduce:

- user accounts;
- cloud database dependency;
- REST/GraphQL API requirement for core operation;
- remote process control;
- cloud sync.

## C. Update Distribution Strategy

### MVP recommendation

Use a static release/update distribution mechanism compatible with Tauri's updater architecture, preferably a release platform such as GitHub Releases.

Conceptually:

```text
GitHub Release
├── latest update metadata
├── azaleaos-full Windows artifact
└── signature
```

A dedicated dynamic update server/CDN may be introduced later when staged rollout, multiple channels, release targeting, or richer update management becomes necessary.

## D. Update Security

Every production update artifact must be cryptographically verified before installation.

Required principles:

```text
HTTPS transport
+
signed update artifact
+
public-key verification
+
reject invalid signature
```

The updater must never treat a downloadable `.exe` or package as trusted solely because the URL is reachable.

Failure states:

```text
CHECK_FAILED
DOWNLOAD_FAILED
SIGNATURE_INVALID
INSTALL_FAILED
RESTART_FAILED
UPDATE_CANCELLED
```

No invalid or unverifiable artifact may be installed.

## E. Update Channels

Initial channels:

```text
Stable
Beta
```

The channel selection belongs to Azalea Settings and is persisted locally. The backend is authoritative for which update metadata endpoint/channel is actually used.

Future channels such as `Nightly` or `Canary` require an explicit product decision and must not appear automatically.

## F. Update Lifecycle

```text
Startup / manual check
        ↓
Check current version
        ↓
Fetch lightweight update metadata
        ↓
Compare versions
        ↓
No update ─────────────→ END
        ↓
Update available
        ↓
Verify metadata + signature information
        ↓
Download artifact
        ↓
Verify artifact signature
        ↓
Stage update
        ↓
Install / relaunch
        ↓
Verify new version
```

The normal check should be lightweight and must not download the full installer when no update is available.

## G. User-Controlled Update Behavior

Default policy:

```text
Automatic update check: ON
Automatic download: OFF
Automatic install: OFF
```

The user should receive a clear update notification such as:

```text
AzaleaOS Full 0.2.0 is available.

[ View Release Notes ]
[ Update Now ]
[ Later ]
```

The exact visual presentation remains a frontend responsibility.

## H. Offline Behavior

When offline:

```text
Update check unavailable
```

must never prevent the core application from starting.

Expected behavior:

```text
Internet unavailable
        ↓
Core starts normally
        ↓
Update status = unavailable
```

## I. Update Failure / Recovery

The update system must preserve the currently installed version until the new version has passed the updater's verification/install path.

If update installation fails:

```text
Existing version remains usable
        ↓
Log failure
        ↓
Notify user if appropriate
        ↓
Offer retry later
```

Never delete the currently working installation merely because an update attempt failed.

## J. Backend Modules / IPC Addition

Update the backend architecture with:

```text
src-tauri/
├── updates/
│   ├── client.rs
│   ├── manifest.rs
│   ├── channel.rs
│   ├── verifier.rs
│   ├── installer.rs
│   └── state.rs
```

Update IPC surface:

```text
update.get_current
update.check
update.get_state
update.download
update.install
update.cancel
```

Update events:

```text
update.check_started
update.check_completed
update.available
update.download_started
update.download_progress
update.download_completed
update.verification_failed
update.install_started
update.install_completed
update.failed
```

The final Tauri updater API/permissions configuration must be validated against the exact Tauri 2.x version used by the repository; do not invent unsupported commands or permissions.

## K. Diagnostics

Diagnostics should report locally:

```text
Current version
Update channel
Last update check
Last update result
Pending update version
Update error code if any
```

Diagnostics must not upload logs automatically.

## L. NEW STEP 26 - Update System

This is a **new backend STEP**. Existing STEP 1–25 remain unchanged.

### Goal

Implement the production updater path and connect it to the existing Settings → Updates contract.

### Scope

- updater dependency/configuration;
- update metadata model;
- current version detection;
- stable/beta channels;
- HTTPS update check;
- signature verification;
- update download;
- staged installation;
- relaunch;
- failure handling;
- update events;
- diagnostics;
- offline behavior;
- update-related tests.

### Acceptance Criteria

```text
1. Current version is reported correctly.
2. Update check works over HTTPS.
3. No update does not download the full artifact.
4. Invalid signatures are rejected.
5. Offline core startup still works.
6. Failed update does not destroy the current working version.
7. Stable/Beta channel selection is respected.
8. Update state is exposed through typed IPC/DTOs.
9. Update events are throttled and do not flood the frontend.
10. Production configuration contains no debug update backdoor.
```

**STOP.**

Do not automatically start any later backend step after STEP 26.

## M. Cross-Document Synchronization Rule

The frontend blueprint already defines an `Updates` Settings category and automatic/manual update controls. The backend updater is the source of truth for update state and capability; frontend only renders and requests those operations through Tauri IPC.

```text
Frontend Settings → Updates
        ↓
Tauri IPC
        ↓
Rust Update System
        ↓
HTTPS Update Source
```

Do not implement update logic independently in React.

## N. Relation to Existing Backend Steps

Do **not** rename or renumber STEP 1–25.

Where existing steps mention packaging, settings, diagnostics, IPC, or release work, this amendment adds the update-specific implementation required to make those existing concepts production-complete.

```text
Existing STEP 19 → diagnostics/recovery support
Existing STEP 20 → IPC hardening
Existing STEP 25 → packaging/upgrade support
NEW STEP 26      → actual updater implementation
```
