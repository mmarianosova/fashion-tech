// Review the local configuration with --plan. Use --apply with a key scoped to the hackathon project.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createZooworkClient, type AgentRecord, type AgentResource, type CustomToolDeclaration } from '@zoowork-ai/sdk';

const mode = process.argv[2] ?? '--plan';
if (!['--plan', '--apply'].includes(mode)) throw new Error('Use --plan or --apply.');

const config = JSON.parse(readFileSync(new URL('../../prework/agents/resources/intake.agent.json', import.meta.url), 'utf8'));
const { intake }: { intake: CustomToolDeclaration[] } = JSON.parse(
  readFileSync(new URL('../../prework/agents/custom_tools.json', import.meta.url), 'utf8'),
);
const persona = readFileSync(new URL('../../prework/agents/intake/AGENTS.md', import.meta.url), 'utf8');
const resource: AgentResource = {
  name: config.name,
  persona: { docs: [{ name: 'AGENTS.md', content: persona }] },
  include_global_skills: false,
  sandbox: { scope: 'session' },
  labels: config.labels,
  tool_policy: config.tool_policy,
  custom_tools: intake,
};

if (mode === '--plan') {
  console.log(JSON.stringify({
    name: resource.name, tools: intake.map((tool) => tool.name), sandbox: resource.sandbox?.scope,
    model: 'project default',
  }, null, 2));
} else {
  const apiKey = process.env.ZOOWORK_API_KEY?.trim();
  if (!apiKey || apiKey.includes('REPLACE')) throw new Error('Set ZOOWORK_API_KEY in .env.local before applying.');
  const client = createZooworkClient({ apiKey, baseUrl: process.env.ZOOWORK_BASE_URL });
  const existing: AgentRecord[] = [];
  for await (const agent of client.listAgents()) {
    if (agent.declared?.name === resource.name) existing.push(agent);
  }
  if (existing.length > 1) throw new Error('Multiple agents have the Intake name. Select an agent by ID in ZooWork.');
  let agent = existing[0];
  if (agent) {
    agent = await client.getAgent(agent.agent_id);
    const declared = agent.declared?.custom_tools ?? [];
    if (!isDeepStrictEqual(declared, intake)) {
      throw new Error(`Existing Intake agent ${agent.agent_id} has a different tool configuration. Review it before reusing it.`);
    }
  } else {
    agent = await client.createAgent({ resource }, 'sustain-intake-hackathon-v1');
  }
  if (agent.status?.desired_state !== 'running') await client.startAgent(agent.agent_id);
  await client.waitUntilRunning(agent.agent_id);
  console.log(`INTAKE_AGENT_ID=${agent.agent_id}`);
}
