# AGENTS: Vision Pro + SSH Workflow
# Repository Guidelines

## Project Structure & Modules
- `vision-survivor/`: main static app (HTML/CSS/JS). Deployed as site root.
- `.github/workflows/pages.yml`: GitHub Pages workflow (deploys `vision-survivor/`).
- `.nojekyll`: disables Jekyll on Pages.
- This repo has no server code or package manager; keep dependencies zero.

## Build, Run, and Preview
- Local preview (LAN): `cd vision-survivor && python3 -m http.server 8000 --bind 0.0.0.0` then open `http://<IMAC_LOCAL_IP>:8000`.
- Pages deploy: `git add -A && git commit -m "Update" && git push` (workflow “Deploy Vision Survivor to Pages” publishes `vision-survivor/`).
- First‑time Pages settings: enable Pages via Actions, allow “Read and write permissions”.

## Coding Style & Naming
- Indentation: 2 spaces; UTF‑8; Unix line endings.
- JavaScript: ES6+, semicolons required, `const`/`let` over `var`, small pure functions, early returns.
- CSS: use CSS variables; prefer utility‑like small rules; avoid frameworks.
- Filenames: kebab‑case for assets and folders; keep entry points as `index.html`, `main.js`, `style.css`.
- Keep the app framework‑free; measure bundle size before adding libraries.

## Testing Guidelines
- No formal test framework yet. Do manual smoke tests:
  - Launch, resize window, and verify HUD/overlay.
  - Pointer input (tap/click) moves player; auto‑attack fires; game over resets.
  - Check performance on Vision Pro Safari and desktop Safari/Chrome.
- Optional: add lightweight unit tests only if you introduce testable logic modules.

## Commit & Pull Request Guidelines
- Commits: short, imperative mood, scoped prefix when helpful, e.g. `feat: scaled enemy spawn`, `fix(hud): clamp HP display`.
- PRs must include:
  - Summary of changes and rationale.
  - Before/after screenshots or a short clip.
  - Test plan (steps + environments) and Pages URL if applicable.
  - Notes on risks and fallback.

## Security & Configuration Tips
- Do not commit secrets; this is a public static site.
- Pages workflow publishes only `vision-survivor/`. Keep private files outside or git‑ignored.
- If LAN preview fails: confirm same Wi‑Fi, use `--bind 0.0.0.0`, allow macOS firewall, get IP via `ipconfig getifaddr en0`.

## Vision Pro + SSH Notes
- Edit via SSH: `ssh <user>@<host> && cd ~/Development/WebApp/Practice`.
- Use LAN preview for rapid iteration; deploy to Pages to share externally.
This guide helps you continue working on this project over SSH from Apple Vision Pro. It assumes you can SSH into your iMac and have this repository at `~/Development/WebApp/Practice` (adjust if different).

## Overview
- Edit files via SSH (nano/vim).
- Preview locally on LAN or deploy via GitHub Pages.
- Test from Vision Pro Safari using IP (LAN) or the Pages URL.

## Prerequisites
- Git installed on iMac: `xcode-select --install` (once).
- Python 3 (for local static server): `python3 --version`.
- GitHub repository with remote set (SSH or HTTPS).
- Pages workflow present: `.github/workflows/pages.yml` (already included).

## Connect via SSH (from Vision Pro)
```bash
ssh <user>@<imac-host-or-ip>
cd /Users/<user>/Development/WebApp/Practice
```

## Development Loops

### A) Fast LAN Preview (no deploy)
Use when you want immediate feedback on the same Wi‑Fi network.
```bash
cd vision-survivor
python3 -m http.server 8000 --bind 0.0.0.0
# Open on Vision Pro Safari: http://<IMAC_LOCAL_IP>:8000
```
Notes:
- Find iMac IP: `ipconfig getifaddr en0` (or `en1` depending on Wi‑Fi interface).
- Allow incoming connections if macOS firewall prompts for Python.
- After editing a file, refresh the browser tab to see changes.

### B) GitHub Pages Deploy (auto URL)
Use when you prefer a public URL or can’t access LAN.
```bash
git status
git add -A
git commit -m "Update"
git push
# Wait for GitHub Actions: Deploy Vision Survivor to Pages
```
Open the deployment URL (e.g., `https://<USER>.github.io/<REPO>/`) in Vision Pro Safari.

## Editing Files over SSH
Common files:
- `vision-survivor/main.js` — game logic, loop, entities.
- `vision-survivor/style.css` — UI/visuals.
- `vision-survivor/index.html` — page scaffold/HUD.

Quick editors:
```bash
nano vision-survivor/main.js   # simple editor
vim vision-survivor/main.js    # if you prefer Vim
```

## Git Remote Setup (first time only)

SSH method (recommended):
```bash
ssh-keygen -t ed25519 -C "you@example.com"
cat ~/.ssh/id_ed25519.pub     # Add this key to GitHub → Settings → SSH and GPG keys
ssh -T git@github.com         # Type 'yes' on first connect
git remote add origin git@github.com:<USER>/<REPO>.git
git push -u origin main
```

HTTPS method (token-based):
```bash
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main        # Use PAT as password when prompted
```

If Git needs identity:
```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

## GitHub Pages Notes
- Settings → Pages → Build and deployment: source must be “GitHub Actions”.
- Settings → Actions → General → Workflow permissions: “Read and write permissions”.
- The workflow deploys only the `vision-survivor/` folder.

## Troubleshooting
- Can’t access LAN preview: ensure both devices on same Wi‑Fi, use `--bind 0.0.0.0`, check firewall, confirm IP.
- Push denied (publickey): add SSH key to GitHub or switch to HTTPS+token.
- Actions error about Pages site: enable Pages via Settings as above; ensure repo is Public for easiest setup.
- 404 after deploy: first deploy takes 1–2 minutes; hard refresh or append `?v=2` to bypass cache.

## Short Command Cheatsheet
```bash
# From repo root
cd vision-survivor && python3 -m http.server 8000 --bind 0.0.0.0

# Edit + Commit + Push
nano vision-survivor/main.js
git add -A && git commit -m "tweak" && git push

# Empty commit to retrigger deploy
git commit --allow-empty -m "retry pages" && git push

# Show IP (Wi‑Fi)
ipconfig getifaddr en0
```

## Vision Pro Usage Tips
- Pinch = click: look where you want to set the move target and pinch.
- To update quickly, use LAN preview during development; push to Pages when ready to share.
