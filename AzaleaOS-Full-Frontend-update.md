# AzaleaOS Full App - Frontend Blueprint

> Dokumen ini adalah spesifikasi implementasi frontend khusus untuk **AzaleaOS Full**, yaitu **aplikasi Windows terpisah** dari AzaleaOS Lite.
>
> **AzaleaOS Full adalah desktop application local-first**, bukan website dan bukan OS pengganti Windows. Ia memberikan pengalaman seperti OS dengan mengelola workspace, aplikasi Windows, window, dan resource dari dalam aplikasi sendiri.
>
> **Wajib:** AzaleaOS Full harus dibangun, dipaketkan, di-install, dan dijalankan sebagai **app/binary terpisah**. Jangan membuat satu executable yang hanya mengganti flag `lite/full` saat runtime. Shared source code boleh digunakan pada level repository, tetapi hasil build dan capability surface harus tetap terpisah.
>
> **Tujuan utama:** frontend harus terasa seperti desktop operating system, bukan website, dashboard SaaS, launcher sederhana, atau clone Windows 11.

---

## 0. ATURAN EKSEKUSI UNTUK AI AGENT

### 0.1 Mode kerja wajib: STEP-BY-STEP

AI agent **WAJIB mengerjakan hanya satu STEP dalam satu waktu**.

Setiap STEP memiliki:

1. Tujuan.
2. Scope yang boleh disentuh.
3. File yang boleh dibuat/diubah.
4. Implementasi.
5. Test.
6. Acceptance criteria.
7. Ringkasan hasil.

Setelah acceptance criteria STEP terpenuhi:

```text
STOP.
Jangan lanjut ke STEP berikutnya.
Tunggu instruksi user.
```

AI **dilarang** mengerjakan STEP berikutnya secara otomatis, walaupun merasa sudah siap.

### 0.2 Aturan anti-scope-creep

AI tidak boleh:

- menambahkan fitur yang belum berada pada STEP aktif;
- mengubah backend saat mengerjakan STEP frontend kecuali contract IPC memang diperlukan dan sudah tertulis pada STEP aktif;
- mengganti framework tanpa instruksi user;
- menambahkan database hanya karena dianggap lebih profesional;
- membuat cloud/API/server online;
- membuat fitur login/account pada MVP;
- memasukkan placeholder UI yang tidak memiliki alasan produk;
- menghapus fitur lama hanya untuk mempermudah implementasi;
- menganggap mockup sebagai fitur selesai.

### 0.2A BATAS EDITION FULL

AI agent **hanya** mengimplementasikan capability Full.

- Jangan membuat UI, route, shortcut, capability flag, atau command yang hanya ada pada AzaleaOS Lite kecuali sebagai shared internal abstraction yang tidak mengekspos fitur edition lain.
- Limit edition adalah bagian dari product contract, bukan preference user.
- Jangan memberi kontrol UI untuk menaikkan limit di luar capability edition.
- Jangan menggunakan `localStorage`, JSON, atau state frontend sebagai sumber kebenaran untuk capability. Native backend/build identity adalah authority.

### 0.3 Prinsip produk

AzaleaOS App adalah:

```text
Windows App
    ↓
AzaleaOS Experience Layer
    ↓
Windows Applications + Windows Filesystem + Windows Resources
```

AzaleaOS **bukan OS baru** dan tidak mengganti Windows.

### 0.4 Platform awal

Target awal:

- Windows x64.
- Local-first.
- Tidak membutuhkan internet untuk fungsi inti.
- Tidak membutuhkan account.
- Tidak membutuhkan cloud.
- User files tetap berada di filesystem Windows.
- Edition aktif untuk dokumen ini: **AzaleaOS Full**.
- Binary target: `azaleaos-full.exe`.
- Application identity: `com.azalea.azaleaos.full`.
- Install directory wajib terpisah dari edition lain.
- Local configuration directory wajib terpisah dari edition lain.
- Tidak boleh ada runtime switch yang mengubah Lite menjadi Full atau sebaliknya.

---

# 1. TUJUAN FRONTEND

Frontend bertanggung jawab terhadap semua hal yang **dilihat dan dirasakan pengguna**:

- Desktop AzaleaOS.
- Sidebar.
- OS Tabs.
- App Tabs.
- Workspace.
- App Launcher.
- Resource Bar.
- Resource Center.
- Files UI.
- Settings AzaleaOS.
- Notifications AzaleaOS.
- Search.
- Menampilkan lifecycle aplikasi.
- Menampilkan state optimizer.
- Animasi/transisi.
- Empty state.
- Loading state.
- Error state.
- Recovery UI.

Frontend **tidak boleh** menjadi sumber kebenaran untuk:

- process PID;
- CPU/RAM real;
- window handle;
- app executable path;
- process suspend/resume;
- filesystem privileged operations;
- license entitlement;
- resource optimization decision.

