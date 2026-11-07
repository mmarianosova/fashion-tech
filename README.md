# Fashion Tech Hackathon: textile sustainability flow

<img src="brand/svg/sortix-logo.svg" alt="Sortix" height="64">

> **Sortix** helps teams sort textile samples and review pickups. [Brand assets](brand/BRAND.md).

Scan garment labels, sort items for recycling, notify the right people. Two agents run on ZooWork Managed Agents; this repo holds the interface, backend and everything needed to configure the agents.

| Folder | What |
|---|---|
| `sustain-app/` | Next.js app: interface, tool handlers, review/approval UI, alerts inbox, cost guard, recycler-directory MCP route. Start with its README. Vercel Root Directory: `sustain-app`. |
| `prework/` | Agent personas (`agents/`), skills + ZIPs (`skills/`), dataset tools and scorers (`tools/`), build brief (`build/`), test prompts (`tests/`). Start with its README. |

## Try Sortix

- **Interactive local demo:** install Node.js 22.13+, then run
  `cd sustain-app && npm ci && npm run demo`. Open the printed URL. It
  includes 32 fictional samples and does not require ZooWork credentials.
- **Public judge preview:** [open Sortix on Vercel](https://fashion-tech-rouge.vercel.app/).
  The Vercel project serves the standalone guided replay from `sustain-app/preview`.
  It deploys from `main` and requires no login.

See the [app README](sustain-app/README.md) for the interactive walkthrough and
ZooWork configuration.
