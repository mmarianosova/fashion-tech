// ZooWork client boundary. The app only talks to ZooWork through this interface.
// FakeZoo is fully working (used by tests, preview, and ZOO_MODE=fake).
export interface ZooClient {
  createSession(agentId: string, message: string, idempotencyKey: string): Promise<{ sessionId: string }>;
  resolveCustomToolCall(sessionId: string, callId: string, result: unknown, isError?: boolean): Promise<void>;
  resolveApproval(approvalId: string, decision: 'allow-once' | 'deny', sessionId: string): Promise<void>;
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

export async function realZoo(apiKey: string | undefined, baseUrl: string | undefined,
  agentForSession: (sessionId: string) => Promise<string>) {
  if (!apiKey) throw new Error('ZOOWORK_API_KEY is required in real mode');
  const { createZooworkClient, customToolUse } = await import('@zoowork-ai/sdk');
  const client = createZooworkClient({ apiKey, baseUrl });
  const adapter: ZooClient = {
    createSession: async (agentId, message, idempotencyKey) => {
      if (!agentId) throw new Error('ZooWork agent ID is required in real mode');
      const session = await client.createSession(agentId, { initial_events: [{ type: 'user.message', content: message }] }, idempotencyKey);
      return { sessionId: session.session_id };
    },
    resolveCustomToolCall: async (sessionId, callId, result, isError = false) => {
      await client.resolveCustomToolCall(await agentForSession(sessionId), callId, {
        content: [{ type: 'text', text: JSON.stringify(result) }], isError,
      });
    },
    resolveApproval: async (approvalId, decision, sessionId) => {
      await client.resolveApproval(await agentForSession(sessionId), approvalId, { decision });
    },
    interrupt: async (sessionId) => {
      await client.postEvents(await agentForSession(sessionId), sessionId, [{ type: 'user.interrupt' }]);
    },
    getBalance: async () => Number((await client.getBalance()).available_amount),
    getSessionCosts: async () => {
      const usage = await client.getUsage({ range: '24h', groupBy: 'session' });
      return Object.fromEntries((usage.groups ?? []).map((row) => [String(row.session_id), Number(row.cost_usd ?? row.cost ?? 0)]));
    },
    listAllEvents: async (sessionId, cursor) => {
      const events = await client.listAllEvents(await agentForSession(sessionId), sessionId, { cursor });
      return events.map((event) => {
        const call = customToolUse(event);
        const envelope = { id: event.id ?? String(event.seq), type: event.eventType, payload: event.payload };
        if (call?.phase === 'requested') return { ...envelope, call_id: call.callId, name: call.name, input: call.input };
        if (event.eventType === 'agent.approval' && event.payload.phase === 'requested') {
          return { ...envelope, type: 'approval.requested', approval_id: event.payload.approvalId,
            tool: event.payload.toolName, input: event.payload.input };
        }
        return { ...envelope, status: event.payload.status };
      });
    },
  };
  return adapter;
}

export async function checkStart(zoo: ZooClient, floorUsd: number) {
  const bal = await zoo.getBalance();
  if (!Number.isFinite(bal)) throw new Error('ZooWork balance is unavailable');
  if (bal < floorUsd) throw new Error(`Balance $${bal.toFixed(2)} is below the floor of $${floorUsd}. Run refused.`);
  return bal;
}

export async function enforceRunLimit(zoo: ZooClient, sessionId: string, limitUsd: number) {
  const cost = (await zoo.getSessionCosts())[sessionId] ?? 0;
  if (cost > limitUsd) { await zoo.interrupt(sessionId); return { interrupted: true, cost }; }
  return { interrupted: false, cost };
}