Semua hal tersebut berasal dari Rust/native backend melalui Tauri IPC.

---

# 2. STACK FRONTEND YANG DIKUNCI

## 2.1 Framework

### React + Vite + TypeScript

Gunakan:

```text
React
Vite
TypeScript
```

Alasan:

- UI desktop lebih sederhana tanpa kebutuhan SSR/server-side rendering.
- Fast dev server.
- Cocok dengan Tauri.
- Component-based.
- Mudah di-maintain oleh solo developer.
- AI agent lebih mudah bekerja dengan boundary frontend yang jelas.

## 2.2 Desktop runtime

```text
Tauri 2.x
```

Tauri menjadi shell desktop dan jembatan ke Rust.

Tauri frontend dapat berupa aplikasi web statis yang disajikan dalam webview, sedangkan komunikasi dua arah dengan Rust dilakukan melalui command/event/channel sesuai kebutuhan. citeturn306474search9turn306474search6

## 2.3 Bahasa

```text
TypeScript
```

`any` dilarang kecuali ada alasan teknis yang terdokumentasi.

## 2.4 Styling

Prioritas:

1. CSS Modules / plain CSS terstruktur untuk komponen kritis.
2. Tailwind CSS hanya jika membantu konsistensi dan kecepatan implementasi.

Jangan membangun desain yang hanya bergantung pada utility class tanpa design tokens.

## 2.5 State management

Untuk MVP:

- React state untuk state lokal komponen.
- Context jika scope state sederhana.
- Zustand untuk global app state jika jumlah state mulai besar.

Pilihan default yang direkomendasikan:

```text
Zustand
```

Jangan memasukkan Redux hanya karena proyek terlihat besar.

## 2.6 Icons

Gunakan satu icon family yang konsisten.

Jangan mencampur lima gaya icon.

---


# 2A. SEPARATE APP IDENTITY - AZALEAOS FULL

AzaleaOS Full **bukan mode di dalam aplikasi lain**. Ia adalah aplikasi Windows sendiri.

```text
Product Name       = AzaleaOS Full
Executable         = azaleaos-full.exe
App ID             = com.azalea.azaleaos.full
Config root        = %LOCALAPPDATA%\AzaleaOS\Full
Cache root         = %LOCALAPPDATA%\AzaleaOS\Full\Cache
Logs root          = %LOCALAPPDATA%\AzaleaOS\Full\Logs

OS Tab limit       = 10
Apps / OS Tab      = 10
```

### Aturan build

- Build Full memiliki capability contract sendiri.
- Jangan membuat `edition = "lite" | "full"` sebagai toggle runtime pada executable yang sama.
- Shared UI components/types dengan edition lain diperbolehkan di repository, tetapi output app, bundle identity, local paths, dan capability surface tetap berbeda.
- Lite dan Full boleh di-install berdampingan tanpa saling menimpa config/cache/log.
- Frontend membaca capability dari native backend, tetapi tidak dapat menaikkan capability.

# 3. VISUAL IDENTITY AZALEAOS

## 3.1 Filosofi

```text
Minimal
Calm
Fast
Spatial
App-centric
Keyboard-friendly
Professional
```

AzaleaOS harus terasa seperti sebuah desktop environment.

Bukan:

```text
SaaS Dashboard
Admin Panel
Website
Mobile App yang dibesarkan
Windows clone
```

## 3.2 Visual language

Gunakan:

- panel surface yang bertingkat;
- border tipis;
- radius konsisten;
- shadow lembut;
- whitespace cukup;
- typography yang jelas;
- animasi singkat dan fungsional;
- iconography minimal.

Hindari:

- neon berlebihan;
- gradient di semua tempat;
- glass effect di setiap panel;
- animasi panjang;
- rounded-card berlebihan;
- tombol terlalu besar;
- 3D decoration;
- data yang tidak relevan.

## 3.3 Design tokens

Buat satu sumber token:

```text
src/styles/tokens/
├── colors.css
├── spacing.css
├── typography.css
├── radius.css
├── shadows.css
├── motion.css
└── index.css
```

Semua komponen memakai token, bukan angka acak.

---

# 4. HIERARKI LAYOUT UTAMA

AzaleaOS menggunakan empat area utama:

```text
┌───────────────┬──────────────────────────────────────────┐
│               │ Resource / App area                      │
│   SIDEBAR     ├──────────────────────────────────────────┤
│               │ APP TAB BAR                               │
│   OS TABS     ├──────────────────────────────────────────┤
│               │                                          │
│   TOOLS       │              WORKSPACE                   │
│               │                                          │
└───────────────┴──────────────────────────────────────────┘
```

### Area persistent

- Sidebar.
- App Tab Bar.
- Workspace.

