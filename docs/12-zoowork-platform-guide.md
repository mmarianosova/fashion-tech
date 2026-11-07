# ZooWork.AI: Platform Guide and Setup

Read on 2026-11-07 from the public developer docs (zoowork.ai/docs/en/), the SDK pages on PyPI and GitHub, and zoowork.ai marketing pages. Developer Preview: the API "may change before general availability", so re-check before relying on any detail.

**Evidence labels:** **[Docs]** stated on a docs page. **[Marketing]** from zoowork.ai home, enterprise, blog or directory pages. **[Inference]** our reading or design proposal, not stated by ZooWork. **[Unverified]** not confirmed.

**Not yet read:** TypeScript SDK reference page (mirrors the Python one), the Retrieval / "Connect a knowledge base" page, the Agent Builder (no-code) product, and the logged-in Platform UI. No account, key or funds were touched.

## 1. What ZooWork is
[Marketing] "AI agent delivery platform for forward-deployed engineers (FDEs) and domain experts", built by Serendipity One (formerly branded ZooClaw). Four products:
- **Agent Builder**: no-code. Describe the role, knowledge, SOPs, delivery standards and tool permissions in chat; publish; reach the agent from Slack, Teams, WhatsApp or an embedded sidebar. 50+ role templates.
- **Managed Agent API** (developer, Developer Preview): hosted agent runtime you call from your own backend. This is what the docs cover.
- **Enterprise AI Stack**: model gateway, SSO/RBAC, BYOK, audit; sales-led. 7-day pilot with a ZooWork engineer (support@zoowork.ai).
- **ZooData**: URL to agent-ready JSON, pay per use.

Models: OpenAI, Claude, Gemini, DeepSeek, Kimi, GLM, Seedance [Marketing]. Pick from `list_models()` [Docs].

Consumer pricing seen: Pro $30/month (70% off from $100) [Marketing]. API use is separate: prepaid organization balance [Docs]. How the two relate is [Unverified].

## 2. Core model [Docs]
- **Agent** (`agt_...`): persistent, versioned config: model, persona docs, skills, tool policy, MCP servers, custom tools. Created **stopped**; must be started.
- **Session**: one conversation under an Agent; holds the transcript and scopes events. **Sessions of one Agent share `/workspace`, the Agent Database and agent-scope memory.** Only conversation history is separate.
- **Event**: durable, sequence-numbered log. You post 5 input types: `user.message`, `user.interrupt`, `user.tool_confirmation`, `user.custom_tool_result`, `system.message`. You read ~20 output types (`run.started/finished`, `agent.assistant`, `agent.tool`, `agent.approval`, `agent.custom_tool_use`, `agent.error`, `attachment.created`, `message.outbound`, and others).
- **Environment**: sandbox image and network policy. Platform keys cannot manage it; use the managed default.
- **Turn / run**: one `user.message` and the work done for it. `run.finished` ends the turn, not the session. Status is `succeeded | failed | aborted`. A succeeded turn can be `turnEndReason: "yielded"`, meaning task work continues.

## 3. Setup path
1. **Platform account** at platform.zoowork.ai. Pick a Project (use Default Project at first). **Only the organization owner can create API keys.**
2. **API > Create API key.** Secret (`zwp_live_...`) is shown once. Keep it server-side only.
3. **Billing > Add funds** (Stripe; one balance shared by all Projects). Creating a key adds no funds. Confirm "Current balance" updated first.
4. **Install SDK.**
   - Python: `pip install zoowork` (Python 3.11+, SDK 0.9.0+, only dependency httpx).
   - TypeScript: `npm i @zoowork-ai/sdk` (Node 22+, SDK 0.14.0+).
   - Or plain HTTP: curl 7.76+ and jq 1.6+. Base URL `https://clawapi.ecap.gsmo.ai/service/v1`, header `Authorization: Bearer <key>`. This host differs from the zoowork.ai website.
5. `export ZOOWORK_API_KEY='zwp_live_...'`. Both SDKs read it.
6. **First call:** `list_models()`.
7. **First agent:** `create_agent({name, model:{primary}})` > `start_agent` > `wait_until_running` > `create_session(agent_id, {initial_events:[{type:'user.message', content:'...'}]})` > `stream_events`, break on `is_run_finished`. Clean up: stop, then delete.

