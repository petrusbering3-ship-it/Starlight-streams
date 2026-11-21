# Swiss Console: design system guide for Claude Code

This guide lets Claude Code apply the **Swiss Console** design system (the look of Starlight Streams v2) to any app: website, dashboard, desktop or mobile web. It contains the exact tokens, the rules that make it look right, ready-to-paste code, and a prompt to start with.

> **How to use it:** copy this file into the new project, for example as `docs/DESIGN.md`. Then tell Claude Code:
> *"Read docs/DESIGN.md and restyle the app with it. Follow every rule in 'The rules', keep all features, one commit per screen, ask before merging."*
> The full CSS file lives in the Starlight repo at `design/starlight-swiss.css`. Copy it next to this guide if you can; it's the reference implementation.

---

## 1. The idea in one paragraph

Swiss Console is **paper, ink, one red, one green**. It borrows from Swiss/International typographic style: a strict grid, flush-left type, big **thin** numerals, tiny **monospaced uppercase** labels, **1-px rules** instead of boxes and shadows, and **square corners everywhere**. It's calm and dense like a control console. Colour is used for *meaning only*, never for decoration. If a screen feels "designed", remove something.

---

## 2. Design tokens (copy exactly)

Put these on `:root` once. Every rule in the app uses these variables, never raw hex values.

```css
:root{
  /* colour */
  --sl-paper:#f3f2ee;      /* page background (warm off-white, never pure white) */
  --sl-white:#fbfbf9;      /* raised surfaces: panels, inputs, modals, menus */
  --sl-ink:#121212;        /* text, 1px section rules, primary dark buttons */
  --sl-ink-2:#3a3a38;      /* secondary text */
  --sl-grey:#6b6a65;       /* labels, help text (5.1:1 on white) */
  --sl-hair:#d9d7d0;       /* row dividers, quiet borders */
  --sl-red:#d71e0e;        /* ONE thing per screen: "you are here", errors, danger */
  --sl-red-soft:rgba(215,30,14,.08);
  --sl-go:#0f7a3d;         /* ONLY the app's single main action (white text 5.4:1) */
  --sl-go-hover:#0c6a35;
  --sl-warn:#b25e00;       /* "in progress / waiting" text on paper (4.8:1) */
  --sl-night:#0e0e0d;      /* dark overlays (over video/images) */
  --sl-night-text:#f3f2ee;
  --sl-night-grey:#9b9a94;
  --sl-scrim:rgba(14,14,13,.55);

  /* type */
  --sl-font-display:"Inter Tight",Inter,system-ui,sans-serif;
  --sl-font-ui:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  --sl-font-mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
  --sl-fs-label:10.5px; --sl-fs-xs:12px; --sl-fs-sm:13px; --sl-fs-md:14px; --sl-fs-lg:16px;
  --sl-fs-h3:24px; --sl-fs-h2:40px; --sl-fs-h1:60px; --sl-fs-num:76px; --sl-fs-hero:132px;
  --sl-track-display:-.035em; --sl-track-label:.06em;

  /* space: 4-pt scale */
  --sl-1:4px; --sl-2:8px; --sl-3:12px; --sl-4:16px; --sl-5:20px; --sl-6:24px;
  --sl-8:32px; --sl-10:40px; --sl-12:48px; --sl-14:56px; --sl-16:64px;

  /* shape */
  --sl-radius:0;               /* everything is square */
  --sl-radius-pill:999px;      /* only: status dots, switches, one "update" pill */
  --sl-rule:1px solid var(--sl-ink);
  --sl-hairline:1px solid var(--sl-hair);

  /* motion */
  --sl-fast:150ms; --sl-base:220ms; --sl-slow:320ms;
  --sl-ease:cubic-bezier(.2,.8,.2,1);
  --sl-ease-emph:cubic-bezier(.16,1,.3,1);

  /* sizes */
  --sl-ctl:42px; --sl-ctl-sm:34px; --sl-touch:44px;
  --sl-statusbar-h:30px; --sl-header-h:72px;
}
```

### Fonts

Three free Google families. Load them **without blocking** the page:

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" media="print" onload="this.media='all'"
  href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@200;300;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