### Area transient

- Resource Bar.
- Resource Center.
- Command/launcher overlay.
- Context menus.
- Notifications.
- Dialogs.

---

# 5. SIDEBAR

## 5.1 Fungsi

Sidebar adalah navigasi utama AzaleaOS.

Isi:

```text
🌸 AzaleaOS
─────────────
01  Development
02  Research
03  Design
+   New OS Tab
─────────────
📊 Resources
📁 Files
⚙  Settings
```

## 5.2 Tiga mode

### Expanded

```text
┌──────────────────┐
│ 🌸 AzaleaOS      │
│                  │
│ 01 Development   │
│ 02 Research      │
│ 03 Design        │
│ + New OS Tab     │
│                  │
│ 📊 Resources     │
│ 📁 Files         │
│ ⚙ Settings       │
└──────────────────┘
```

### Compact

```text
┌──────┐
│ 🌸   │
│ 01   │
│ 02   │
│ 03   │
│ +    │
│      │
│ 📊   │
│ 📁   │
│ ⚙    │
└──────┘
```

### Hidden

Sidebar tidak mengambil ruang layout.

Workspace melebar menggunakan ruang yang sebelumnya ditempati sidebar.

## 5.3 Sidebar behavior

Shortcut utama:

```text
Ctrl + Alt + A
```

Behavior:

```text
Expanded/Compact → Hidden
Hidden → kembali ke mode sebelumnya
```

Tidak boleh membuat ruang kosong ketika hidden.

Workspace harus melakukan reflow.

## 5.4 Accessibility

- Tooltip pada icon.
- Keyboard focus visible.
- ARIA label.
- Shortcut tidak bentrok dengan shortcut penting aplikasi Windows secara umum.

---

# 6. OS TAB SYSTEM

## 6.1 Definisi

OS Tab adalah **workspace environment** di dalam AzaleaOS.

Contoh:

```text
OS 01 - Development
├── VS Code
├── Chrome
├── Terminal
└── Files
```

```text
OS 02 - Research
├── Chrome
├── PDF Reader
└── Notes
```

## 6.2 Limit

AzaleaOS Full adalah aplikasi terpisah dengan limit produk yang dikunci pada build.

```text
Maximum OS Tabs: 10
Maximum managed apps per OS Tab: 10
```

Limit tidak dapat dinaikkan dari Settings, DevTools, JSON config, atau state frontend. Backend/native capability contract wajib menolak request yang melampaui batas.


## 6.3 Create OS Tab

Flow:

```text
+ New OS Tab
    ↓
Name workspace
    ↓
Create
    ↓
Activate
```

Nama default:

```text
New Workspace
```

User dapat rename.

## 6.4 Close OS Tab

Sebelum menutup OS Tab yang memiliki aplikasi aktif:

```text
Close workspace?

Apps managed by this workspace may remain open in Windows unless the user chooses to close them.

[ Cancel ] [ Close Workspace ]
```

Jangan menutup aplikasi Windows secara diam-diam.

---

# 7. APP TAB SYSTEM

App Tabs berada di atas workspace.

Contoh:

```text
┌─────────────────────────────────────────────────────┐
│ Chrome │ VS Code │ Terminal │ Files │ +             │
└─────────────────────────────────────────────────────┘
```

## 7.1 State App Tab

Setiap App Tab minimal memiliki:

```text
id
appId
osTabId
windowId
processId
label
icon
state
activity
lastFocusedAt
resourceStatus
```

`processId/windowId` berasal dari backend.

## 7.2 Visual state

```text
ACTIVE
BACKGROUND
OPTIMIZING
PROTECTED
GAME
UNAVAILABLE
ERROR
```

Gunakan visual cue kecil, jangan membuat seluruh tab berubah warna menyala.

---

# 8. DESKTOP WORKSPACE

Desktop adalah area utama yang menampilkan aplikasi aktif.

Empty state:

```text
Development

Nothing is open yet.

[ Open App Launcher ]
```

Jangan menampilkan desktop icon grid ala Windows kecuali fitur tersebut memang nantinya diperlukan.

---

# 9. APP LAUNCHER

Shortcut:

```text
Ctrl + Space
```

Overlay:

```text
┌──────────────────────────────────────────┐
│ 🔍 Search apps, files, commands...       │
├──────────────────────────────────────────┤
│ VS Code                                  │
│ Chrome                                   │
│ Terminal                                 │
│ Files                                    │
└──────────────────────────────────────────┘
```

## 9.1 Search behavior

Prioritas pencarian:

1. Installed Windows applications yang terdeteksi.
2. Azalea internal tools.
3. Files.
4. Optional commands pada tahap lanjut.

Search harus:

- keyboard-first;
- cepat;
- tidak bergantung internet;
- fuzzy matching sederhana pada MVP.

---

