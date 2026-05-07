import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, ACTIVE_MODEL } from './mimo-client';

// ─── Agent Definitions ────────────────────────────────────────
const AGENTS = {
  ORCHESTRATOR:   { id: 'orchestrator',        name: 'Orchestrator',    desc: 'Plans research strategy',       icon: 'Brain' },
  EXTRACTOR:      { id: 'multimodal_extractor', name: 'Data Extractor', desc: 'Gathers facts and evidence',     icon: 'Eye' },
  REASONER:       { id: 'reasoning_engine',     name: 'Reasoning Engine',desc: 'Deep analysis and evaluation',  icon: 'GitBranch' },
  SYNTHESIZER:    { id: 'synthesizer',          name: 'Report Writer',  desc: 'Structures final report',       icon: 'FileText' },
  CRITIC:         { id: 'critic',               name: 'Quality Critic', desc: 'Reviews and verifies findings', icon: 'CheckCircle' },
};

export function initializeAgents(): AgentState[] {
  return Object.values(AGENTS).map(a => ({ ...a, description: a.desc, status: 'idle' as const, messages: [] }));
}

// ─── Depth Config ─────────────────────────────────────────────
const DEPTH: Record<string, { timeoutMs: number; maxTokens: number; temp: number }> = {
  quick:    { timeoutMs: 35000, maxTokens: 2500, temp: 0.4 },
  standard: { timeoutMs: 50000, maxTokens: 3500, temp: 0.4 },
  deep:     { timeoutMs: 55000, maxTokens: 4500, temp: 0.4 },
};

// ─── Helpers ──────────────────────────────────────────────────
function chop(s: string, n: number) { return s && s.length > n ? s.slice(0, n) + '\n[...]' : s || ''; }

async function callLLM(msgs: AgentMessage[], depth: string): Promise<string> {
  const cfg = DEPTH[depth] || DEPTH.standard;
  const t = Date.now();
  try {
    const r = await Promise.race([
      completion(msgs, { model: ACTIVE_MODEL, temperature: cfg.temp, max_tokens: cfg.maxTokens }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), cfg.timeoutMs)),
    ]);
    if (r && r.trim().length >= 30) { console.log(`[LLM] ✓ ${Date.now()-t}ms ${r.length}c`); return r; }
    throw new Error('short');
  } catch (e) {
    throw new Error(`LLM failed after ${Date.now()-t}ms: ${e instanceof Error ? e.message : 'error'}`);
  }
}