```

For offline apps, self-host the same files. The fallback stacks above keep the layout intact if the fonts never load.

| Role | Font | Weight | Used for |
|---|---|---|---|
| Display | Inter Tight | 600 (headings), **200** (numerals) | Page titles, section heads, big numbers |
| UI | Inter | 400 / 500 / 600 | Body text, buttons, inputs |
| Mono | JetBrains Mono | 500 | Labels (UPPERCASE), values, times, IDs, keyboard keys |

Turn on tabular numbers app-wide so values don't jump: `font-feature-settings:"tnum","cv11","ss01"`.

---

## 3. The rules (what makes it work)

These rules matter more than the exact colours. Claude Code must follow all of them.

1. **One red per screen.** Red means "look here": the current item, an error, a destructive action, an update. If two things on one screen are red, one of them is wrong.
2. **Green only for the main action.** In Starlight that's *Stream / Resume*. In your app, pick **one** verb, for example *Publish*, *Pay* or *Start*. Every other button is ink or quiet.
3. **Square corners.** `border-radius:0` everywhere, except status dots, switches and a single pill.
4. **Rules, not boxes.** Separate sections with a 1-px **ink** rule (`--sl-rule`) and list rows with a 1-px **hair** line (`--sl-hairline`). No card shadows. Only floating things (menus, dialogs) get a border, plus at most a flat offset shadow `8px 8px 0 rgba(18,18,18,.08)`.
5. **Big thin numerals.** Numbered things (items, steps, screens) get a huge Inter Tight **200** numeral (`76px`, `letter-spacing:-.05em`, `line-height:.8`): `01`, `02`, `03`, always two digits. The numeral of the current or last-used item is red.
6. **Labels are tiny mono caps.** Column heads, field labels, status lines: JetBrains Mono, `10.5px`, `uppercase`, `letter-spacing:.06em`, grey. Example: `PCS · 3`, `RESOLUTION`, `LAST USED`.
7. **Headings are tight and heavy.** Inter Tight 600, negative tracking (`-.035em`), `line-height:.9`. The page title is the biggest text on the page.
8. **Flush left, strict grid.** Everything aligns to one left edge. Page padding `40px` (16px on phones). Two-column screens use `250px | 1fr` with a `56px` gap.
9. **The paper is warm.** The background is `--sl-paper`, never `#fff`. Inputs, panels and menus are `--sl-white`, so they lift slightly.
10. **No emoji. Icons are inline SVG line icons:** 24-px viewBox, `stroke-width:1.8`, round caps, `stroke:currentColor`, drawn at 15 px. Never an icon font.
11. **Text says what happens.** Buttons are verbs ("Stream", "Apply", "Power off"). States are short ("Ready", "Off", "Starting… 7s"). No "Oops!", no exclamation marks.
12. **Motion is quick and quiet.** 150–320 ms, ease-out (`--sl-ease`). Things fade and slide 4–8 px. Nothing bounces. Always honour `prefers-reduced-motion`.
13. **Every state is designed:** empty, loading, error, offline, disabled and success. Use the same layout with different words; don't swap in a different screen.

---

## 4. Components (copy these)

### Base

```css
.sl{background:var(--sl-paper);color:var(--sl-ink);font-family:var(--sl-font-ui);font-size:var(--sl-fs-md);
  line-height:1.45;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum","cv11","ss01"}
.sl *,.sl *::before,.sl *::after{box-sizing:border-box}
.sl h1,.sl h2,.sl h3,.sl p{margin:0}
.sl-h1{font-family:var(--sl-font-display);font-weight:600;font-size:var(--sl-fs-h1);line-height:.9;letter-spacing:var(--sl-track-display)}
.sl-h2{font-family:var(--sl-font-display);font-weight:600;font-size:var(--sl-fs-h2);line-height:.95;letter-spacing:var(--sl-track-display)}
.sl-h3{font-family:var(--sl-font-display);font-weight:600;font-size:var(--sl-fs-h3);line-height:1;letter-spacing:-.02em}
.sl-num{font-family:var(--sl-font-display);font-weight:200;font-size:var(--sl-fs-num);line-height:.8;letter-spacing:-.05em}
.sl-label{font-family:var(--sl-font-mono);font-size:var(--sl-fs-label);font-weight:500;letter-spacing:var(--sl-track-label);text-transform:uppercase;color:var(--sl-grey)}
.sl-mono{font-family:var(--sl-font-mono);font-size:12.5px}
.sl-muted{color:var(--sl-grey)}
.sl-rule{height:1px;background:var(--sl-ink);border:0;margin:0}
.sl-mark{display:inline-block;width:10px;height:10px;background:var(--sl-red)} /* logo square */
.sl-ico{width:15px;height:15px;flex:none;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sl :focus-visible{outline:2px solid var(--sl-red);outline-offset:3px}
```