# 10. RESOURCE BAR

Shortcut:

```text
Shift + Esc
```

Saat ditekan:

```text
┌─────────────────────────────────────────────────────────────┐
│ 🌸 AzaleaOS │ CPU 23% │ RAM 8.2/16 GB │ GPU 31% │ Disk 4% │
└─────────────────────────────────────────────────────────────┘
```

## 10.1 Behavior

- Overlay dari bagian atas.
- Tidak mengubah OS Windows.
- Tidak membuka Task Manager Windows.
- Bisa di-dismiss dengan `Esc`.
- Bisa ditoggle ulang dengan `Shift + Esc`.
- Click resource metric membuka Resource Center.

## 10.2 Update frequency

Frontend tidak boleh polling native API setiap render.

Gunakan event stream / throttled updates.

UI boleh menampilkan data secara visual setiap sekitar 500–1000 ms, sedangkan backend boleh memakai strategi sampling berbeda sesuai jenis metric.

---

# 11. RESOURCE CENTER

Nama resmi:

**Azalea Resource Center**

Bukan clone Task Manager.

## 11.1 Bagian

### System Summary

- CPU usage.
- RAM used/available/total.
- GPU usage jika tersedia.
- Disk activity.
- Network activity.
- Uptime.

### Azalea Applications

```text
App        State         RAM       CPU       Status
VS Code    ACTIVE        1.4 GB    8.2%      Normal
Chrome     BACKGROUND    820 MB    2.1%      Protected
Discord    BACKGROUND    380 MB    0.4%      Normal
```

### Adaptive Resource

```text
Mode: Smart
System Pressure: Normal
Background Apps: 3
Optimizing: 1
Protected Tasks: 1
```

### Protected Tasks

Contoh:

```text
Chrome
Downloading 5.2 GB

File operation
Copying 18 GB

Video encoder
Encoding in progress
```

### Recent Resource History

MVP boleh hanya menampilkan short window seperti 5 menit.

---

# 12. RESOURCE UI PRINSIP

Jangan pernah menampilkan klaim:

```text
"Azalea mengurangi Chrome ke 300 MB."
```

Gunakan bahasa:

```text
Adaptive optimization
Memory pressure
Background resource reduction
Protected task
```

Frontend hanya menampilkan hasil yang benar-benar dikirim backend.

---

# 13. FILES UI

Nama:

**Azalea Files**

Azalea Files bukan filesystem baru.

Frontend hanya menyediakan UI untuk filesystem Windows.

Structure:

```text
Files
├── Home
├── Desktop
├── Documents
├── Downloads
├── Pictures
├── Videos
├── Drives
└── Recent
```

User dapat:

- browse;
- open;
- create folder;
- rename;
- move;
- copy;
- delete;
- choose save location.

Semua operasi file nyata berasal dari native backend/Windows.

---

# 14. WINDOWS APP LIBRARY UI

Azalea membaca aplikasi Windows yang terpasang.

Frontend menerima descriptor dari backend:

```ts
interface AppDescriptor {
  id: string;
  name: string;
  executablePath?: string;
  icon?: string;
  source: "windows" | "azalea";
  category: "browser" | "developer" | "productivity" | "utility" | "game" | "system" | "unknown";
  supported: boolean;
}
```

Frontend tidak menentukan game hanya berdasarkan nama string.

Jika backend mengirim:

```text
supported = false
reason = "game"
```

UI menampilkan:

```text
This app is not managed by AzaleaOS.
Reason: Game applications are excluded from normal Azalea management.
```

---

# 15. SETTINGS AZALEAOS

Settings hanya mengatur **Azalea**, bukan menggantikan Windows Settings.

## Categories

```text
General
Appearance
Workspace
Applications
Resource Management
Sidebar & Navigation
Keyboard Shortcuts
Notifications
Files & Integration
Performance
Privacy
Data & Storage
Updates
Advanced
```

## 15.1 General

- Launch with Windows.
- Start minimized.
- Restore last workspace.
- Restore app layout.
- Confirm close.

## 15.2 Appearance

- Dark.
- Light.
- System.
- Accent color.
- Sidebar mode.
- Animation level.
- Transparency.

## 15.3 Workspace

Edition Full:

```text
Max OS Tabs = 10
Max Apps/OS = 10
```

UI hanya menampilkan limit produk sebagai informasi. Limit sebenarnya ditegakkan native backend/build capability.

## 15.4 Applications

- Auto-discover Windows apps.
- Refresh app library.
- Per-app policy.
- Excluded apps.
- Supported apps.
- Protected apps.

## 15.5 Resource Management

```text
Adaptive Resource Management: ON/OFF
Mode: Smart / Conservative / Aggressive
```

Per-app:

```text
Smart
Never optimize
Prefer background
Game protection
```

## 15.6 Sidebar & Navigation

