// ZooWork client boundary. The app only talks to ZooWork through this interface.
// FakeZoo is fully working (used by tests, preview, and ZOO_MODE=fake).
// RealZoo is a THIN ADAPTER over @zoowork-ai/sdk: method names are taken from the docs
// (create_session, resolve_custom_tool_call, resolve_approval, ...) and MUST be verified
// against node_modules/@zoowork-ai/sdk types at the smoke test. Nothing else in the app changes.

export interface ZooClient {
  createSession(agentId: string, message: string, idempotencyKey: string): Promise<{ sessionId: string }>;
  resolveCustomToolCall(sessionId: string, callId: string, result: unknown, isError?: boolean): Promise<void>;
  resolveApproval(approvalId: string, decision: 'allow-once' | 'deny'): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  getBalance(): Promise<number>;
  getSessionCosts(): Promise<Record<string, number>>;
  listAllEvents(sessionId: string, cursor?: string): Promise<any[]>;
}

export class FakeZoo implements ZooClient {
  resolved: { sessionId: string; callId: string; result: unknown; isError: boolean }[] = [];
  approvals: { approvalId: string; decision: string }[] = [];
  interrupts: string[] = [];
  balance = 100;
  failResolveOnce = false;
  private n = 0;
  async createSession() { return { sessionId: `ses_fake_${++this.n}` }; }
  async resolveCustomToolCall(sessionId: string, callId: string, result: unknown, isError = false) {
    if (this.failResolveOnce) { this.failResolveOnce = false; throw new Error('network'); }
    this.resolved.push({ sessionId, callId, result, isError });
  }
  async resolveApproval(approvalId: string, decision: 'allow-once' | 'deny') { this.approvals.push({ approvalId, decision }); }
  async interrupt(sessionId: string) { this.interrupts.push(sessionId); }
  async getBalance() { return this.balance; }
  async getSessionCosts() { return {}; }
  async listAllEvents() { return []; }
}

export async function realZoo(apiKey: string, baseUrl?: string): Promise<ZooClient> {
  const sdk: any = await import('@zoowork-ai/sdk'); // VERIFY export names
  const client: any = new (sdk.ZooWork ?? sdk.default ?? sdk.ZooWorkClient)({ apiKey, baseUrl }); // VERIFY constructor
  return {
    // VERIFY every call below against SDK types
    createSession: async (agentId, message, idempotencyKey) => {
      const s = await client.createSession(agentId, { initial_events: [{ type: 'user.message', content: message, idempotency_key: idempotencyKey }] });
      return { sessionId: s.session_id ?? s.sessionId };
    },
    resolveCustomToolCall: async (sessionId, callId, result, isError = false) => {
      await client.resolveCustomToolCall(sessionId, callId, { result: JSON.stringify(result), is_error: isError });
    },
    resolveApproval: async (approvalId, decision) => { await client.resolveApproval(approvalId, { decision }); },
    interrupt: async (sessionId) => { await client.sendEvent(sessionId, { type: 'user.interrupt' }); },
    getBalance: async () => parseFloat((await client.getBalance()).balance ?? (await client.getBalance())),
    getSessionCosts: async () => {
      const u = await client.getUsage({ range: '24h', group_by: 'session' });
      return Object.fromEntries((u.items ?? u.data ?? []).map((x: any) => [x.session_id, Number(x.cost_usd ?? x.cost ?? 0)]));
    },
    listAllEvents: async (sessionId, cursor) => client.listAllEvents(sessionId, { cursor }),
  };
}

export async function checkStart(zoo: ZooClient, floorUsd: number) {
  const bal = await zoo.getBalance();
  if (bal < floorUsd) throw new Error(`Balance $${bal.toFixed(2)} is below the floor of $${floorUsd}. Run refused.`);
  return bal;
}

export async function enforceRunLimit(zoo: ZooClient, sessionId: string, limitUsd: number) {
  const cost = (await zoo.getSessionCosts())[sessionId] ?? 0;
  if (cost > limitUsd) { await zoo.interrupt(sessionId); return { interrupted: true, cost }; }
  return { interrupted: false, cost };
}