Add `class="sl"` to `<body>` (or the app root).

### Buttons

```css
.sl-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:9px;height:var(--sl-ctl);
  padding:0 20px;border:1px solid var(--sl-ink);border-radius:0;background:none;color:var(--sl-ink);font:inherit;
  font-size:var(--sl-fs-sm);font-weight:600;cursor:pointer;transition:background var(--sl-fast) var(--sl-ease),color var(--sl-fast)}
.sl-btn:hover{background:var(--sl-ink);color:var(--sl-white)}
.sl-btn:active{transform:translateY(1px)}
.sl-btn:disabled{cursor:not-allowed;background:none!important;border-color:var(--sl-hair)!important;color:var(--sl-grey)!important}
/* primary dark: Log in, Apply, Save. Label left, arrow "→" at the right edge */
.sl-btn-ink{background:var(--sl-ink);color:var(--sl-white);justify-content:space-between}
.sl-btn-ink:hover{background:#000}
/* THE main action: the only green thing */
.sl-btn-go{background:var(--sl-go);border-color:var(--sl-go);color:#fff;min-width:132px;justify-content:space-between}
.sl-btn-go:hover{background:var(--sl-go-hover);border-color:var(--sl-go-hover)}
/* quiet: Cancel, secondary */
.sl-btn-quiet{border-color:transparent;padding:0 10px}
.sl-btn-quiet:hover{background:none;color:var(--sl-ink);text-decoration:underline;text-underline-offset:5px}
/* danger: Delete, Power off (red text; red fill on hover) */
.sl-btn-danger{border-color:transparent;color:var(--sl-red);padding:0 10px}
.sl-btn-danger:hover{background:var(--sl-red);border-color:var(--sl-red);color:#fff}
/* loading: the label hides and a spinner shows */
.sl-btn.is-loading{color:transparent!important;pointer-events:none}
.sl-btn.is-loading::after{content:"";position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;
  border-radius:50%;border:2px solid var(--sl-hair);border-top-color:var(--sl-ink);animation:sl-spin .7s linear infinite}
.sl-btn-sm{height:var(--sl-ctl-sm);padding:0 12px;font-size:var(--sl-fs-xs)}
```

**Button hierarchy on one screen:** at most **one** green, **one** ink, and the rest quiet. A dialog footer is always `Cancel (quiet) · Confirm (ink)`, or `Cancel · Delete (danger)` for destructive actions.

### Links (header nav)

```css
.sl-link{display:inline-flex;align-items:center;gap:7px;height:36px;border:0;background:none;color:var(--sl-ink);
  font:inherit;font-size:var(--sl-fs-sm);font-weight:500;cursor:pointer;text-decoration:none;
  background-image:linear-gradient(currentColor,currentColor);background-size:0 1px;background-position:0 26px;
  background-repeat:no-repeat;transition:background-size var(--sl-base) var(--sl-ease)}
.sl-link:hover{background-size:100% 1px}   /* the underline draws in from the left */
```

### Status, tags, progress

```css
.sl-status{display:inline-flex;align-items:center;gap:7px;font-size:var(--sl-fs-xs);font-weight:600}
.sl-status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--sl-go)}      /* ready / online */
.sl-status--off{color:var(--sl-grey)} .sl-status--off::before{background:none;border:1.5px solid var(--sl-grey)}
.sl-status--error{color:var(--sl-red)} .sl-status--error::before{background:none;border:1.5px solid var(--sl-red);border-radius:1px}
.sl-status--busy{color:var(--sl-warn)} .sl-status--busy::before{background:none;border:1.5px solid var(--sl-warn);border-top-color:transparent;animation:sl-spin .9s linear infinite}
.sl-tag{display:inline-flex;align-items:center;height:20px;padding:0 6px;border:1px solid var(--sl-hair);font-family:var(--sl-font-mono);
  font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--sl-grey);background:var(--sl-white)}
.sl-progress{height:2px;background:var(--sl-hair)} .sl-progress>i{display:block;height:100%;background:var(--sl-warn);transition:width var(--sl-slow) var(--sl-ease)}
.sl-kbd{display:inline-flex;align-items:center;height:22px;padding:0 7px;border:1px solid currentColor;font-family:var(--sl-font-mono);font-size:10.5px}
```