- Sidebar mode.
- Sidebar position.
- Shortcut.
- Auto-hide optional.
- Show app count.
- Show resource state.

## 15.7 Keyboard Shortcuts

Default:

```text
Shift + Esc               Resource Bar
Ctrl + Space              App Launcher
Ctrl + Alt + A            Toggle Sidebar
Ctrl + Alt + Left         Previous OS Tab
Ctrl + Alt + Right        Next OS Tab
Ctrl + Alt + N            New OS Tab
Ctrl + Alt + W            Close OS Tab
Ctrl + Tab                Next App
Ctrl + Shift + Tab        Previous App
```

## 15.8 Notifications

Hanya notifikasi Azalea.

- optimization notice;
- critical memory pressure;
- app detection;
- unsupported game detection;
- update;
- recovery.

## 15.9 Files & Integration

- Default save location.
- Windows File Picker.
- Default open behavior.
- Recent files.
- Recent locations.

## 15.10 Performance

Pengaturan untuk **Azalea sendiri**:

- animations;
- UI update frequency;
- hardware acceleration;
- background activity;
- startup optimization.

## 15.11 Privacy

Default MVP:

```text
Telemetry: OFF
Cloud Sync: OFF
Network requirement: NONE for core features
Crash report: Ask user / local only
```

## 15.12 Data & Storage

Tampilkan:

- Azalea config size.
- Cache.
- Logs.
- Workspace metadata.

Button:

```text
Open Azalea Data Folder
Clear Cache
Export Diagnostics
```

## 15.13 Updates

- Current version.
- Stable/Beta channel.
- Check for update.
- Automatic check.

---

# 16. AZALEAOS FULL - EDITION CONTRACT

AzaleaOS Full adalah edition lengkap dan merupakan aplikasi Windows terpisah dari AzaleaOS Lite.

## Capability utama

```text
OS Tabs: 10
Apps per OS Tab: 10
Resource Management: Full / adaptive policy
Advanced resource tuning: ON
Advanced workspace automation: ON
Advanced customization: FULL
```

### UX rule

- Full harus mengekspos seluruh capability yang memang sudah stabil.
- Full tidak boleh bergantung pada adanya aplikasi Lite yang berjalan.
- Full memiliki own config directory, own executable identity, dan own updater path.
- Core lifecycle dan resource safety tetap mengikuti native backend; frontend hanya mempresentasikan state dan kontrol yang diizinkan.

### UI label

Gunakan label yang jelas:

```text
AzaleaOS Full
Adaptive Resource Management
10 Workspace limit
```


# 17. FRONTEND STATE MODEL

Gunakan state yang eksplisit.

## Global

```text
AppState
├── edition
├── capabilities
├── sidebar
├── activeOsTabId
├── resourceBar
├── launcher
├── resourceCenter
└── settings
```

## Workspace

```text
WorkspaceState
├── osTabs[]
├── activeOsTabId
└── appTabsByOsTab
```

## Application

```text
ManagedAppState
├── descriptor
├── runtime
├── lifecycle
├── resource
├── window
└── protection
```

---

# 18. FRONTEND LIFECYCLE STATE

Gunakan state machine visual:

```text
ACTIVE
  ↓
BACKGROUND
  ↓
OPTIMIZING
  ↓
BACKGROUND
```

Jika user kembali:

```text
BACKGROUND / OPTIMIZING
            ↓
         ACTIVE
```

Jika app protected:

```text
BACKGROUND
    ↓
PROTECTED
```

Jika backend memberi error:

```text
ANY STATE
    ↓
ERROR
```

Frontend **tidak boleh menyimpulkan sendiri** bahwa app sudah optimizing hanya karena timer lokal habis. Backend mengirim state sebenarnya.

---

# 19. FRONTEND IPC CONTRACT

Semua interaksi sistem melewati Tauri.

Kategori command:

```text
app.*
window.*
process.*
resource.*
workspace.*
filesystem.*
settings.*
launcher.*
```

Contoh:

```text
app.list
app.launch
app.classify
app.get_state

window.list
window.focus
window.minimize
window.restore
window.get_bounds

resource.get_snapshot
resource.subscribe

workspace.create
workspace.rename
workspace.close
workspace.switch

filesystem.list
filesystem.open
filesystem.create_folder
filesystem.delete
```

Jangan membuat command generik seperti:

```text
execute_anything
run_shell_command
```

Frontend harus memiliki API contract yang sempit dan dapat diaudit.

---

# 20. FRONTEND ERROR HANDLING

Setiap native call harus punya:

```text
Loading
Success
Empty
Error
Unavailable
```

Contoh:

```text
Resource Center

Unable to read GPU metrics.
CPU/RAM monitoring is still available.
```

Jangan membuat seluruh Resource Center blank hanya karena GPU gagal.

