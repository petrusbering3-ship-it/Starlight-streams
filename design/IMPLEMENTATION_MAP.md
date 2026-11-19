# Swiss Console: implementation map

Branch: `ui/swiss-console`. Released as **v2.0** after merge.

## Build and run

| What | Command |
|---|---|
| Frontend (bindings + wasm + webpack → `dist/`) | `npm run build` (dev: `npm run dev`) |
| TS check only | `npx tsc --noEmit -p .` |
| Server (serves `dist/` as `static/`) | `cargo run --bin web-server` (config `server/config.json`) |
| Windows/Pi release | push to `main` → `.github/workflows/windows-installer.yml` |

Pages are three webpack entries: `web/index.html` + `web/index.ts` (login, home, game list, settings), `web/stream.html` + `web/stream.ts` (stream, sidebar, display overview), `web/admin.html` + `web/admin.ts`. CSS today: `web/styles/standard.css` and `web/styles/moonlight.css`, loaded lazily by `web/styles/index.ts` from the "Style" setting. Strings: `web/locales/*.ts` through `web/i18n.ts`.

## Board → code → change

| Board | Renders today | Change |
|---|---|---|
| S-Tokens, S-Components | `web/styles/*.css` | Load `starlight-swiss.css` on every page, `class="sl"` on `<body>`, new `web/icons.ts` (inline SVGs, no emoji). Old CSS removed at the end. |
| S-Login, S-Login-States | `web/component/modal/login.ts` (a modal on `index.html`) | Becomes a full two-column page (wordmark + 3 steps left, form right), EN/DA switch, error and loading states. Same login API. |
| S-Home | `web/index.ts`, `web/component/host/list.ts`, `web/component/host/index.ts` (one card per PC) | Becomes master/detail: PC index left (selected PC), detail right with the display table (giant numerals, LAST USED, green Stream), Sleep / Power Off footer, status bar, header with Update pill. Same actions and polling. |
| S-Home-States | same | Starting (progress bar, button loading), Not paired block, Off (grey numerals), empty (0), server unreachable (red bar, !), loading spinner. |
| S-Home-Modals | `web/component/host/add_modal.ts`, pairing in `host/index.ts`, guest link in `web/index.ts` | Restyled modals: Add PC (search + manual), Pair (big PIN cells), Guest link (2 steps + Copy), Power Off confirm, `…` menu (`web/component/context_menu.ts`). |
| S-Games | `web/component/game/list.ts`, `game/index.ts` | Cover grid (7 columns), RUNNING outline, Resume / Stop strip. |
| S-Settings, S-Settings-All | `web/component/settings_menu.ts` (+ modal) | Right side panel 520 px: Quick Setup tiles, collapsible sections, cells instead of selects where the design shows them, sticky Done. Same settings storage. |
| S-Stream, S-Stream-States | `web/stream.ts`, `web/component/notification.ts`, connection modal in `stream.ts` | Connect card (TEST · CONNECT · PLAY steps, logs, Retry on failure), toasts (max 2, 3 s), PIN modal, stats overlay. |
| S-Sidebar | `ViewerSidebar` in `web/stream.ts`, `web/component/sidebar/index.ts` | 316 px white panel with the rows in the design, game mouse switch, display cells, 4 edges. |
| S-Displays, S-Displays-Motion | `web/stream/display_overview.ts` | New look + motion: live video shrinks into its slot, others fade in staggered, captions, cross-fade screenshots, locked placeholder, zoom out on pick, reverse on Esc. |
| S-Admin-Users, S-Admin-Roles, S-Admin-Modals | `web/admin.ts`, `web/component/user/*`, `web/component/roles/*` | Tabs, index list + detail, permission checkboxes, default user warning, delete confirm. |
| S-Phone | all | Breakpoints from the CSS: bottom sheets, stacked home, sidebar at the bottom edge. |

## Things the design shows that don't exist yet (I'll leave them out unless you say so)

1. **Danish.** There is no Danish translation today (only English, French, Portuguese, Korean, Chinese). I'll add a full Danish locale with the strings from the prompt and translate the rest myself.
2. **"Server online · 4 ms"** in the status bar: no ping today. I can show "Server online" without the ms, or measure it in the browser (no server change).
3. **"Last stream: Display 1 · 1080p · 60 fps · 2 h ago"**: only the last game is remembered today. I can remember the rest in the browser (no server change).
4. **Shortcuts Ctrl+Shift+S (Stats) and Ctrl+Shift+Q (Exit)** shown in the sidebar: don't exist. I'd add them (browser only), or leave the labels out.
5. **"Updated 1 s ago"** under screenshots: can be counted in the browser.
6. **The old "Style" setting** (Standard / Moonlight): with one new theme it has nothing to choose. I'd remove it.
7. **Fonts**: the Pi has internet, so I'd load them from Google Fonts. If you want it to work without internet, I'll bundle them instead.

## Order (one commit each)

foundation → login → home + states + modals → game list → settings → stream + states → sidebar → display overview → admin → phone pass → remove old CSS → final report, then ask before merging.
