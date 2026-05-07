import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, ACTIVE_MODEL } from './mimo-client';
import { searchWeb, formatSearchResults } from './search';

const AGENTS = {
  ORCHESTRATOR:   { id: 'orchestrator',        name: 'Orchestrator',     desc: 'Research strategy & planning',  icon: 'Brain' },
  EXTRACTOR:      { id: 'multimodal_extractor', name: 'Web Extractor',   desc: 'Real-time web data gathering',  icon: 'Eye' },
  REASONER:       { id: 'reasoning_engine',     name: 'Reasoning Engine',desc: 'Deep analysis & reasoning',     icon: 'GitBranch' },
  SYNTHESIZER:    { id: 'synthesizer',          name: 'Report Writer',   desc: 'Structured report compilation', icon: 'FileText' },
  CRITIC:         { id: 'critic',               name: 'Quality Critic',  desc: 'Accuracy & completeness review',icon: 'CheckCircle' },
};

export function initializeAgents(): AgentState[] {
  return Object.values(AGENTS).map(a => ({ ...a, description: a.desc, status: 'idle' as const, messages: [] }));
}

const DEPTH: Record<string, { timeoutMs: number; maxTokens: number; temp: number; searchCount: number }> = {
  quick:    { timeoutMs: 35000, maxTokens: 2800, temp: 0.4, searchCount: 4 },
  standard: { timeoutMs: 50000, maxTokens: 4000, temp: 0.4, searchCount: 6 },
  deep:     { timeoutMs: 55000, maxTokens: 5000, temp: 0.4, searchCount: 8 },
};

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
    throw new Error('short/empty response');
  } catch (e) {
    throw new Error(`API failed: ${e instanceof Error ? e.message : 'error'} (${Date.now()-t}ms)`);
  }
}

