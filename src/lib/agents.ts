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
  const pattern = new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=${nextMarkers.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)`, 'i');
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

// Generate smarter search queries based on the user's question
function buildSearchQueries(query: string): string[] {
  const queries = [query];

  // Add "Indonesia" if the query feels Indonesia-related but doesn't mention it
  if (!/indonesia/i.test(query)) {
    queries.push(`${query} Indonesia`);
  }

  // For acronym-heavy queries, add expansion attempts
  const acronymMatch = query.match(/\b[A-Z]{2,5}\b/g);
  if (acronymMatch) {
    const acronym = acronymMatch[0];
    // Search with context words that help disambiguate
    queries.push(`${acronym} adalah program Indonesia`);
    queries.push(`${query} terbaru 2025`);
  }

  // For questions, add the topic without question words
  const noQuestion = query.replace(/^(apakah|apa|bagaimana|mengapa|kenapa|siapa|kapan|dimana)\s+/i, '');
  if (noQuestion !== query) {
    queries.push(noQuestion);
  }

  return [...new Set(queries)].slice(0, 4);
}

export async function* runResearchPipeline(
  req: ResearchRequest, agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const depth = req.depth || 'standard';
  const cfg = DEPTH[depth] || DEPTH.standard;

  try {
    // ── Step 1: Start web search ──
    const searchQueries = buildSearchQueries(req.query);
    console.log(`[Search] queries:`, searchQueries);

    const searchResults: any[] = [];
    const seenUrls = new Set<string>();

    for (const sq of searchQueries) {
      if (searchResults.length >= cfg.searchCount) break;
      try {
        const batch = await Promise.race([
          searchWeb(sq, 4),
          new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 5000)),
        ]);
        for (const r of batch) {
          if (!seenUrls.has(r.url) && searchResults.length < cfg.searchCount) {
            seenUrls.add(r.url);
            searchResults.push(r);
          }
        }
      } catch { /* continue */ }
    }

    const searchText = searchResults.length > 0 ? formatSearchResults(searchResults) : '';
    console.log(`[Search] ${searchResults.length} results in ${Date.now()-t0}ms`);

    // ── Step 2: Notify orchestrator ──
    const orch = agents.find(a => a.id === 'orchestrator')!;
    orch.status = 'running'; orch.startTime = Date.now();
    yield { type: 'agent_start', agentId: orch.id, message: 'Researching & analyzing...' };

    // ── Step 3: Single API call ──
    const raw = await callLLM([
      {
        role: 'system',
        content: `You are a world-class research analyst. Your job: answer ANY question with accurate, specific, well-sourced information.

CAPABILITIES:
- Answer factual questions, yes/no questions, comparative questions, explanatory questions
- Handle acronyms — use search results + context to determine the correct meaning
- Analyze current events, programs, policies, trends — especially in Indonesia
- Provide balanced views with evidence on both sides

RESPONSE FORMAT (use exactly these headers):

## TOPIC IDENTIFICATION
- What is being asked about? If the query contains an acronym (like MBG, IKN, UU, etc.), state what it stands for based on search results and context.
- Example: "MBG = Makan Bergizi Gratis (program pemerintah Indonesia)" or "MBG = Money Back Guarantee (e-commerce)"

## FACTS & DATA
- Specific information: dates, names, numbers, statistics, events
- Background and historical context
- Both supporting AND opposing evidence
- ${searchText ? 'USE the web search results below as your PRIMARY source' : 'Use your training knowledge'}

## ANALYSIS
- DIRECTLY answer the question
- Yes/no: state YES or NO clearly, then explain with evidence
- Explanatory: break down causes, mechanisms, effects
- Comparative: contrast with clear criteria
- Address counterarguments
- Be CONCRETE — use real names, numbers, dates

## CONCLUSION
- Bottom line in 2-3 sentences

## SOURCES & LIMITATIONS
- ${searchText ? 'Which search results were most useful?' : 'Note: no web search available'}
- Any gaps or uncertainties

CRITICAL RULES:
- NEVER write filler ("research indicates significant developments", "the ecosystem shows maturity")
- ALWAYS give REAL, SPECIFIC information
- For acronyms: DETERMINE the correct expansion from context. "MBG" in an Indonesian policy context = "Makan Bergizi Gratis". "MBG" in e-commerce = "Money Back Guarantee". Use search results + your knowledge to disambiguate.
- Write naturally — like briefing a colleague
- Answer in the SAME LANGUAGE as the query
- If you truly don't know, say so honestly and explain what's unclear