---

# 21. UX UNTUK APP YANG TIDAK BISA DI-MANAGE

Jika aplikasi Windows tidak dapat dikelola secara aman:

```text
App detected

This application can be launched from Azalea,
but cannot be fully managed by the current integration.

[ Launch externally ]
```

Ini penting untuk kompatibilitas.

Azalea harus lebih baik memiliki fallback daripada berpura-pura semua aplikasi kompatibel.

---

# 22. ANIMATIONS

Semua animasi harus memiliki tujuan.

Contoh:

- Sidebar expand/collapse: 150–220 ms.
- Resource bar appear: 120–180 ms.
- Launcher appear: 120–180 ms.
- Tab transition: 100–180 ms.
- Modal: 150–220 ms.

Hindari animasi panjang yang menghalangi kerja.

Respect:

```text
prefers-reduced-motion
```

---

# 23. RESPONSIVE DESKTOP

Walaupun Windows desktop bukan mobile-first, frontend harus menangani:

- 1280×720.
- 1366×768.
- 1920×1080.
- 2560×1440.
- ultrawide.
- multi-monitor.

Sidebar hidden harus menyebabkan workspace reflow.

Resource bar tidak boleh memotong App Tab Bar.

Text panjang pada nama workspace harus ellipsis.

---

# 24. COMPONENT TREE

Struktur komponen target:

```text
AppShell
├── GlobalHotkeyBridge
├── DesktopShell
│   ├── Sidebar
│   │   ├── Brand
│   │   ├── OSTabList
│   │   └── UtilityNav
│   ├── ResourceBar
│   ├── AppTabBar
│   └── WorkspaceViewport
│       ├── EmptyWorkspace
│       ├── ManagedAppSurface
│       └── AppFallbackSurface
│
├── Overlays
│   ├── AppLauncher
│   ├── ResourceCenter
│   ├── CommandPalette
│   ├── ContextMenu
│   ├── DialogHost
│   └── NotificationHost
│
└── Routes/Views
    ├── Files
    ├── Settings
    └── Diagnostics
```

---

# 25. FOLDER STRUCTURE FRONTEND

```text
src/
├── app/
│   ├── App.tsx
│   ├── AppShell.tsx
│   └── routes.tsx
│
├── components/
│   ├── desktop/
│   ├── sidebar/
│   ├── tabs/
│   ├── launcher/
│   ├── resources/
│   ├── files/
│   ├── settings/
│   ├── dialogs/
│   └── notifications/
│
├── features/
│   ├── workspace/
│   ├── applications/
│   ├── resources/
│   ├── filesystem/
│   └── settings/
│
├── stores/
├── hooks/
├── services/
│   ├── tauri.ts
│   ├── app-service.ts
│   ├── resource-service.ts
│   └── workspace-service.ts
│
├── types/
├── styles/
├── utils/
└── main.tsx
```

---

# 26. TESTING FRONTEND

Minimum:

## Unit

- reducers/state transitions;
- selectors;
- limit validation;
- formatting metrics;
- keyboard shortcut mapping.

## Component

- sidebar;
- OS tab;
- App Tab;
- resource bar;
- resource center;
- launcher;
- settings.

## E2E

- launch app;
- create OS Tab;
- switch OS Tab;
- launch app;
- switch App Tab;
- toggle sidebar;
- Shift+Esc Resource Bar;
- dismiss Resource Center;
- Full limits;
- Full capability boundary.

---

# 27. ACCESSIBILITY

Minimum:

- keyboard navigation;
- visible focus state;
- semantic buttons;
- labels untuk icon-only controls;
- contrast yang cukup;
- reduced motion;
- no keyboard trap;
- dialog focus management.

---

# 28. PERFORMANCE FRONTEND

Target desain:

- UI idle CPU rendah.
- Tidak ada render loop global setiap beberapa milidetik.
- Resource metric tidak memaksa seluruh desktop rerender.
- Daftar app memakai memoization/selector jika diperlukan.
- Event subscription harus unsubscribe saat unmount.
- Jangan menyimpan screenshot besar ke React state.
- Jangan menyimpan raw process log besar di memory frontend.

---

# 29. STEP PLAN FRONTEND

## STEP 1 - Project Foundation

Buat:

- React + Vite + TypeScript.
- Tauri shell.
- global CSS.
- design tokens.
- linting.
- formatting.
- basic app shell.
- Git-ready structure.

Acceptance:

```text
npm install
npm run dev
```

berhasil.

Tauri dev berhasil membuka AzaleaOS window.

**STOP setelah STEP 1.**

---

## STEP 2 - Visual Shell

Buat:

- DesktopShell.
- Sidebar.
- basic App Tab Bar.
- Workspace viewport.
- placeholder empty state.

Belum ada real Windows app integration.