Python skeleton [Docs, from PyPI]:
```python
async with create_zoowork_client() as client:
    models = await client.list_models()          # pick selectable==True
    agent = await client.create_agent({"name": "x", "model": {"primary": primary}})
    await client.start_agent(agent["agent_id"])
    await client.wait_until_running(agent["agent_id"])
    s = await client.create_session(agent["agent_id"],
        {"initial_events":[{"type":"user.message","content":"What can you do?"}]})
    async for ev in client.stream_events(agent["agent_id"], s["session_id"]):
        print(assistant_text(ev), end="")
        if is_run_finished(ev): break
```
Coding-assistant route [Marketing, Product Hunt]: give Claude Code the API docs plus one small task. The docs Quickstart has a copy-prompt card for this. Starter apps: github.com/SerendipityOneInc/zoowork-platform-quickstarts (Agent Starter, Customer Support with custom tools, Product Advisor with remote MCP, Research Assistant, Knowledge Assistant). That repo's README says docs there are "still being aligned".

## 4. Agent configuration [Docs: build/agents]
`resource` fields: `name` (required), `model.primary` (`provider/model-id`; bare name becomes `litellm/<id>`), `model.input`, `model.max_tokens`, `model.thinking` (`off|low|medium|high|max`), `userTimezone` (affects prompt context only, **not schedules**), `persona.docs[]`, `skills`, `include_global_skills` (default true), `labels`, `tool_policy`, `sandbox.scope` (`agent` default, or `session`), `mcp`, `custom_tools`, `environment_id/version`.
- **Persona docs** accepted: `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`. `MEMORY.md` and `memory/` are reserved (400).
- **Always set an explicit model.** Omitted model pins the platform default at creation, which can change. Choose by `default_for`, not catalog order. `selectable:false` gives 409 `model_not_selectable`; use `expired_fallback_to`.
- **Readiness:** poll `status.desired_state`, never `actual_state` (that is channel health).
- **Updates:** `update_agent(id, sections)` merges one level deep; arrays and scalars replace; **`tool_policy` and `system_prompt` always replaced whole.** Every PUT bumps `config_version`, even identical ones. Pass `expected_config_version` for atomic updates (409 `active_config_changed` on mismatch). No history API: keep your own copy of each config.
- **Create idempotency:** pass an idempotency key (>= 7-day replay window). Same key and body replays; different body is 409.
- **Delete order:** delete schedules, stop the agent, then delete it. Deleting does not stop it or remove schedules, and schedule routes 404 afterwards.
- **Create agents at setup time, not per message.** Each leaves a permanent workspace. **Serialize `createAgent` across the whole organization:** parallel creates give 503 `platform.runtime_credentials_unavailable`.
- Listing returns only agents owned by the key's user; 100 per page.

## 5. Tools, MCP, permissions, skills
**Built-in tools** [Docs: build/tools]: `read, write, edit, apply_patch, exec, process, web_fetch, web_search, web_image_search, pdf, image, artifact_publish`, plus `agent_db`, and memory tools when enabled.
- `tool_policy`: `allow` / `deny` (deny wins) / `permissions` (approval). Patterns: `*`, exact, one trailing `*`. `{}` restores the default surface. Denying web tools does **not** block network from `exec`.
- Media limits: `pdf` up to 10 files, 30 MiB each and total; `image` up to 20 images, 10 MiB each, 25 MiB total.
- **Custom tools** (your backend runs them): up to 32 per agent, name `^[a-zA-Z0-9_-]{1,64}$`, description <= 4 KiB, schema <= 16 KiB, timeout default 600,000 ms. Flow: agent emits `agent.custom_tool_use` (requested) > your app runs it > `resolve_custom_tool_call` or `user.custom_tool_result` (with stable `idempotency_key`). Pending calls survive restarts via `list_custom_tool_calls`. Run status shows `awaiting_approval` for both approvals and custom tools.
- A run can succeed even when a tool errored. Check `isError` and `runOutcome()` separately.

**MCP servers** [Docs: build/mcp]: `resource.mcp[]` with `name` (no underscores), `url`, `transport` (`streamable-http` default or `sse`), `toolFilter`, `exposure` (`deferred` default or `direct`), `context` (opt-in IDs; not authentication), `permission`, `tools` (per-tool overrides). Tools appear as `mcp__<server>__<tool>`.
- **Endpoint must be publicly reachable and accept unauthenticated requests.** Stored credentials are not attached. No loopback, private network or redirects. Updates replace the whole array.

**Permission policies** [Docs: build/permissions]: `always_allow` (default) or `always_ask` per MCP server or tool (up to 64 overrides, exact names). Approval flow: blocked `agent.tool` event / `agent.approval` > `list_approvals(status='pending')` > `resolve_approval(decision: allow-once | allow-always | deny)`. **Pending approvals are denied after 10 minutes.** Permission policies do not apply to custom tools. `persona_doc_update: always_ask` guards the agent editing its own persona.

