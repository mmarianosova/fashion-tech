# Fashion Tech Hackathon: textile sustainability flow

Scan garment labels, sort items for recycling, notify the right people. Two agents run on ZooWork Managed Agents; this repo holds the interface, backend and everything needed to configure the agents.

| Folder | What |
|---|---|
| `sustain-app/` | Next.js app: interface, tool handlers, review/approval UI, alerts inbox, cost guard, recycler-directory MCP route. Start with its README. Vercel Root Directory: `sustain-app`. |
| `prework/` | Agent personas (`agents/`), skills + ZIPs (`skills/`), dataset tools and scorers (`tools/`), build brief (`build/`), test prompts (`tests/`). Start with its README. |

Quick start: `cd sustain-app && npm install && cp .env.example .env.local && npm run dev`.
Preview without installing anything: open `sustain-app/preview/index.html`.

## Team preview (Vercel)
The Vercel project for this repo serves the replay preview (`sustain-app/preview/index.html`) via the root `vercel.json`. Every push to `main` redeploys it. To deploy the full app instead: delete `vercel.json`, set the Vercel Root Directory to `sustain-app`, and follow `sustain-app/README.md` (needs a Turso database and `ZOO_MODE=real`).