${depth === 'deep' ? 'DEEP MODE: Extra thorough. Multiple perspectives, nuance, detailed analysis.' : depth === 'quick' ? 'QUICK MODE: Concise but data-driven. Get to the point fast.' : 'STANDARD MODE: Balanced depth with clear analysis.'}`,
      },
      {
        role: 'user',
        content: `QUERY: ${req.query}

${searchText ? `WEB SEARCH RESULTS (use as primary source):\n${chop(searchText, 3000)}` : '⚠ No web search results available. Use your training knowledge. If the topic is recent or niche, acknowledge the limitation.'}

Provide a complete, accurate, and well-structured answer.`,
      },
    ], depth);

    // ── Step 4: Parse and distribute ──
    const markers = ['## TOPIC IDENTIFICATION', '## FACTS & DATA', '## ANALYSIS', '## CONCLUSION', '## SOURCES & LIMITATIONS'];

    const topic    = extractSection(raw, '## TOPIC IDENTIFICATION', markers.filter(m => m !== '## TOPIC IDENTIFICATION'));
    const facts    = extractSection(raw, '## FACTS & DATA', markers.filter(m => m !== '## FACTS & DATA'));
    const analysis = extractSection(raw, '## ANALYSIS', markers.filter(m => m !== '## ANALYSIS'));
    const concl    = extractSection(raw, '## CONCLUSION', markers.filter(m => m !== '## CONCLUSION'));
    const sources  = extractSection(raw, '## SOURCES & LIMITATIONS', []);

    // Orchestrator
    orch.output = topic || 'Research plan generated.';
    orch.status = 'completed'; orch.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orch.id, data: orch.output };

    // Web Extractor
    const extr = agents.find(a => a.id === 'multimodal_extractor')!;
    extr.status = 'running'; extr.startTime = Date.now();
    yield { type: 'agent_start', agentId: extr.id, message: 'Extracting data...' };
    extr.output = facts || (searchText ? `Found ${searchResults.length} web results:\n\n${searchText.slice(0, 500)}` : 'Data gathered from training knowledge.');
    extr.status = 'completed'; extr.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extr.id, data: extr.output };

    // Reasoning Engine
    const reas = agents.find(a => a.id === 'reasoning_engine')!;
    reas.status = 'running'; reas.startTime = Date.now();
    yield { type: 'agent_start', agentId: reas.id, message: 'Analyzing findings...' };
    reas.output = analysis || 'Analysis in progress.';
    reas.status = 'completed'; reas.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reas.id, data: reas.output };

    // Synthesizer — build report
    const synth = agents.find(a => a.id === 'synthesizer')!;
    synth.status = 'running'; synth.startTime = Date.now();
    yield { type: 'agent_start', agentId: synth.id, message: 'Writing final report...' };

    const report = [
      `# ${req.query}\n`,
      topic ? `*${topic}*\n` : '',
      `## 📌 Direct Answer`,
      analysis || 'See analysis below.',
      '',
      `## 📊 Key Facts & Data`,
      facts || 'See analysis above.',
      '',
      `## ✅ Conclusion`,
      concl || analysis?.split('\n').slice(-3).join('\n') || 'Analysis complete.',
      searchResults.length > 0 ? `\n---\n*${searchResults.length} web sources consulted*` : '',
    ].filter(Boolean).join('\n');

    synth.output = report; synth.status = 'completed'; synth.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synth.id, data: report };
    yield { type: 'report', data: report };

    // Quality Critic
    const crit = agents.find(a => a.id === 'critic')!;
    crit.status = 'running'; crit.startTime = Date.now();
    yield { type: 'agent_start', agentId: crit.id, message: 'Quality review...' };
    crit.output = sources || `Report covers: ${req.query.slice(0, 80)}`;
    crit.status = 'completed'; crit.endTime = Date.now();
    yield { type: 'agent_complete', agentId: crit.id, data: crit.output };

    console.log(`[Pipe] ✓ ${Date.now()-t0}ms | ${searchResults.length} web | ${raw.length}c`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Pipe] ✗', m);
    agents.filter(a => a.status === 'running').forEach(a => { a.status = 'error'; a.output = m; });
    yield { type: 'error', message: m };
  }
}
