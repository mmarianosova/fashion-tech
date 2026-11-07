# recycler-directory MCP server (spec; code not written yet)

Public, unauthenticated, HTTPS, no redirects, streamable-http transport. Serves FICTIONAL data from `data/recyclers.json`. No private data on it.

## Tools
`search_recyclers`
- input: `{"route": "donate|recycle_shred|recycle_denim|recycle_mixed"}`
- output: `{"recyclers":[{"id","name","accepts":[...],"min_items","address","contact","notes"}]}`; empty list when none.

`book_pickup` (agent config sets `always_ask`, a person approves in our UI)
- input: `{"partner_id","route","items":[...],"lots":{"whites":[...]} | null,"deadline":"YYYY-MM-DD"}`
- output: `{"booking_id","status":"confirmed","partner_id","deadline"}`; error `{"error":"below_minimum"}` if items < min_items (defence in depth).

## Host
Any free HTTPS host (Vercel, Cloudflare, Render). Pick a host that does not redirect. Deploy before the clock; costs nothing on ZooWork.

## Test
Point the Disposition Agent at it during the smoke test; confirm the tool names appear as `mcp__recyclerdirectory__*` and that the `book_pickup` approval blocks the run until resolved.