### Forms

```css
.sl-field{display:flex;flex-direction:column;gap:8px;min-width:0}     /* .sl-label on top, then the input */
.sl-input{width:100%;height:48px;padding:0 14px;border:1px solid var(--sl-ink);border-radius:0;background:var(--sl-white);
  color:var(--sl-ink);font:inherit;font-size:15px}
.sl-input:focus{outline:none;box-shadow:inset 0 0 0 1px var(--sl-ink)}          /* focus = 2px ink border */
.sl-input[aria-invalid="true"]{border-color:var(--sl-red);box-shadow:inset 0 0 0 1px var(--sl-red)}
.sl-input:disabled{border-color:var(--sl-hair);color:var(--sl-grey);background:var(--sl-paper)}
.sl-help{font-size:var(--sl-fs-xs);color:var(--sl-grey)}
.sl-error{font-size:12.5px;font-weight:500;color:var(--sl-red)}
/* segmented choice (size, fps, plan...) instead of a dropdown when there are 2-6 options */
.sl-cells{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);border:1px solid var(--sl-ink)}
.sl-cell{min-height:40px;padding:0 10px;border:0;border-left:1px solid var(--sl-ink);background:none;font:inherit;font-size:var(--sl-fs-sm);font-weight:500;cursor:pointer}
.sl-cell:first-child{border-left:0}
.sl-cell[aria-pressed="true"]{background:var(--sl-ink);color:var(--sl-white)}
.sl-cell:disabled{color:var(--sl-hair);cursor:not-allowed}
/* switch (on = solid ink) */
.sl-switch{position:relative;width:46px;height:26px;padding:0;border:1.5px solid var(--sl-ink);border-radius:999px;background:var(--sl-white);cursor:pointer}
.sl-switch::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:var(--sl-ink);transition:left var(--sl-base) var(--sl-ease-emph)}
.sl-switch[aria-checked="true"]{background:var(--sl-ink)}
.sl-switch[aria-checked="true"]::after{left:23px;background:var(--sl-white)}
/* settings row: title + help on the left, control on the right */
.sl-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-top:var(--sl-hairline)}
```

### Menus, dialogs, toasts

```css
.sl-menu{min-width:210px;padding:4px 0;background:var(--sl-white);border:1px solid var(--sl-ink);box-shadow:8px 8px 0 rgba(18,18,18,.08);animation:sl-in var(--sl-fast) var(--sl-ease)}
.sl-menu-item{display:flex;align-items:center;gap:10px;width:100%;height:38px;padding:0 14px;border:0;background:none;font:inherit;font-size:var(--sl-fs-sm);text-align:left;cursor:pointer}
.sl-menu-item:hover{background:var(--sl-paper)}
.sl-menu-item.is-danger{color:var(--sl-red)} .sl-menu-item.is-danger:hover{background:var(--sl-red);color:#fff}
.sl-scrim{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:24px;background:var(--sl-scrim);animation:sl-fade var(--sl-base) var(--sl-ease)}
.sl-modal{width:100%;max-width:480px;background:var(--sl-white);border:1px solid var(--sl-ink);display:flex;flex-direction:column;animation:sl-pop var(--sl-base) var(--sl-ease-emph)}
.sl-modal-head{display:flex;justify-content:space-between;gap:12px;padding:22px 24px 0}     /* .sl-label above an .sl-h3 title, close × right */
.sl-modal-body{display:flex;flex-direction:column;gap:18px;padding:18px 24px 24px}
.sl-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:var(--sl-rule)}
.sl-toasts{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.sl-toast{display:flex;align-items:center;gap:10px;min-height:38px;max-width:min(520px,92vw);padding:8px 16px;background:var(--sl-white);
  border:1px solid var(--sl-ink);font-size:var(--sl-fs-sm);font-weight:500;pointer-events:auto;animation:sl-drop var(--sl-base) var(--sl-ease)}
.sl-toast::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--sl-ink)}
.sl-toast--ok::before{background:var(--sl-go)} .sl-toast--warn::before{background:var(--sl-warn)}
.sl-toast--error{border-color:var(--sl-red);color:var(--sl-red)} .sl-toast--error::before{background:var(--sl-red)}
```

Toast rules: at most 2 on screen. Info and success disappear after 3 s. Errors stay until closed.

### Motion keyframes

