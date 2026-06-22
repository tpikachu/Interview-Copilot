# Electron Main / Renderer / Overlay Architecture

## Windows

### Main (Dashboard) window
```ts
new BrowserWindow({
  width: 1280, height: 800, minWidth: 960, minHeight: 600,
  show: false,
  webPreferences: {
    preload: <preload.js>,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
})
// loads renderer entry: index.html
```
- Standard chrome, resizable. Hosts all management UI.
- Shown on `ready-to-show`.

### Overlay window
```ts
new BrowserWindow({
  width: 420, height: 280,
  frame: false,
  transparent: true,
  alwaysOnTop: true,        // level: 'screen-saver'
  resizable: true,
  skipTaskbar: true,
  focusable: false,         // toggled; non-focusable so it never steals focus
  hasShadow: false,
  webPreferences: { /* same secure prefs */ },
})
overlay.setAlwaysOnTop(true, 'screen-saver')
overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
// loads renderer entry: overlay.html
```
- **Always-on-top**: `setAlwaysOnTop(true, 'screen-saver')`.
- **Compact/Expanded**: renderer changes layout; main resizes window
  (`overlay.setBounds`) on `overlay:set-mode`.
- **Opacity**: `overlay.setOpacity(0..1)` on `overlay:set-opacity`.
- **Font size**: handled purely in renderer (CSS var).
- **Show/Hide**: global shortcut toggles `overlay.show()/hide()`.
- **Privacy Mode**: `overlay.setContentProtection(true)` excludes it from screen
  capture on supported OSes.
- **Click-through (optional)**: `overlay.setIgnoreMouseEvents(true,{forward:true})`
  for a passive mode.

### Selection window (coding mode)
Created on demand by `Ctrl+Shift+S` / the "Coding mode" button. Frameless,
transparent, `alwaysOnTop`, sized to the primary display's `bounds`. The screen
is captured *before* the window shows (so the selector isn't in the frame); the
transparent window lets the user see the live desktop while drag-selecting. The
renderer crops the frozen frame (`capture:get-frame`) at devicePixelRatio scale,
runs local OCR, calls `capture:solve`, then closes. Loads `selection.html`.

## Window lifecycle

```
app.whenReady()
  ├─ initDb()            // open SQLite, run migrations
  ├─ registerIpc()       // all ipcMain.handle / ipcMain.on
  ├─ createMainWindow()
  ├─ registerGlobalShortcuts()
  └─ (overlay created lazily on first session start, kept hidden otherwise)

app.on('window-all-closed') -> quit (except macOS convention)
app.on('before-quit')       -> unregister shortcuts, close db
```

## Global shortcuts (defaults, user-rebindable later)

| Shortcut | Action | Channel |
|---|---|---|
| `CmdOrCtrl+Shift+Space` | Toggle overlay show/hide | `overlay:toggle` |
| `CmdOrCtrl+Shift+P` | Pause / resume AI | `session:toggle-pause` |
| `CmdOrCtrl+Shift+Enter` | Read problem from screen → OCR → answer | `capture:quick` |
| `CmdOrCtrl+Shift+S` | Region select → OCR coding mode (fallback) | `capture:region` |
| `CmdOrCtrl+Shift+H` | Toggle Privacy Mode | `privacy:toggle` |
| `CmdOrCtrl+Shift+\` | Toggle overlay click-through | `overlay:toggle-clickthrough` |

Registered with `globalShortcut.register`; all unregistered on `before-quit`.

## Renderer entry points

- `index.html`   → `src/renderer/main.tsx`    (Dashboard React root, router)
- `overlay.html` → `src/renderer/overlay.tsx` (Overlay React root)

Both share `src/renderer/lib` (api client wrapper, types) and Tailwind config.

## Event push (main → overlay/dashboard)

Main broadcasts to windows via `webContents.send`. Overlay subscribes:

| Event | Payload |
|---|---|
| `session:transcript-delta` | `{ text, isFinal }` |
| `session:question-detected` | `DetectedQuestion` |
| `session:answer-delta` | `{ questionId, token }` |
| `session:answer-done` | `{ questionId }` |
| `session:state` | `{ status, paused }` |
| `overlay:apply-settings` | `{ opacity, fontSize, mode }` |