Acceptance:

- visual terasa seperti desktop;
- sidebar bisa toggle secara lokal;
- workspace reflow;
- tidak ada feature leakage dari Windows Settings.

**STOP.**

---

## STEP 3 - OS Tab UX

Buat:

- create OS tab;
- rename;
- switch;
- close;
- Full limit UI.

Gunakan mock data dahulu jika backend contract belum tersedia.

Acceptance:

- AzaleaOS Full hanya menerima maksimal 10 OS Tabs;
- switching terasa instan;
- state masing-masing workspace tidak tercampur;
- UI tidak menampilkan control untuk edition lain.

**STOP.**

---

## STEP 4 - App Tab UX

Buat:

- app tab UI;
- active/background/protected/error state;
- per-OS app tab separation;
- enforce max 10 managed apps per OS Tab;
- jangan expose capability edition lain.

Masih boleh memakai mock descriptors.

**STOP.**

---

## STEP 5 - Global Launcher UX

Buat:

- `Ctrl + Space`;
- search field;
- keyboard navigation;
- app launch action contract;
- no internet dependency.

**STOP.**

---

## STEP 6 - Resource Bar + Resource Center

Buat UI:

- `Shift + Esc`;
- top resource bar;
- Resource Center;
- app resource list;
- adaptive resource status;
- protected task UI.

Gunakan mock metrics bila backend metric belum selesai.

**STOP.**

---

## STEP 7 - Settings

Implement semua kategori settings Azalea.

Prioritaskan:

1. General.
2. Appearance.
3. Workspace.
4. Applications.
5. Resource Management.
6. Sidebar.
7. Shortcuts.
8. Notifications.
9. Files.
10. Performance.
11. Privacy.
12. Storage.
13. Updates.
14. Advanced.

**STOP.**

---

## STEP 8 - Files UI

Buat:

- navigation;
- folders;
- file list;
- path bar;
- open/save integration contract;
- recent files.

Real filesystem harus melalui backend.

**STOP.**

---

## STEP 9 - Native App Integration Surface

Frontend menerima app descriptors dan runtime state dari backend.

Buat:

- managed app surface;
- embedded/host surface jika backend mendukung;
- external fallback surface;
- unsupported app state.

**STOP.**

---

## STEP 10 - Lifecycle Visualization

Integrasikan event backend:

```text
ACTIVE
BACKGROUND
OPTIMIZING
PROTECTED
GAME
ERROR
```

UI harus berubah berdasarkan backend event, bukan timer palsu.

**STOP.**

---

## STEP 11 - Performance Pass

Audit:

- rerender;
- event listeners;
- IPC frequency;
- memory leaks;
- animation;
- startup time.

**STOP.**

---

## STEP 12 - Accessibility + Polish

Implement:

- keyboard navigation;
- tooltips;
- reduced motion;
- focus management;
- empty/error states;
- consistent spacing;
- visual polish.

**STOP.**

---

## STEP 13 - Frontend Release Readiness

Validasi:

- Full build.
- Windows x64 installer integration.
- Separate install identity: `azaleaos-full.exe` must be independent.
- first launch.
- upgrade.
- reset settings.
- diagnostics.

**STOP.**

---

# 30. DEFINITION OF DONE FRONTEND

Frontend dianggap selesai secara produk hanya jika:

- terasa seperti desktop environment;
- tidak terasa seperti website;
- Sidebar, OS Tabs, App Tabs dan Workspace konsisten;
- Resource Bar dapat diakses `Shift + Esc`;
- Resource Center relevan terhadap Azalea;
- Settings hanya mengatur Azalea;
- limit Full tampil benar dan tidak dapat diakali melalui frontend state;
- frontend tidak mengendalikan native resource behavior sendiri;
- tidak ada cloud requirement;
- file user tetap pada Windows filesystem;
- error state jelas;
- keyboard navigation berfungsi;
- performance UI stabil.

---

# 31. ATURAN EMAS FRONTEND - AZALEAOS FULL

```text
1. Azalea terasa seperti OS.
2. Azalea bukan website.
3. Frontend bukan sumber kebenaran native state.
4. Jangan fake data ketika data real sudah tersedia.
5. Jangan membuat Windows Settings clone.
6. Jangan membunuh UX dengan animasi.
7. Jangan mengorbankan stabilitas demi visual.
8. Full harus tetap usable sesuai positioning-nya.
10. Satu STEP selesai → STOP → tunggu perintah user.
```

## APP SEPARATION CHECKLIST

Sebelum release AzaleaOS Full, AI agent wajib memastikan:

```text
Executable              = azaleaos-full.exe
App ID                  = com.azalea.azaleaos.full
Install path            = edition-specific
Config path             = edition-specific
Cache path              = edition-specific
Logs path               = edition-specific
Capability contract     = Full
Runtime edition switch  = FORBIDDEN
```

