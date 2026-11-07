# Sustainability flow: pre-work package

Two ZooWork agents (Intake, Disposition) plus a recycler-directory MCP server and a thin app. No label images are generated here: bring your own dataset (see `research_prompt_dataset.md`).

## Final agent list
1. **Intake Agent**: reads labels, tags items, holds low-confidence items for a person. Skills: label-reading, material-tagging. Custom tools: get_batch, save_tags, hold_for_review.
2. **Disposition Agent**: daily run (schedule + manual trigger), date rules, routing, pickup booking (approval), alerts. Skills: disposition-rules, reverse-logistics. Custom tools: list_inventory, send_alert. MCP: recycler-directory.

Not agents: the MCP server, the thin app (tool endpoints, inventory, review/approval UI, event viewer, alert sender, cost guard).

## Contents
| Path | What |
|---|---|
| agents/*/AGENTS.md | Persona docs, ready to paste |
| agents/custom_tools.json | Custom tool schemas for both agents |
| agents/resources/ | Agent create templates, schedule with Outcome rubric, MCP spec |
| skills/*/SKILL.md, skills/dist/*.zip | Four skills and upload-ready ZIPs |
| data/ | Small text-only seed fixtures (32 intake items, 28 inventory rows, 4 fictional recyclers, expected results) |
| tools/sustain_ref.py | Reference rules (the ground truth for scoring) |
| tools/ingest_dataset.py | Convert your Kaggle/researched dataset to the test format |
| tools/score_intake.py, score_disposition.py | Score agent output |
| tools/selftest.py | Offline test, no network, no ZooWork |
| research_prompt_dataset.md | Prompt to find or build the large label dataset |

## Before the clock (free)
1. Run the dataset research prompt; download the best set; `python tools/ingest_dataset.py FILE.csv --out data_big --limit 200`.
2. `python tools/gen_data.py && python tools/selftest.py` (expects ALL PASS).
3. Confirm the demo defaults with the team: threshold 0.80, 60 days, pickup lead 7 days, 70% natural share for shred, donation excluded for swimwear/intimates/socks.
4. Deploy the recycler-directory MCP server (spec in agents/resources/recycler_mcp_spec.md) and the thin app.

## On the clock
1. Smoke test (30 min, about $3): one agent, three turns, read /usage, test a custom tool round trip, MCP approval, interrupt.
2. Upload the four skill ZIPs; create the two agents (serialize, idempotency key); attach skills; start; poll desired_state.
3. Run Intake on `data/intake_items.json`; score with `score_intake.py`. Tune skill wording, not code.
4. Run Disposition with today = 2026-11-07 against `data/inventory.json`; score with `score_disposition.py`.
5. Rehearse the demo end to end, then delete test agents and schedules.

## Known unknowns (verify at smoke test)
- Exact JSON key names in agent create and custom tool definitions (templates follow the docs but are unverified).
- Whether the `image` tool bills a separate model.
- Whether the MCP approval and custom-tool hold surface as `awaiting_approval` the way the docs describe.
- Dataset licence for anything you publish.