**Skills** [Docs: build/skills]: `SKILL.md` (YAML `name` and `description`) plus files, one ZIP per skill. Instructions only; no tools or permissions. Scopes `global | org | project | personal`; Default Project key writes `org`, named Project key writes `project`. Upload does not attach; use `put_agent_skill` (`enabled`, `version_pin`). Max 64 skills in prompt. New agents get global skills (docx, pptx, xlsx, pdf) unless `include_global_skills:false`. Registry write workflow is "documented from source review and isn't live-verified".

## 6. Events, streaming, webhooks
- **Stream is session-scoped and stays open**: break on `is_run_finished`. Server pings every 20 s. SDK does not auto-reconnect.
- **Always resume with the opaque `ev.cursor`.** Never use `seq` or the deprecated `after` (silently drops your input events).
- `list_events` silently truncates at one page: use `list_all_events` (page size up to 500).
- Closing the stream does not cancel the run: post `user.interrupt`.
- Idempotency: put `idempotency_key` in each event body (not an HTTP header).
- **Webhooks** [Docs]: per Agent, max 10 endpoints, HTTPS on 443 with public hostname. Events: `session.*`, `run.started/finished/yielded`, `approval.requested/resolved`, `custom_tool.requested/resolved`, `outcome.evaluated`, `schedule.*`. Standard Webhooks signing (`whsec_`), verify against the raw body, +/-300 s tolerance, 16 KiB body limit, dedupe by event id and compare with the `webhook-id` header. Retries 5 s to 6 h, 72-hour deadline; 410 or 3xx disables the endpoint. Rotate secret with a 24 h overlap. Webhooks may arrive duplicated or out of order: confirm by reading the resource.

## 7. Files, data, memory, schedules
- **Files:** upload to `/workspace` with `upload_file` (about 100 KB/s, a few MB max; needs `sandbox.scope: agent`). Outputs: ask the agent to `artifact_publish` (files up to 100 MiB, fallback 25 MiB), then `list_artifacts` / `download_artifact`. **Artifact URLs are bearer credentials.** There is no API to read or write arbitrary workspace paths (deprecated methods fail with 502 after about 30 s). Session messages carry text only.
- **Agent Database:** managed libSQL, used by the agent through `agent_db` (`sql`, `args`). Shared by all sessions of the agent. The production viewer is unavailable (404). No RAG or managed index; connect your own via custom tools or MCP.
- **Memory:** agent-run tools `memory_create / search / update / delete`; scopes `agent` and `user_agent` (per `actor.ref`). Content <= 4,096 chars; search default 8, max 20; version conflicts possible. No SDK methods; recall is not automatic every turn. `actor.ref` is attribution, **not** authorization or file isolation.
- **Schedules:** `create_schedule(agent_id, {schedule_id, schedule:{kind:'cron', expr:'0 9 * * *', tz}, payload:{kind:'agentTurn', message, ...}, sessionTarget:'isolated' | 'session:<id>', enabled})`. Use **five-field cron plus `tz`**; macros, `CRON_TZ=` prefixes and six-field forms are accepted but unsafe. Firings run in parallel (isolated) and do not wait for earlier runs. A stopped agent skips firings (`runtime_stopped`) and they are not replayed. `timeoutSeconds` is not a budget. Optional **Outcome** evaluation on scheduled `agentTurn`: rubric text, `maxIterations` 1-5, `publish: after_satisfied | always | never`.
- **Channels** [Docs: build/channels]: WeChat (QR), WeCom, Feishu/Lark (QR or credentials), Slack, DingTalk (credentials). One connection per platform per agent. **Conflict:** the Availability page and the Not-supported table say chat-channel management is not available to Platform API keys, while the Channels page documents it for backend API keys, and PyPI says Project keys get 404. [Unverified]: test before planning on it. Safe fallback per the docs: your backend receives chat messages and forwards them to API sessions.
- **Sandbox** [Docs]: Ubuntu 22.04, x86_64, 4 vCPU / 4 GiB, non-root with passwordless sudo, E2B backend. Python 3.12, Node 24, Go, Rust, Java 21, Ruby, PHP, GCC 13; pandas, openpyxl, python-docx/pptx, pypdf, ReportLab, LibreOffice, pandoc, ffmpeg, Chromium + playwright-core, git, curl, jq, sqlite3, psql/redis-cli clients. **Unrestricted outbound network. Cannot be changed with Platform keys.** Runtime installs may not survive sandbox replacement; keep work in `/workspace`.

## 8. Cost, usage and limits [Docs]
- Balance is prepaid and shared by all Projects. **No server-enforced per-session or per-key spending cap.** Enforce your own limits, and `user.interrupt` runaway work.
- `GET /usage` (`range` 24h/7d/30d, `group_by` session/api_key): Platform credits, 200 credits = 1 USD. Key-scoped only; org-wide view is in the Platform UI. Transcript token cost fields are recorded as 0; do not use them.
- `GET /balance`: USD decimal; floors at "0.00" (can mean overdrawn); not real-time.
- No documented fixed rate limits; handle 429 with backoff (`usage.busy`, `quota_exceeded`).
- Python's default `urllib` User-Agent gets 403 `error code: 1010` from the edge. Use the SDK, httpx, requests or curl.
- Webhook delivery records kept >= 30 days; sessions are soft-deleted (transcripts retained for audit).