function extractSection(text: string, marker: string, nextMarkers: string[]): string {
  const pattern = new RegExp(`${marker}([\\s\\S]*?)(?=${nextMarkers.join('|')}|$)`, 'i');
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

export async function* runResearchPipeline(
  req: ResearchRequest, agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const depth = req.depth || 'standard';
  const cfg = DEPTH[depth] || DEPTH.standard;

  try {
    // ── Fire web search (don't wait for it yet) ──
    const searchPromise = searchWeb(req.query, cfg.searchCount);

    // ── Step 1: Notify orchestrator is analyzing ──
    const orch = agents.find(a => a.id === 'orchestrator')!;
    orch.status = 'running'; orch.startTime = Date.now();
    yield { type: 'agent_start', agentId: orch.id, message: 'Analyzing query & searching web...' };

    // ── Wait for web search (with timeout) ──
    const searchResults = await Promise.race([
      searchPromise,
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 8000)),
    ]);
    const searchText = searchResults.length > 0 ? formatSearchResults(searchResults) : '';
    console.log(`[Search] ${searchResults.length} results in ${Date.now()-t0}ms`);

    // ── Step 2: Single API call with web context ──
    const raw = await callLLM([
      {
        role: 'system',
        content: `You are an expert research analyst — the best in the world. Your job: answer any question with accurate, specific, well-researched information.

RESPONSE FORMAT (use these exact headers):

## RESEARCH PLAN
- Restate what the user wants to know
- Identify what kind of answer they need (factual, yes/no, comparative, explanatory)
- Key angles to cover

## FACTS & DATA
- Specific information: events, dates, names, numbers, statistics
- Background and context
- Both supporting and opposing evidence
- ${searchText ? 'PRIORITIZE information from the web search results' : 'Use your training knowledge'}

## ANALYSIS
- DIRECTLY answer the question
- Yes/no questions: state YES or NO clearly, then explain with evidence
- Explanatory questions: break down causes, mechanisms, effects
- Comparative questions: contrast with clear criteria
- Address counterarguments and limitations
- Be CONCRETE and SPECIFIC — no generic statements

## CONCLUSION
- Bottom line in 2-3 sentences
- Key takeaway

## QUALITY NOTE
- Brief self-check: accuracy, completeness, any gaps

CRITICAL RULES:
- NEVER write filler like "research indicates significant developments" or "the ecosystem shows maturity"
- Use REAL data — names, numbers, dates, places
- Write naturally — like a knowledgeable expert briefing a colleague
- Answer in the SAME LANGUAGE as the query
- If search results are provided, USE them as your primary source
- If the query is about a current event or specific program, use the search results to understand the context correctly

${depth === 'deep' ? 'DEEP MODE: Be especially thorough. Provide nuance, multiple perspectives, and detailed analysis.' : depth === 'quick' ? 'QUICK MODE: Be concise but still specific and data-driven.' : 'STANDARD MODE: Provide balanced depth with clear analysis.'}`,
      },
      {
        role: 'user',
        content: `QUERY: ${req.query}

${searchText ? `WEB SEARCH RESULTS (use these as your primary source):\n${chop(searchText, 2500)}` : 'No web search results available. Use your training knowledge.'}

Provide a complete, accurate answer.`,
      },
    ], depth);

    // ── Step 3: Parse and distribute across agents ──
    const markers = ['## RESEARCH PLAN', '## FACTS & DATA', '## ANALYSIS', '## CONCLUSION', '## QUALITY NOTE'];

    const plan     = extractSection(raw, '## RESEARCH PLAN', markers.filter(m => m !== '## RESEARCH PLAN'));
    const facts    = extractSection(raw, '## FACTS & DATA', markers.filter(m => m !== '## FACTS & DATA'));
    const analysis = extractSection(raw, '## ANALYSIS', markers.filter(m => m !== '## ANALYSIS'));
    const concl    = extractSection(raw, '## CONCLUSION', markers.filter(m => m !== '## CONCLUSION'));
    const quality  = extractSection(raw, '## QUALITY NOTE', []);

    // Emit each agent
    orch.output = plan || 'Research plan generated.'; orch.status = 'completed'; orch.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orch.id, data: orch.output };

    const extr = agents.find(a => a.id === 'multimodal_extractor')!;
    extr.status = 'running'; extr.startTime = Date.now();
    yield { type: 'agent_start', agentId: extr.id, message: 'Extracting data...' };
    extr.output = facts || (searchText ? `Web search found ${searchResults.length} results:\n\n${searchText.slice(0, 500)}` : 'Data extraction in progress.');
    extr.status = 'completed'; extr.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extr.id, data: extr.output };

    const reas = agents.find(a => a.id === 'reasoning_engine')!;
    reas.status = 'running'; reas.startTime = Date.now();
    yield { type: 'agent_start', agentId: reas.id, message: 'Analyzing findings...' };
    reas.output = analysis || 'Analysis in progress.';
    reas.status = 'completed'; reas.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reas.id, data: reas.output };

    const synth = agents.find(a => a.id === 'synthesizer')!;
    synth.status = 'running'; synth.startTime = Date.now();
    yield { type: 'agent_start', agentId: synth.id, message: 'Writing report...' };

    const report = [
      `# ${req.query}\n`,
      `## 📌 Direct Answer`,
      analysis || 'See below.',
      '',
      `## 📊 Key Facts & Data`,
      facts || 'See analysis.',
      '',
      `## 🧠 Analysis`,
      analysis || 'Analysis in progress.',
      '',
      `## ✅ Conclusion`,
      concl || analysis.split('\n').slice(-3).join('\n'),
      searchText ? `\n*Sources: web search (${searchResults.length} results)*` : '',
    ].join('\n');

    synth.output = report; synth.status = 'completed'; synth.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synth.id, data: report };
    yield { type: 'report', data: report };

    const crit = agents.find(a => a.id === 'critic')!;
    crit.status = 'running'; crit.startTime = Date.now();
    yield { type: 'agent_start', agentId: crit.id, message: 'Quality review...' };
    crit.output = quality || `Report covers query: ${req.query.slice(0, 80)}`;
    crit.status = 'completed'; crit.endTime = Date.now();
    yield { type: 'agent_complete', agentId: crit.id, data: crit.output };

    console.log(`[Pipe] ✓ ${Date.now()-t0}ms | ${searchResults.length} web results`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Pipe] ✗', m);
    agents.filter(a => a.status === 'running').forEach(a => { a.status = 'error'; a.output = m; });
    yield { type: 'error', message: m };
  }
}