Shared code dengan AzaleaOS Lite diperbolehkan hanya jika tidak menggabungkan binary identity dan tidak memberikan jalan untuk mengaktifkan capability Lite secara runtime.


---

# AMENDMENT 1.1 - BACKEND SYNC + UPDATE SYSTEM

> **Status:** Frontend implementation is currently at **STEP 11 - Performance Pass**. This amendment is a new instruction layer and does **not** renumber or rewrite STEP 1–13.

## A. Supported Windows Platform Contract

AzaleaOS Full initial compatibility target:

```text
Windows 10 22H2
Windows 11
x64
```

Product priority:

```text
Windows 11 = primary
Windows 10 22H2 = legacy compatibility
```

The frontend must not hardcode assumptions that every Windows environment exposes every metric or integration capability.

When backend reports a capability as unavailable:

```text
Unavailable
```

must be represented as a valid UI state rather than treated as a frontend failure.

## B. UPDATE SYSTEM - FRONTEND INTEGRATION PATCH

This is a **new patch command**. It does not change STEP 7, STEP 11, or STEP 13 numbering/content.

### Goal

Connect the existing `Settings → Updates` UI to the backend updater contract once the backend update system is available.

### Existing UI Contract

The Settings category already defines:

```text
Updates
├── Current version
├── Stable/Beta channel
├── Check for update
└── Automatic check
```

This amendment adds the runtime state needed for a real updater:

```text
UpdateState
├── currentVersion
├── channel
├── checking
├── available
├── availableVersion
├── downloadProgress
├── installing
├── error
└── restartRequired
```

### Frontend IPC Contract

The frontend must use typed Tauri calls/events for update operations:

```text
update.get_current
update.check
update.get_state
update.download
update.install
update.cancel
```

Events:

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

The frontend must not implement version comparison, signature verification, installer execution, or download trust decisions itself.

## C. Update UI States

### No update

```text
You're up to date.
AzaleaOS Full 0.1.0
```

### Update available

```text
AzaleaOS Full 0.2.0 is available.

[ View Release Notes ]
[ Update Now ]
[ Later ]
```

### Downloading

```text
Downloading update…
62%
```

### Installing

```text
Installing update…
AzaleaOS will restart when ready.
```

### Error

```text
Update couldn't be completed.
Your current version is still installed.

[ Retry ]
```

### Offline

```text
Update check unavailable.
Core features remain available offline.
```

## D. Online/Offline Rule

Core AzaleaOS must remain usable without internet.

Only the update path may require network connectivity.

```text
CORE
local-first

UPDATE
network-dependent
```

Do not place any update check in the render loop or in a high-frequency global polling loop.

## E. Security Rule

Frontend must trust only the backend updater result.

Never:

```text
Frontend → download EXE → run EXE
```

Instead:

```text
Frontend
   ↓
Tauri IPC
   ↓
Rust updater
   ↓
Verify signed artifact
   ↓
Install
```

## F. Performance Rule

Update checking must be lightweight.

Recommended behavior:

```text
Startup
 ↓
lightweight metadata check
 ↓
cache result
```

Do not repeatedly check the update server while the application is open.

## G. Patch Acceptance Criteria

This amendment is complete when:

```text
1. Settings → Updates has a typed backend contract.
2. Loading/success/error/offline states are represented.
3. Current version comes from backend/package identity.
4. Available update version comes from backend.
5. Download progress comes from backend event/state.
6. Installation is triggered through backend only.
7. Frontend never verifies or executes downloaded installers itself.
8. Update failure keeps the current app usable.
9. Core UI does not depend on internet availability.
```

**STOP after this patch.**

## H. Cross-Document Mapping

```text
FRONTEND                         BACKEND
────────────────────────────────────────────────────
Settings → Updates        →      NEW STEP 26
Current Version           →      update.get_current
Check for update          →      update.check
Channel                   →      update channel state
Download progress         →      update.download_progress
Install                   →      update.install
Update error              →      typed updater error
Restart required          →      updater lifecycle state
```

## I. Important Step Rule

The original frontend STEPs remain authoritative and retain their existing numbers:

```text
STEP 1  → Foundation
STEP 2  → Visual Shell
STEP 3  → OS Tabs
STEP 4  → App Tabs
STEP 5  → Launcher
STEP 6  → Resource Bar/Center
STEP 7  → Settings
STEP 8  → Files
STEP 9  → Native App Integration Surface
STEP 10 → Lifecycle Visualization
STEP 11 → Performance Pass   ← current completed position
STEP 12 → Accessibility + Polish
STEP 13 → Release Readiness
```

This amendment is **not a new replacement STEP**. It is a synchronization/update directive that can be applied after the existing frontend implementation reaches the point where backend IPC is available.
