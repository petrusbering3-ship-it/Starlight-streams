# Prompt: restyle Starlight Streams to the "Swiss Console" design

Copy everything below the line into Claude Code, started from the root of the Starlight Streams repo.
Before you start, copy the `design/` folder from this package into the repo root, so the repo has:

```
design/
  starlight-swiss.css      ← tokens + every component class (production CSS)
  swiss-reference.html     ← the 4 key screens on one page
  screens/                 ← the full design: one PNG + one HTML per board
    S-Tokens               colours, type, space, lines, motion
    S-Components           every component in every state
    S-Login / S-Login-States
    S-Home / S-Home-States / S-Home-Modals
    S-Games
    S-Settings / S-Settings-All
    S-Stream / S-Stream-States / S-Sidebar
    S-Displays / S-Displays-Motion
    S-Admin-Users / S-Admin-Roles / S-Admin-Modals
    S-Phone                6 phone screens at 390 px
CLAUDE_PROMPT.md           ← this file (optional)
```

The HTML files in `design/screens/` use `../starlight-swiss.css`, so open them straight from that folder.

---

You are a senior front-end engineer with a strong eye for typography. You are restyling the web UI of **Starlight Streams**, my fork of **Moonlight Web** (upstream: MrCreativ3001/moonlight-web-stream). It streams my gaming PC to a browser over WebRTC or Web Sockets, mostly to a Chromebook (1366×768) and sometimes to a phone. It can also turn the PC on, put it to sleep and power it off.

**The app is already built and works.** Every page, feature and state below already exists in the code. This job is **only a visual restyle** to a new design called **Swiss Console**: change markup, classes, CSS, icons and copy so it looks like the design. Do **not** change server behaviour, API routes, the streaming pipeline, input handling, settings storage or app logic. If a layout change needs a small DOM change (moving an element, wrapping something, adding a class or an `aria-` attribute), that's fine. Keep every element id, data attribute and event hook that the TypeScript relies on, or update the TypeScript references in the same commit.

**The design is the source of truth.** For every screen, open the matching PNG in `design/screens/` (you can view images) and the matching HTML (to read exact markup, classes and spacing). Match them. The written spec below explains behaviour and anything a picture can't show.

## 0. Ground rules

- Work in small, reviewable steps. After each phase: build, run, check, then commit with a clear message (`ui: …`). Make a branch first: `git checkout -b ui/swiss-console`.
- Keep the existing tech: plain TypeScript + HTML + CSS as the repo has it now. **No** new framework, no Tailwind, no UI kit. Small helper functions are fine.
- Keep every feature that works today. Nothing should stop working because of the restyle. If the design shows something the code doesn't have (e.g. "Last stream: …", "Server online · 4 ms", the 3-step login hints), add it only if the data is already on the client. Otherwise leave it out and list it in your final report. Don't build backend features without asking me.
- Keep i18n working. Every new or changed string goes through the project's existing translation system, in **English and Danish** (strings in section 6). Layouts must fit the longer Danish words: no fixed-width buttons that truncate, let things wrap.
- When unsure, open the matching `design/screens/S-*.png` and `.html` and match them. They are the source of truth for the look. `design/starlight-swiss.css` is the source of truth for values. Don't invent new colours, sizes or shadows.

## 1. Explore first (no edits yet)

1. Map the repo. Find:
   - the frontend source folder (upstream keeps it under `moonlight-web/web-server/`, look for the `web`/`static`/TS sources, `package.json`, `tsconfig.json`)
   - every HTML entry page and its TS entry (login, host list/home, game list, stream, admin, settings)
   - the current CSS files and how they are loaded or bundled
   - the i18n files (English + Danish) and how strings are looked up
   - the build: the npm scripts (`npm run build`/`watch`), how the Rust `web-server` serves the built files, and the `cargo` build/run command plus config file. Read the README, `package.json`, `Cargo.toml` and any Dockerfile or CI file to confirm.
   - Starlight-specific code: power on/off/sleep, the guest link, the update button, multi-display selection, the display overview (Ctrl+Shift+D, screenshots), Quick Setup presets, the Windows PIN unlock, role defaults.
2. Open every PNG in `design/screens/` and compare it with what the app renders today.
3. Write `design/IMPLEMENTATION_MAP.md` with a table of **design board (S-…) / state → files that render it today → what changes (markup, classes, CSS, copy)**, plus the exact build and run commands you found. Show it to me and wait for my OK before phase 2.