function extractSection(text: string, marker: string, nextMarkers: string[]): string {
  const pattern = new RegExp(`${marker}([\\s\\S]*?)(?=${nextMarkers.join('|')}|$)`, 'i');
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

// ─── Pipeline — SINGLE API CALL ───────────────────────────────
export async function* runResearchPipeline(
  req: ResearchRequest, agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const depth = req.depth || 'standard';

  try {
    // ═══════════ ALL-IN-ONE ANALYSIS ═══════════
    // One API call produces everything. Output split across 5 agents.

    const orch = agents.find(a => a.id === 'orchestrator')!;
    orch.status = 'running'; orch.startTime = Date.now();
    yield { type: 'agent_start', agentId: orch.id, message: 'Processing query...' };

    const raw = await callLLM([
      {
        role: 'system',
        content: `You are an expert research analyst and report writer. Your task is to answer the user's query with a complete, thorough, and well-structured response.

FORMAT YOUR RESPONSE WITH THESE EXACT HEADERS:

## RESEARCH PLAN
What the user wants to know, key angles to cover, evidence needed.

## FACTS & DATA
Specific information: events, dates, names, numbers, statistics, background, context. Include both supporting and opposing evidence.

## ANALYSIS
Directly answer the question. If yes/no: say YES or NO clearly, then explain why. If explanatory: break down causes, mechanisms, effects. If comparative: contrast options. Address counterarguments. Be concrete and specific.

## CONCLUSION
Final assessment, bottom line, or recommendation. 1-3 sentences.

## QUALITY NOTE
Self-check: what did you cover well? Any gaps or limitations?

RULES:
- NEVER write "research indicates significant developments" or similar filler. Give REAL information.
- Use specific data whenever available (numbers, names, dates, places)
- Answer in a natural, direct style — like a briefing from a knowledgeable expert
- If you know the answer, give it. If you're uncertain, explain what's known and what's unclear
- The query may be about Indonesia, current events, policy, technology, or anything else. Handle it.
- Write in the same language as the query

${depth === 'deep' ? 'This is DEEP research mode. Provide extra detail, nuance, and depth.' : depth === 'quick' ? 'This is QUICK mode. Be concise but still specific.' : 'This is STANDARD mode. Provide balanced depth.'}`,
      },
      { role: 'user', content: req.query },
    ], depth);

    // Parse sections
    const allMarkers = ['## RESEARCH PLAN', '## FACTS & DATA', '## ANALYSIS', '## CONCLUSION', '## QUALITY NOTE'];
    const plan    = extractSection(raw, '## RESEARCH PLAN', allMarkers.filter(m => m !== '## RESEARCH PLAN'));
    const facts   = extractSection(raw, '## FACTS & DATA', allMarkers.filter(m => m !== '## FACTS & DATA'));
    const analysis= extractSection(raw, '## ANALYSIS', allMarkers.filter(m => m !== '## ANALYSIS'));
    const concl   = extractSection(raw, '## CONCLUSION', allMarkers.filter(m => m !== '## CONCLUSION'));
    const quality = extractSection(raw, '## QUALITY NOTE', []);

    // Emit to agents
    orch.output = plan; orch.status = 'completed'; orch.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orch.id, data: plan };

    const extr = agents.find(a => a.id === 'multimodal_extractor')!;
    extr.status = 'running'; extr.startTime = Date.now();
    yield { type: 'agent_start', agentId: extr.id, message: 'Extracting data...' };
    extr.output = facts; extr.status = 'completed'; extr.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extr.id, data: facts };

    const reas = agents.find(a => a.id === 'reasoning_engine')!;
    reas.status = 'running'; reas.startTime = Date.now();
    yield { type: 'agent_start', agentId: reas.id, message: 'Analyzing...' };
    reas.output = analysis; reas.status = 'completed'; reas.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reas.id, data: analysis };

    const synth = agents.find(a => a.id === 'synthesizer')!;
    synth.status = 'running'; synth.startTime = Date.now();
    yield { type: 'agent_start', agentId: synth.id, message: 'Structuring report...' };

    // Build the final report from all sections
    const report = [
      `# ${req.query}`,
      '',
      '## Direct Answer',
      analysis || 'Analysis in progress.',
      '',
      '## Key Facts & Data',
      facts || 'See analysis above.',
      '',
      '## Conclusion',
      concl || analysis.split('\n').slice(-3).join('\n'),
      '',
    ].join('\n');

    synth.output = report; synth.status = 'completed'; synth.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synth.id, data: report };

    // Emit report
    if (quality) {
      yield { type: 'report', data: report + `\n\n---\n*Quality check: ${quality.slice(0, 200)}*` };
    } else {
      yield { type: 'report', data: report };
    }

    // Critic
    const crit = agents.find(a => a.id === 'critic')!;
    crit.status = 'running'; crit.startTime = Date.now();
    yield { type: 'agent_start', agentId: crit.id, message: 'Reviewing...' };
    crit.output = quality || 'Report generated successfully.';
    crit.status = 'completed'; crit.endTime = Date.now();
    yield { type: 'agent_complete', agentId: crit.id, data: crit.output };

    console.log(`[Pipe] ✓ ${Date.now()-t0}ms`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Pipe] ✗', m);

    // Mark running agents as error
    agents.filter(a => a.status === 'running').forEach(a => { a.status = 'error'; a.output = m; });

    yield { type: 'error', message: m };
  }
}
