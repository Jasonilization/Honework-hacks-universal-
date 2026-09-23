# Sparxer

A browser extension that helps you work through maths homework platforms
(Sparx Maths, Seneca, and others). It reads the question on your screen,
solves it with an AI model, and keeps a searchable record of every answer —
including Sparx bookwork codes, so bookwork checks are one click instead of
a scramble through your exercise book.

You bring your own API key (Google Gemini is free; OpenRouter works too).
Nothing is proxied through anyone else's server.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder.

## Set up

**Zero-key option:** if your Chrome ships the built-in AI model
(`LanguageModel`), pick **Chrome built-in AI** on first launch — it runs
entirely inside Chrome, offline, and answers questions detected from the
page. Enable detection on your homework site and you're done.

**Cloud option:** click the toolbar icon, open Settings, and paste a Gemini
API key from <https://aistudio.google.com/app/api-keys> (free), then press
**Test connection**. Supported providers:

| Provider | Key needed? | Notes |
|---|---|---|
| Chrome built-in AI | No | Offline, private; solves detected questions (no screenshots) |
| Ollama (local) | No | Your own models at localhost:11434; nothing leaves your machine |
| Google Gemini | Free key | Default; reads screenshots |
| OpenRouter | Key | One key, many models |
| NVIDIA NIM | Free key | build.nvidia.com signup |

Each provider only asks for the network access it needs when you select it.

## Everyday use

- **Analyze screen** — captures the visible tab and solves the maths
  question on it. The answer, working and hint appear in the popup. The
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
| Provider / Model | Gemini (default) or OpenRouter, with model choice and custom model IDs |
| API key | Stored only in this browser, sent only to your provider, never in URLs |
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

Screenshots and detected question text are sent only to the provider you
configured and are never stored. History keeps question text, answer and
code — no screenshots, no full URLs. The API key never appears in URLs or
logs.

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