```css
@keyframes sl-spin{to{transform:rotate(360deg)}}
@keyframes sl-fade{from{opacity:0}}
@keyframes sl-in{from{opacity:0;transform:translateY(-4px)}}
@keyframes sl-pop{from{opacity:0;transform:translateY(8px)}}
@keyframes sl-drop{from{opacity:0;transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.sl *,.sl *::before,.sl *::after{animation-duration:1ms!important;transition-duration:1ms!important}}
```

Nice extras from Starlight that you can reuse:
- **Lists enter staggered:** each row `sl-pop .4s`, with a delay of 40 ms × index (max 160 ms).
- **Hover on a numbered row:** the numeral shifts `translateX(6px)`, and the row's left padding grows 6 px.
- **A side panel** slides in 40 px from the right over 320 ms.
- **A running item** gets a thin red 2-px line that runs along its bottom edge.

---

## 5. Page anatomy (the layout that makes it recognisable)

```
┌───────────────────────────────────────────────────────────────┐
│ SERVER ONLINE · 14 MS                               V2.0.45   │  ← status bar: 30px, ink bg, mono label, light text
├───────────────────────────────────────────────────────────────┤
│ ■ Starlight Streams                 Settings  Guest  Logout   │  ← header: 72px, wordmark (red square + bold), links right,
├───────────────────────────────────────────────────────────────┤    1px ink rule under it
│ PCS · 3            │ ● Ready · 3 displays · 192.168.1.20       │  ← status line (small, bold)
│ ─────────────      │ Petrus-PC                         ⋯       │  ← H1, 60px
│ 01 Petrus-PC  ●    │ ──────────────────────────────────────    │  ← ink rule
│ 02 Stue-PC    ○    │ NO.  DISPLAY      RESOLUTION  REFRESH     │  ← mono caps column heads
│ + Add PC           │ 01   Display 1 ★  2560×1440   144 Hz  [Stream ▸]
│                    │ 02   Display 2    3840×2160    60 Hz  [Stream ▸]
│                    │ ──────────────────────────────────────    │
│                    │ ☾ Sleep  ⏻ Power off        Last: 2 h ago │  ← quiet footer actions + grey note
└───────────────────────────────────────────────────────────────┘
   250px index           1fr detail          (gap 56px, padding 40px)
```

- **Status bar** (optional): a live system fact in mono caps on the left, the version on the right. It turns red when the system is down.
- **Header:** the red square logo mark, the wordmark (Inter Tight 700, 19 px, `-.03em`), and text links on the right with no button boxes.
- **Index + detail:** a numbered list on the left (the selected row has a 2-px ink top border) and the selected item big on the right.
- **Tables** are rows with hair dividers, never zebra stripes or cell borders. The first column is the big numeral.
- **Phones (< 820 px):** one column, padding 16 px, numerals 56 px, H1 44 px. Dialogs become bottom sheets (full width, top border only). Header links become icon buttons.

---

## 6. Adapting it to a different app

Map your app onto the system before writing code:

| Starlight | Your app (examples) |
|---|---|
| Green **Stream** button | The single most important verb: *Checkout*, *Publish*, *Start workout* |
| Red "last used" numeral | The current / selected / most recent item |
| PCs list (index) | Projects, customers, playlists, devices |
| Displays table (detail rows) | Tasks, orders, tracks, files |
| Status dot (Ready / Off / Starting) | Paid / Draft / Processing, Online / Offline |
| Mono caps labels | Every field label and column heading |

**Dark surfaces:** keep the app on paper. Use `--sl-night` only for overlays on top of media (video, photos, a full-screen viewer), with `--sl-night-text` and `--sl-night-grey`. If you really need a dark mode, swap these: paper→`#0e0e0d`, white→`#171716`, ink→`#f3f2ee`, ink-2→`#c9c8c2`, grey→`#9b9a94`, hair→`#2a2a28`. Keep red and green as they are, and check contrast again.

**Charts:** ink lines 1.5 px, hair grid lines, grey mono axis labels, no fills. Highlight one series in red. Big numbers above charts use `.sl-num`.

**Brand colour?** If the app must have its own brand colour, it replaces **red** (the "look here" colour). Green stays reserved for the main action. Never add a third accent.

---

## 7. Using it with frameworks

**Plain HTML/CSS:** paste the tokens + components into one `design.css`, put `class="sl"` on `<body>`, and use the class names above.