## 9. Not available with Platform keys (plan around these)
Custom Environments and images; sandbox network restriction; credential vault and authenticated/private MCP; turnkey ZooData / RAG / connectors; standalone Memory stores; self-hosted workers; managed private GitHub or auto PRs; general session Outcome API; delegation / roster API; admin API for orgs, Projects and keys (use the Platform UI); Agent Database viewer; direct workspace file reads. Replacement for credentials: keep them in our backend and expose operations as custom tools.

## 10. Security checklist [Docs: security/*]
1. API key backend-only; never in browser, persona, messages or sandbox.
2. One Project (own key) per app and per environment (dev/prod). Projects do not separate funds.
3. Authorize every user request in our backend; ZooWork authenticates the key, not end users.
4. Separate Agent per user or per data boundary; sessions are not a data boundary.
5. Validate custom-tool input and look up the user from our own mapping, never from tool input.
6. Narrow `tool_policy`: deny `exec`, `cron` and web tools unless needed; use `toolFilter` on MCP.
7. `always_ask` for risky calls and `persona_doc_update`; keep a decision handler running.
8. Treat web, file and MCP content as untrusted (prompt injection); the platform marks fetched text but enforces nothing.
9. Verify webhook signatures on raw body.
10. Treat Artifact URLs as credentials.
11. Watch usage; list and prune schedules, including ones the agent created itself.

## 11. Proposal: mapping our 11 agents + 2 human roles (Inference, not validated)
Nothing here is confirmed to work; each row needs a spike. **Note:** the demo build narrowed this to two agents (Intake and Disposition); see `14-sustainability-flow-build-spec.md` and `13-zoowork-budget-and-build-plan.md`.

| Our role | ZooWork feature that could carry it | Notes |
|---|---|---|
| 1 Dispatcher | Our own backend (orchestrator code) calling ZooWork sessions | Docs say delegation / roster API is not public; coordinate ordinary Agents and Sessions from our backend |
| 2 Rule Reader | Agent + Skill per retailer; manuals uploaded to `/workspace` | Output rule profile as Artifact or via `agent_db` |
| 3 Customs, 4 Label/Packing, 5 Tagger, 6 EDI | One Agent each (or one Agent with Skills), results in our result envelope | Agent-per-role gives separate workspace/db; tradeoff is more agents to provision (serialize creates) |
| 7 T&A Tracker, 8 Disposition Watcher | **Schedules** (`agentTurn`, cron + `tz`) with Outcome rubric | Daily cron; remember `userTimezone` does not affect schedules |
| 9 Reverse Logistics, 10 Chargeback Dispute | Agents triggered by Dispatcher; custom tools for our data | Evidence packet published as Artifact |
| 11 Notifier | Our backend consuming `run.finished` / `message.outbound` webhooks, or a custom tool that sends email | ZooWork has no documented email tool; Channels (Slack / WeCom / Feishu) are an option if key scope allows |
| Confidence gate | Our backend reading the result envelope `confidence` | Not a ZooWork feature; `always_ask` approvals are tool-call gates, not confidence gates |
| H1 Human Reviewer | `always_ask` approvals + our review UI via `list_approvals` / `resolve_approval` | 10-minute auto-deny: needs a fast decision handler or webhook; for slow human review use our own queue instead |
| H2 Alert Recipient | Our email / in-tool alert | |
| Private data (sheets, Drive, Tradestone exports) | Custom tools in our backend, or upload to `/workspace` | Public MCP only; no authenticated MCP |

Open design issues to resolve: the 10-minute approval timeout vs human review latency; cost control without a spending cap; where our Drive / sheet data lives and how agents read it; Developer Preview stability; whether the hackathon uses the no-code Builder, the API, or a mix.

## 12. Sources
- Docs home: https://zoowork.ai/docs/en/ (pages under get-started/, build/, security/, reference/)
- Python SDK: https://pypi.org/project/zoowork/ ; docs https://zoowork.ai/docs/en/reference/python-sdk
- TypeScript SDK: https://github.com/SerendipityOneInc/zoowork-sdk-typescript
- Docs source: github.com/SerendipityOneInc/zoowork-agents-docs ; quickstarts: github.com/SerendipityOneInc/zoowork-platform-quickstarts
- Marketing: https://zoowork.ai/ , /enterprise , /pricing , /blog/what-is-zoowork/ , /industry/us-retail/
