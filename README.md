# Sparxer

A browser extension that helps you work through maths homework platforms
(Sparx Maths, Seneca, and others). It reads the question straight from the
page, solves it with Chrome's built-in AI, and keeps a searchable record of
every answer — including Sparx bookwork codes, so bookwork checks are one
click instead of a scramble through your exercise book.

No accounts. No API keys. Nothing leaves your computer — the model runs
inside Chrome itself.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder.

## Requirements

Chrome with the built-in AI model (the `LanguageModel` API — recent stable
versions). The model (~2 GB) downloads on first use if Chrome hasn't fetched
it already. There is nothing else to configure — open the popup and press
**Analyze question**.

> Earlier versions supported cloud providers (Gemini, OpenRouter, NVIDIA
> NIM, Ollama). v5.2 runs on the built-in model only; the provider contract
> in `src/providers` remains, so a provider is still one file away.

## Everyday use

- **Analyze question** — reads the question text straight from the active
  tab (works on any site, no per-site setup) and solves it locally. The
  button itself shows progress while a request is in flight — click it
  again to cancel.
- **Side panel** — the button next to Settings keeps Sparxer visible next
  to your homework tab, so new results appear without opening anything.
- **History** — every solved question is saved locally with its bookwork
  code, question, answer, model and time. Click an entry to reopen it
  (no new request), copy its answer with one click, or delete it.
- **Bookwork checks** — when Sparx shows a bookwork check, Sparxer spots
  it, finds that code in your history, and puts the saved answer in front
  of you with a Copy button.

## Automatic detection (optional, off until you enable it)

Detection is opt-in **per site** and read-only — Sparxer never types or
submits anything on the site.

1. Open Sparxer on the homework site and press **Enable detection for the
   current site** in Settings. You'll approve access for that site only.
2. Sparxer watches the page for new questions (no polling — it listens to
   page changes and waits for them to settle).
3. A prompt shows each detected question. Turn on **Auto-analyze** if you
   want answers without pressing anything; leave it off to stay in control.

The **Detect questions** toggle is the master switch — turning it off stops
all detection everywhere immediately.

## Settings

| Setting | What it does |
|---|---|
| Theme | Light, dark, or follow the system |
| Include working | Adds 2–6 solution steps under each answer |
| Save history | Local-only, capped at 200 entries |
| Detect questions | Master switch for detection |
| Auto-analyze | Analyzes newly detected questions automatically (off by default) |
| Show question identifier | Displays codes like 4A on questions, results and history |

## Permissions and privacy

| Permission | Why |
|---|---|
| `activeTab` | Lets **Analyze screen** capture the tab you're looking at, only when you click |
| `storage` | Saves your key, settings and history locally |
| `scripting` + per-site permission | Registers the question detector **only** on sites you approve |
| `sidePanel` | The optional keep-it-open side panel |
| Gemini / OpenRouter host | Talks to the AI provider you configure |

Analysis happens inside Chrome's built-in model — there is no network
request at all. History keeps question text, answer and code — no
screenshots, no full URLs. Nothing is synced anywhere.

## Development

No build step — plain ES modules.

```
manifest.json
popup.html / sidepanel.html      two surfaces, one app (src/popup)
src/popup/                       UI: tokens/themes, views, engine client
src/background/service-worker.js analysis pipeline + state broadcasts
src/core/                        errors, prompt, parsing, normalization
src/providers/                   Gemini + OpenRouter behind one interface
src/sites/                       site adapters (Sparx, generic fallback)
src/storage/                     settings + history (chrome.storage.local)
tools/gen_icons.py               regenerates the icons (Pillow)
```

The provider interface (`src/providers`) and the site-adapter contract
(`src/sites/adapter.js`) are the extension points: a new AI provider is one
new file plus a registry entry; a new site is one adapter file.

AI answers can be wrong — check them. Use Sparxer to learn, not to skip
the learning.

Credits: original concept and first implementation by tagger-cheats.