**React / Vue / Svelte:** keep the CSS as global CSS (don't rewrite it into CSS-in-JS). Make thin wrapper components that only set class names: `<Button variant="go|ink|quiet|danger" loading>`, `<Label>`, `<Num>`, `<Cells>`, `<Switch>`, `<Modal>`, `<Toast>`.

**Tailwind:** put the tokens in `tailwind.config` so classes stay on-system:

```js
// tailwind.config.js
export default {
  theme: {
    borderRadius: { none: "0", DEFAULT: "0", full: "9999px" },
    extend: {
      colors: { paper:"#f3f2ee", white:"#fbfbf9", ink:{DEFAULT:"#121212",2:"#3a3a38"}, grey:"#6b6a65",
                hair:"#d9d7d0", red:"#d71e0e", go:{DEFAULT:"#0f7a3d",hover:"#0c6a35"}, warn:"#b25e00", night:"#0e0e0d" },
      fontFamily: { display:['"Inter Tight"',"Inter","system-ui","sans-serif"], sans:["Inter","system-ui","sans-serif"],
                    mono:['"JetBrains Mono"',"ui-monospace","monospace"] },
      fontSize: { label:"10.5px", num:["76px",{lineHeight:".8",letterSpacing:"-.05em"}], h1:["60px",{lineHeight:".9",letterSpacing:"-.035em"}] },
      transitionTimingFunction: { sl:"cubic-bezier(.2,.8,.2,1)" },
    },
  },
}
```

Then a label is `font-mono text-label uppercase tracking-[.06em] text-grey`, and a numeral is `font-display font-extralight text-num`.

**Icons:** use [Lucide](https://lucide.dev) or hand-drawn SVGs at `stroke-width:1.8`. Inline the SVG (`<svg class="sl-ico" viewBox="0 0 24 24">…</svg>`); don't use an icon font.

---

## 8. Accessibility (built in, keep it)

- Contrast: ink on paper 17:1, grey labels 5.1:1, white on green 5.4:1, warn on paper 4.8:1. Don't lighten the grey.
- Focus ring: `2px solid red, offset 3px` on every interactive element (`:focus-visible`).
- Touch targets ≥ 44 px on touch screens (`--sl-touch`).
- Every icon-only button has an `aria-label`. Toggles use `role="switch"` + `aria-checked`, segmented cells use `aria-pressed`, and dialogs use `role="dialog" aria-modal="true"` + `aria-labelledby`.
- Status is never colour-only: there's always a word next to the dot ("Ready", "Off").
- Honour `prefers-reduced-motion`.

---

## 9. Checklist before you call a screen done

- [ ] Background is paper `#f3f2ee`, surfaces `#fbfbf9`, and there's no pure white page and no grey-blue anywhere
- [ ] Exactly **one** red thing and at most **one** green button on the screen
- [ ] All corners square (except dots, switches and one pill)
- [ ] Sections separated by 1-px ink rules, rows by hair lines, no drop shadows on cards
- [ ] Titles in Inter Tight 600 with negative tracking; numbers as big thin numerals (`01`, two digits)
- [ ] Every label and column head in mono caps, 10.5 px, grey
- [ ] Icons are inline SVG line icons, and there are no emoji
- [ ] Empty, loading, error, disabled and offline states exist and use the same layout
- [ ] Works at 390 px wide (one column, 16-px padding, bottom-sheet dialogs)
- [ ] Keyboard: visible red focus ring, Esc closes menus and dialogs
- [ ] `prefers-reduced-motion` turns animations off

---

## 10. Prompt to give Claude Code

```
Restyle this app with the Swiss Console design system in docs/DESIGN.md.

Rules:
- Read docs/DESIGN.md fully first. Its tokens, rules (section 3) and checklist (section 9) are the source of truth.
- Don't change app behaviour, routes, data or features. Only the UI.
- No new UI framework. Plain CSS (or the existing styling setup) with the tokens as CSS variables.
- Pick the app's ONE main action for the green button and tell me which one you chose.
- Inline SVG icons, no emoji, square corners, one red per screen.
- Start with a short map: each screen -> which pattern from the guide (index + detail, table rows,
  settings rows, dialog). Then one commit per screen: foundation (tokens, fonts, base) first.
- After each screen, take a screenshot at 1366x768 and 390x844 and check it against section 9.
- Remove the old styles at the end. Report what changed and anything you couldn't match.
- Ask me before merging.
```