Suggested order after that (one commit each): foundation → Login → Home + its states and modals → Game list → Settings → Stream + states → Sidebar → Screens overview → Admin → phone pass → cleanup of the old CSS.

## 2. Foundation

1. Load `design/starlight-swiss.css` for every page. Copy it to where the frontend keeps its static CSS if `design/` isn't served, but keep one file as the single source. Load it **after** the old CSS, then delete old rules as you replace each screen. By the end, nothing should depend on the old theme.
2. Load the fonts. Self-host Inter Tight (200, 300, 500, 600, 700), Inter (400, 500, 600) and JetBrains Mono (400, 500) as woff2 if the app may run without internet. Otherwise use the Google Fonts URL at the top of the CSS file.
3. Add `class="sl"` to `<body>` (or each page's root) on every page.
4. Icons: use one small set of inline stroke SVGs (24×24 viewBox, `class="sl-ico"`, stroke 1.8, round caps). Make a tiny `icons.ts` helper. **No emoji anywhere in the UI.** Swap the old ▶ ⏻ ☾ 🔒 🎮 ★ glyphs for SVGs.

## 3. The design language: Swiss Console

The feel: a printed train timetable for your PCs. Paper white, black ink, thin rules, very large **thin** numerals, one red, one green. Calm, exact, confident. It must not look like a generic dark gaming dashboard.

**Colour rules**
- Background `--sl-paper` #f3f2ee. Raised surfaces (inputs, panels, modals, sidebar) `--sl-white` #fbfbf9. Text and rules `--sl-ink` #121212. Labels `--sl-grey` #6b6a65. Row dividers `--sl-hair` #d9d7d0.
- **Red #d71e0e marks one thing per screen**: where you are (the last-used display number, the live screen, the selected tab underline), errors, danger actions, the Update pill. Nothing else is red.
- **Green #0f7a3d is only for Stream / Resume.** Every Stream button is green, everywhere.
- The only dark surfaces are things drawn **over the video**: the display overview backdrop (`--sl-night`), stats and logs.

**Type rules**
- Inter Tight for titles (600, tracking −0.035em) and the giant numerals (**weight 200**: thin, not bold).
- Inter for UI text with tabular figures (`font-feature-settings: "tnum"`, already in `.sl`).
- JetBrains Mono only for tiny caps labels (`.sl-label`) and technical specs (resolution, Hz, codec, IP).
- Sentence case for names and buttons. Mono uppercase only for small labels like `PCS · 3`, `RESOLUTION`, `LAST USED`.

**Shape and space**
- Everything is square (radius 0). Only the Update pill, status dots and the switch are round.
- Structure comes from lines, not boxes: a 1 px ink rule between sections, hairlines between rows. **No boxes inside boxes, no drop shadows on paper.** Shadows are only for things floating over video (sidebar).
- 4-pt spacing (`--sl-1` … `--sl-16`). Page margins 40 px on desktop, 16 px on phone.

**Motion:** 150–320 ms with `--sl-ease`. Link underlines draw in from the left, index rows nudge 6 px right on hover, screens lift 8 px, modals rise 8 px and fade, toasts drop in from the top. Respect `prefers-reduced-motion` (handled in the CSS).

**Interaction states:** every interactive element needs hover, focus-visible (2 px red outline, 3 px offset), active (1 px down), disabled and loading. The CSS has them, plus `.is-hover`/`.is-loading`-style classes to force a state. Use real `<button>`, `<a href>`, `<input>` + `<label>`. Icon-only buttons need `aria-label`. Touch targets are at least 44 px on touch devices.

## 4. Screens (match `design/screens/S-*.png`; the board name for each section is in its heading)

### 4.1 Login · S-Login, S-Login-States
- Two columns. Left: "Starlight / Streams." set huge (Inter Tight 600, ~132 px, tracking −0.055em, red full stop), mono version line at the top, and at the bottom three numbered steps under a rule: 01 Turn it on, 02 Pick a screen, 03 Play. Right: a white panel with an EN/DA switch (underlined current language), "Log in" title, Username and Password fields (`.sl-input`), and a full-width `.sl-btn-ink.sl-btn-lg` "Log in →".
- Error: the field gets `aria-invalid="true"` and red text "Wrong password. Try again." under it, and focus returns to Password. Loading: the button gets `.is-loading` and the fields are disabled.
- Phone: the left column collapses to the wordmark (~56 px) above the form.

### 4.2 Home (PC list) · S-Home, S-Home-States
- **Status bar** (30 px, ink): `SERVER ONLINE · 4 MS` on the left, version on the right. When the server is unreachable it turns red: `CAN'T REACH THE SERVER · RETRYING`, and the main area shows the error state (4.10).
- **Header** (72 px, ink rule below): red square + "Starlight Streams" wordmark, then on the right: the Update pill `↑ Update to vX.Y.Z` (only when a newer version exists; while updating: spinner + "Updating…", not clickable), and text links Settings, Guest link (admins only), Logout.
- **Main grid:** a 250 px left column + content, gap 56 px.
  - **Left: PC index.** Label `PCS · N`, then one `.sl-index-row` per PC: mono number `01`, name, status on the right (Ready green dot / Off hollow grey / Not paired red / Starting… with a spinning dot and a seconds count). The selected PC has a 2 px top rule (`aria-current="true"`). The last row is "+ Add PC". Under it: "Off PCs start when you press Stream. It takes about 45 s."
  - **Right: selected PC.** Status line ("Ready · 3 displays · 192.168.1.20") above the name as `.sl-h1`, with the "⋯" menu button on the right. Then an ink rule, a mono table header (No. / Display / Resolution / Refresh / Model), and one `.sl-display-row` per display (1–4):
    - giant thin numeral `01`; **red if this display was streamed last** (`.is-last`, plus a red `LAST USED` mono label)
    - "Display 1" + a small star SVG if it's the primary display
    - resolution and refresh in mono, the monitor name in ink-2
    - a green `.sl-btn-go` "Stream ▸" on the right
  - Footer under an ink rule: "Sleep" (quiet button, moon icon) and "Power Off" (red danger button), both **hidden for guests**. On the right in grey: "Last stream: Display 1 · 1080p · 60 fps · 2 h ago" if the data exists.
  - **Starting:** the status shows "Starting… 42s", a 2 px amber `.sl-progress` runs under the title, the pressed Stream button shows `.is-loading`, and the stream starts by itself when the PC is ready.
  - **Not paired:** instead of the table, a short block: "Pair this PC first. You'll type a 4-digit PIN on the PC once." + a `.sl-btn-ink` "Pair".
  - **Off:** the table still shows, numerals greyed, and Stream wakes the PC.
- **"⋯" menu and right-click on a PC** (`.sl-menu`): Show Details, Pair, Make Private / Make Global, divider, Remove Host (danger). Close it with Esc or a click outside.
- Power Off asks first (4.9 confirm): "Turn off Gaming-PC?" / "Anyone playing on it will be disconnected." / Cancel + red "Power Off".

### 4.3 Add PC modal · S-Home-Modals
Title "Add PC". A line with a spinner: "Searching your network for PCs…". Found PCs as index rows (name + mono IP; already-added ones disabled with "(already added)"). A hairline with "or type the address", then Address + Port fields. Footer: Cancel + Add (`.sl-btn-ink`, disabled until valid).

### 4.4 Pairing modal · S-Home-Modals
"Pair Kontor-PC". "Type this PIN on the PC:" then the 4 digits big in `.sl-pin` (thin Inter Tight 54 px in square cells), a one-line hint where to type it (keep the current wording in the code, e.g. the Sunshine web UI's PIN page), "Waiting for the PIN…" with a spinner, and Cancel.

### 4.5 Guest link modal · S-Home-Modals
Step 1: "Guest link" with a "Valid for" number field with an `hours` suffix, help "The link stops working after this.", and "Create link". Step 2: a read-only mono input with the link + "Copy" (a toast "Link copied"), and a note with a shield icon: "The guest can play, but can't turn off your PC. Expires in 4 hours."

### 4.6 Game list · S-Games (shown after picking a PC when the last game isn't remembered)
Same header with "← Back", and the PC + display as the title. A grid of cover images (3:4, square corners, 1 px hairline, the title under each in 600). Hover: lift 4 px. The **running game** gets a 2 px red outline, a mono `RUNNING` label, a green "Resume Session" and a quiet red "Stop Current Session". Grid: 7 columns at 1366, 2 on phone. The running game's Resume and Stop sit in a white strip at the bottom of its cover (see S-Games).

### 4.7 Settings · S-Settings, S-Settings-All: a right side panel over Home, 520 px wide, white, 1 px ink left border
- Header "Settings" + close. Body scrolls; the footer is sticky.
- **Quick Setup** at the top: `.sl-presets`, 4 tiles in one ink-bordered strip: Auto (mono label `RECOMMENDED`), Weak network · 720p, Balanced · 1080p, Best quality · native. The selected tile is inverted (ink background). Changing a value by hand below clears the selection.
- Collapsible sections (`.sl-section`, ink rule + Inter Tight 18 px head + chevron), Video open by default:
  - **Video:** Auto quality switch + one-line explanation ("Tests your connection and picks size, fps and bitrate. Adjusts while you play."); Video size cells 720p/1080p/1440p/4K/Native/Custom (+ W/H fields for Custom); FPS cells; Bitrate `.sl-range` + a mono number field with `Kbps`; Codec cells Auto/H264/H265/AV1 (disable any the role doesn't allow); Picture sharpening cells Off/Auto/Low/Medium/High; HDR switch; "Advanced renderer options" as a nested collapsible.
  - **Audio:** Play audio on the PC too; Microphone.
  - **Mouse & touch:** mouse mode on start (Relative / Follow / Point and drag), touch mode, scroll mode, cursor sensitivity range.
  - **Controller:** Invert A/B, Invert X/Y, send interval (ms).
  - **Other:** language, data transport cells Auto/WebRTC/Web Socket, fullscreen on stream start, sidebar edge cells Left/Right/Up/Down, hide sidebar button, style.
  - **Admin only:** under an ink rule, `ADMIN` tag + a role select + "Save as role defaults".
- Footer: "Done" (`.sl-btn-ink`). Phone: the panel becomes a full-height bottom sheet.

### 4.8 Stream · S-Stream, S-Stream-States
- The video fills the screen. **Nothing on top** except the small `.sl-handle` at the sidebar edge.
- **Connecting** (centred white `.sl-connect` card over black): mono steps `TEST · CONNECT · PLAY` (done = ink, current = red, upcoming = hairline grey); title "Testing your connection…", then "Connecting"; "Show logs" toggles a `.sl-log`; "Close". On success the card fades out and a toast shows "Auto quality: 1080p · 60 fps · 12 Mbit/s". On failure: title "Couldn't connect", the logs open, then Retry (`.sl-btn-ink`) + Close.
- **Toasts** (`.sl-toast`, top centre, max 2, auto-hide after 3 s; errors stay with a close button): quality lowered/raised (amber/green dot), "Game mouse on · Ctrl+Shift+M to turn off", "The PC is locked: unlocking…", "Display 2 · DELL U2723QE", errors (red).
- **Windows PIN prompt:** a small modal "Type your Windows PIN", `.sl-input-pin` (numeric, password), note "Saved only in this browser.", Cancel / OK.
- **Stats overlay** (toggle): `.sl-stats` top-left, dark translucent mono: codec, resolution @ fps, fps received/decoded, bitrate, packets lost, RTT, decode time, transport.

### 4.9 Stream sidebar · S-Sidebar
White panel, 316 px, 1 px ink edge, floating shadow, slides in/out with `transform` (320 ms, `--sl-ease-emph`). Works with mouse and touch; tap outside to close. Supports the 4 edges from settings (`.sl-sidebar--right/--top/--bottom`). Top to bottom:
1. `STREAMING` label, PC name (Inter Tight 24), mono "H265 · 1080p · 60 fps · 9 ms", close chevron.
2. Ink rule. **Game mouse**: a big row with a title, mono "On · Ctrl Shift M" under it, and an `.sl-switch` on the right.
3. Unlock PC (key icon).
4. `DISPLAY` label + `.sl-cells.sl-cells--num` with one numbered cell per display (current one inverted), then "Ctrl Shift D shows all screens".
5. List rows with the shortcut right-aligned in mono: Fullscreen, Lock mouse, Keyboard (on-screen), Send keycode, Stats.
6. Mouse mode + Touch mode selects side by side.
7. Pinned at the bottom under an ink rule: **Exit stream** in red (turns solid red on hover).

### 4.10 Screens overview (Ctrl+Shift+D over the stream) · S-Displays, S-Displays-Motion
The signature moment. Make it smooth.
- **Layout:** read each display's position and size from the PC's Windows layout (what the code already gets) and draw them **exactly as arranged in Windows**: side by side, above/below, offsets, different sizes, portrait included. Scale to fit about 84% of the width / 56% of the height, centred, leaving room for captions. Inset each screen by ~7 px so neighbours read as separate.
- **Backdrop:** `.sl-overview-backdrop`, near-black at 90% + blur 20 px, fades in over 220 ms. Top left: mono `GAMING-PC · 3 DISPLAYS` + "Screens" (Inter Tight 40). Top right: `Ctrl Shift D close` keys + "Click a screen to jump in".
- **Each screen** (`.sl-screen`): the current display shows the **live video** (move or mirror the existing video element; don't open a second stream) with a 2 px red outline offset 3 px. The others show screenshots refreshed every 1.5 s, **cross-faded over 200 ms** when a new one arrives, and a dark placeholder with a spinner while loading or when the PC is locked (lock icon + "Locked"). Under each screen, the caption: thin `01` numeral, the monitor name, mono resolution, and on the current one a red `● LIVE · YOU ARE HERE`, otherwise grey `UPDATED 1 S AGO`.
- **Hover:** lift 8 px and a white outline.
- **Open animation:** the live video **shrinks from fullscreen into its slot** (animate left/top/width/height over 320 ms with `--sl-ease-emph`). The other screens fade and rise in, staggered 40 ms by distance from the current one. Captions fade in last.
- **Pick a screen:** the clicked screen **grows from its slot to fill the window** (320 ms, `.is-zooming`, captions fade out), the others fade to 0 in 220 ms, the stream switches to that display, and the overlay is removed. Then toast "Display 2 · DELL U2723QE".
- **Esc or a click on the backdrop:** the reverse of opening (the live screen grows back to full) and you stay on the current display.
- Use FLIP or explicit left/top/width/height transitions. Mouse and touch only; no keyboard navigation needed beyond Esc and the shortcut. Keep the shortcut **Ctrl+Shift+D** (plain Ctrl+D is the browser's bookmark key and is also needed on the PC).

### 4.11 Admin · S-Admin-Users, S-Admin-Roles, S-Admin-Modals
- Header with "← Back", "Admin", and a `ADMIN` role tag. Tabs `Users` / `Roles` (`.sl-tabs`, red underline on the selected tab).
- Two columns: left a search field + "Add User"/"Add Role" (`.sl-btn-ink`), then an index list (`.sl-index-row` style) with avatar initials, name and role, plus a `DEFAULT` tag on the default user. Right: the detail under a 60 px title.
- **User detail:** Name, Role select, New password ("Leave empty to keep"), a "Set default user" row with a warning dialog ("Make maja the default user?" / "Anyone who opens Starlight Streams will be signed in as maja, without a password. Only do this on a private network."), footer Delete (danger) · Reset · Apply (`.sl-btn-ink`, loading state).
- **Role detail:** Name, Type, Permissions as `.sl-check` boxes in 3 columns (Allow adding hosts, Allow WebRTC, Allow Web Sockets, Allow H264/H265/AV1/HDR), Max bitrate (Kbps), "Default settings" (opens Settings in role mode), then Delete · Reset · Apply.
- Add User/Role modals, and a Delete confirm with a red solid button.

### 4.12 Shared states · S-Home-States, S-Components
- **Empty home:** a giant thin `0`, "No PCs yet", "Add your gaming PC to start streaming.", "Add PC" (`.sl-btn-ink`).
- **Server unreachable:** red status bar, a giant thin `!` in red, "Can't reach the server", "Check your internet and try again.", "Try again".
- **Loading:** `.sl-spinner` with a short label. Never a blank screen.

## 5. Responsive · S-Phone
- Design at 1366×768 first. Nothing may scroll horizontally at 1366, and the Home screen with 3 displays must fit without page scroll.
- Check at 1100, 820, 480 and 390 px wide. Breakpoints are in the CSS:
  - Phone home: index above the table, display rows become two lines with a full-width Stream button, header links icon-only.
  - Modals become bottom sheets, and the settings panel becomes a full-height sheet.
  - The stream sidebar defaults to the bottom edge on narrow portrait screens.
  - The display overview scales to fit the phone width.

## 6. Copy (EN → DA)
Use these exact strings and add the keys to the existing i18n system. Keep texts short.

| EN | DA |
|---|---|
| Log in | Log ind |
| Username / Password | Brugernavn / Adgangskode |
| Wrong password. Try again. | Forkert adgangskode. Prøv igen. |
| Turn it on / Pick a screen / Play | Tænd den / Vælg en skærm / Spil |
| Settings / Guest link / Logout | Indstillinger / Gæstelink / Log ud |
| Update to v{x} / Updating… | Opdater til v{x} / Opdaterer… |
| Ready / Off / Not paired / Starting… {s}s | Klar / Slukket / Ikke parret / Starter… {s}s |
| Stream | Stream |
| Sleep / Power Off | Dvale / Sluk |
| Last used | Sidst brugt |
| Add PC | Tilføj pc |
| Off PCs start when you press Stream. It takes about 45 s. | Slukkede pc'er tændes, når du trykker Stream. Det tager ca. 45 s. |
| Turn off {pc}? / Anyone playing on it will be disconnected. | Sluk {pc}? / Alle, der spiller på den, bliver afbrudt. |
| Searching your network for PCs… | Søger efter pc'er på dit netværk… |
| (already added) | (allerede tilføjet) |
| Type this PIN on the PC: | Skriv denne PIN på pc'en: |
| Waiting for the PIN… | Venter på PIN… |
| Valid for / hours | Gyldig i / timer |
| The guest can play, but can't turn off your PC. | Gæsten kan spille, men kan ikke slukke din pc. |
| Link copied | Link kopieret |
| Resume Session / Stop Current Session | Fortsæt session / Stop nuværende session |
| Quick Setup / Recommended | Hurtig opsætning / Anbefalet |
| Weak network / Balanced / Best quality | Svagt netværk / Balanceret / Bedste kvalitet |
| Testing your connection… / Connecting / Couldn't connect | Tester din forbindelse… / Forbinder / Kunne ikke forbinde |
| Show logs / Hide logs / Retry / Close | Vis log / Skjul log / Prøv igen / Luk |
| Auto quality: {res} · {fps} fps · {mbit} Mbit/s | Auto-kvalitet: {res} · {fps} fps · {mbit} Mbit/s |
| Game mouse | Spilmus |
| Unlock PC | Lås pc op |
| The PC is locked: unlocking… | Pc'en er låst: låser op… |
| Type your Windows PIN / Saved only in this browser. | Skriv din Windows-PIN / Gemmes kun i denne browser. |
| Display / Screens / Click a screen to jump in | Skærm / Skærme / Klik på en skærm for at skifte |
| Live · you are here | Live · du er her |
| Exit stream | Afslut stream |
| Fullscreen / Lock mouse / Keyboard / Send keycode / Stats | Fuld skærm / Lås mus / Tastatur / Send tastekode / Statistik |
| Save as role defaults | Gem som standard for rolle |
| Set default user | Vælg standardbruger |
| No PCs yet / Can't reach the server | Ingen pc'er endnu / Kan ikke nå serveren |

## 7. Check your work (each phase)
1. Build with the repo's real commands (from `IMPLEMENTATION_MAP.md`). No TypeScript errors, no console errors.
2. Run the server and open every page. If Playwright is available, take screenshots at **1366×768** and **390×844** of: login (default, error), home (ready, starting, not paired, guest, empty, server error), each modal, game list, settings (all sections open), stream connecting/failed, sidebar open, display overview open, admin users and roles. Save them to `design/check/` and compare each one side by side with the matching `design/screens/S-*.png`. Fix spacing and type until they match.
3. Check keyboard focus (Tab through each page: a visible red outline everywhere) and contrast (body text and labels at least 4.5:1).
4. Switch the language to Danish and check that nothing truncates or overlaps.
5. Grep for leftovers: old colour hex values, emoji in UI strings, inline styles that duplicate tokens.

## 8. Definition of done
- Every screen and state matches its `design/screens/S-*.png` at 1366×768 and uses `starlight-swiss.css`. The old theme CSS is gone.
- No feature or behaviour changed: login, pairing, wake/sleep/power, guest links, update, streaming, input, settings and admin all work as before.
- The display overview opens and closes with the shrink and grow animation, switching works, and screenshots cross-fade.
- EN and DA are complete.
- 1366×768 and 390 px layouts work.
- Final report: what changed, file by file; any feature gaps you found (from section 0); anything you weren't sure about. Ask before merging.
