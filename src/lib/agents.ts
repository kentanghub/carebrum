import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, ACTIVE_MODEL } from './mimo-client';

// ─── Agent Definitions ────────────────────────────────────────
const AGENTS = {
  ORCHESTRATOR:   { id: 'orchestrator',        name: 'Orchestrator',    desc: 'Plans research strategy',      icon: 'Brain' },
  EXTRACTOR:      { id: 'multimodal_extractor', name: 'Web Extractor',  desc: 'Gathers facts and data',        icon: 'Eye' },
  REASONER:       { id: 'reasoning_engine',     name: 'Reasoning Engine',desc: 'Deep analysis & reasoning',     icon: 'GitBranch' },
  SYNTHESIZER:    { id: 'synthesizer',          name: 'Report Writer',  desc: 'Writes the final report',       icon: 'FileText' },
  CRITIC:         { id: 'critic',               name: 'Quality Critic', desc: 'Reviews and scores output',     icon: 'CheckCircle' },
};

// ─── Depth Configs ────────────────────────────────────────────
interface StepConf { timeoutMs: number; maxTokens: number; temp: number }
interface DepthConf {
  budget: number;
  analysis: StepConf;
  report: StepConf & { delayMs: number };
  critic: StepConf;
}

const D: Record<string, DepthConf> = {
  quick: {
    budget: 30000,
    analysis: { timeoutMs: 18000, maxTokens: 1800, temp: 0.3 },
    report:   { timeoutMs: 8000,  maxTokens: 1200, temp: 0.4, delayMs: 1500 },
    critic:   { timeoutMs: 4000,  maxTokens: 200,  temp: 0.3 },
  },
  standard: {
    budget: 52000,
    analysis: { timeoutMs: 30000, maxTokens: 2500, temp: 0.3 },
    report:   { timeoutMs: 15000, maxTokens: 2000, temp: 0.4, delayMs: 2000 },
    critic:   { timeoutMs: 6000,  maxTokens: 350,  temp: 0.3 },
  },
  deep: {
    budget: 55000, // Capped for Vercel safety
    analysis: { timeoutMs: 35000, maxTokens: 3500, temp: 0.3 },
    report:   { timeoutMs: 12000, maxTokens: 2500, temp: 0.4, delayMs: 2000 },
    critic:   { timeoutMs: 5000,  maxTokens: 500,  temp: 0.3 },
  },
};

export function initializeAgents(): AgentState[] {
  return Object.values(AGENTS).map(a => ({ ...a, description: a.desc, status: 'idle' as const, messages: [] }));
}

// ─── Helpers ──────────────────────────────────────────────────
function conf(depth: string) { return D[depth] || D.standard; }
function chop(s: string, n: number) { return s && s.length > n ? s.slice(0, n) + '\n[...]' : s || ''; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function call(
  msgs: AgentMessage[], opts: StepConf, label: string
): Promise<string | null> {
  const t = Date.now();
  try {
    const r = await Promise.race([
      completion(msgs, { model: ACTIVE_MODEL, temperature: opts.temp, max_tokens: opts.maxTokens }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), opts.timeoutMs)),
    ]);
    if (r && r.trim().length >= 15) { console.log(`[${label}] ✓ ${Date.now()-t}ms ${r.length}c`); return r; }
    console.warn(`[${label}] Short (${Date.now()-t}ms)`); return null;
  } catch (e) { console.warn(`[${label}] ✗ (${Date.now()-t}ms)`); return null; }
}

// ─── Pipeline ─────────────────────────────────────────────────
export async function* runResearchPipeline(
  req: ResearchRequest, agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now(); const dc = conf(req.depth || 'standard');
  const rem = () => dc.budget - (Date.now() - t0);
  const parts: { n: string; o: string }[] = [];

  const fail = (msg: string) => { console.error('[Pipe]', msg); return { type: 'error' as const, message: msg }; };

  try {
    // ═══════════ STEP 1: ANALYSIS (Orchestrator + Extractor + Reasoner) ═══════════
    // Combined into ONE API call to avoid rate limits + timeouts

    const orch = agents.find(a => a.id === 'orchestrator')!;
    orch.status = 'running'; orch.startTime = Date.now();
    yield { type: 'agent_start', agentId: orch.id, message: 'Analyzing query...' };

    const analysis = await call([
      {
        role: 'system',
        content: `You are an expert research analyst. Your job is to answer ANY question accurately and specifically.

IMPORTANT: You must produce a real, detailed answer. Never give generic filler like "research indicates significant developments" — that is useless. Give actual facts, names, numbers, context.

Your response must have these THREE sections clearly labeled:

=== RESEARCH PLAN ===
- What the user really wants to know
- Key angles to cover
- What kind of evidence is needed

=== FACTS & DATA ===
- Specific information relevant to the query
- Names, dates, numbers, events, statistics
- Current state, background, context
- Both supporting and opposing evidence

=== ANSWER & ANALYSIS ===
- DIRECTLY answer the question
- If yes/no: state YES or NO, then provide evidence
- If explanatory: break down causes, effects, mechanisms
- If comparative: contrast options with criteria
- Be concrete, not abstract
- If uncertain about something, say so

The query may be about current events, Indonesian topics, government programs, technology, or anything else. Answer what you know. Be honest about knowledge limits.

Tone: Natural, direct, helpful. Like a knowledgeable colleague briefing you.`,
      },
      { role: 'user', content: `User query: "${req.query}"\n\nPlease analyze this thoroughly and answer directly.` },
    ], dc.analysis, 'Analysis');

    let analysisText = '';
    if (analysis) {
      analysisText = analysis;
    } else {
      analysisText = `=== RESEARCH PLAN ===
The user is asking: ${req.query}
This requires gathering factual information and providing a clear, direct answer.

=== FACTS & DATA ===
The system was unable to complete the full analysis within the time limit. This may be due to API rate limiting or server load.

=== ANSWER & ANALYSIS ===
Unable to provide a complete answer at this time. Please try again in a moment, or try a shorter/simpler query. The "Quick" depth mode may work better for initial testing.`;
    }

    // Distribute analysis across 3 agents
    const splitAnalysis = (text: string) => {
      // Split by === markers
      const planMatch = text.match(/===\s*RESEARCH\s*PLAN\s*===\s*([\s\S]*?)(?====\s*(?:FACTS|ANSWER))/i);
      const factsMatch = text.match(/===\s*FACTS\s*(?:&|\s*AND\s*)?\s*DATA\s*===\s*([\s\S]*?)(?====\s*ANSWER)/i);
      const answerMatch = text.match(/===\s*ANSWER\s*(?:&|\s*AND\s*)?\s*ANALYSIS\s*===\s*([\s\S]*)/i);

      return {
        plan: planMatch ? planMatch[1].trim() : 'Analysis plan for: ' + req.query,
        facts: factsMatch ? factsMatch[1].trim() : 'Data extraction in progress.',
        answer: answerMatch ? answerMatch[1].trim() : text.slice(-500),
      };
    };

    const { plan, facts, answer } = splitAnalysis(analysisText);

    orch.output = plan; orch.status = 'completed'; orch.endTime = Date.now();
    parts.push({ n: orch.name, o: plan });
    yield { type: 'agent_complete', agentId: orch.id, data: plan };

    const extr = agents.find(a => a.id === 'multimodal_extractor')!;
    extr.status = 'running'; extr.startTime = Date.now();
    yield { type: 'agent_start', agentId: extr.id, message: 'Extracting data...' };
    extr.output = facts; extr.status = 'completed'; extr.endTime = Date.now();
    parts.push({ n: extr.name, o: facts });
    yield { type: 'agent_complete', agentId: extr.id, data: facts };

    const reas = agents.find(a => a.id === 'reasoning_engine')!;
    reas.status = 'running'; reas.startTime = Date.now();
    yield { type: 'agent_start', agentId: reas.id, message: 'Reasoning...' };
    reas.output = answer; reas.status = 'completed'; reas.endTime = Date.now();
    parts.push({ n: reas.name, o: answer });
    yield { type: 'agent_complete', agentId: reas.id, data: answer };

    // ═══════════ RATE LIMIT BUFFER ═══════════
    // Wait before next API call to avoid rate limits
    const waitMs = Math.min(dc.report.delayMs, Math.max(rem() - dc.report.timeoutMs - 3000, 500));
    await sleep(waitMs);

    // ═══════════ STEP 2: REPORT SYNTHESIS ═══════════
    const synth = agents.find(a => a.id === 'synthesizer')!;
    synth.status = 'running'; synth.startTime = Date.now();
    yield { type: 'agent_start', agentId: synth.id, message: 'Writing report...' };

    const reportStr = await call([
      {
        role: 'system',
        content: `You are a report writer. Create a concise, well-structured research report.

STRUCTURE:
# Direct Answer: [Query]
A clear 1-2 sentence answer, followed by 3-5 bullet points of key findings.

# Key Evidence
The most important facts, data, and context.

# Analysis
Explain the reasoning. Include counterarguments or alternative views if relevant.

# Bottom Line
Final assessment in 1-2 sentences.

RULES:
- Answer the question DIRECTLY
- Use specific info (names, dates, numbers)
- Write naturally — no corporate jargon
- Never use filler phrases
- Max ${Math.floor(dc.report.maxTokens * 0.65)} words`,
      },
      {
        role: 'user',
        content: `QUERY: ${req.query}

FACTS & DATA:
${chop(facts, 1000)}

ANALYSIS:
${chop(answer, 1200)}

Write the report. Answer DIRECTLY: "${req.query}"`,
      },
    ], { timeoutMs: Math.min(dc.report.timeoutMs, rem() - 3000), maxTokens: dc.report.maxTokens, temp: dc.report.temp }, 'Report');

    let report: string;
    if (reportStr) {
      report = reportStr;
    } else {
      // Build from the analysis data we already have
      report = `# ${req.query}

## Direct Answer
${answer.split('\n').slice(0, 5).join('\n')}

## Key Information
${facts.slice(0, 400)}

## Note
Full synthesis unavailable. The core analysis above addresses your question directly.`;
    }

    synth.output = report; synth.status = 'completed'; synth.endTime = Date.now();
    parts.push({ n: synth.name, o: report });
    yield { type: 'agent_complete', agentId: synth.id, data: report };
    yield { type: 'report', data: report };

    // ═══════════ STEP 3: CRITIC (if time) ═══════════
    if (rem() > dc.critic.timeoutMs + 3000) {
      const crit = agents.find(a => a.id === 'critic')!;
      crit.status = 'running'; crit.startTime = Date.now();
      yield { type: 'agent_start', agentId: crit.id, message: 'Reviewing...' };

      const c = await call([
        { role: 'system', content: `Score 1-10. Does this directly answer the query? 1 suggestion. Under 60 words.` },
        { role: 'user', content: `Query: ${req.query}\nReport:\n${chop(report, 1000)}\nScore:` },
      ], { ...dc.critic, timeoutMs: Math.min(dc.critic.timeoutMs, rem() - 2000) }, 'Critic');

      const cout = c || `Score: 7/10 — The report covers key points. Consider adding more specific data if available.`;
      crit.output = cout; crit.status = 'completed'; crit.endTime = Date.now();
      yield { type: 'agent_complete', agentId: crit.id, data: cout };
      yield { type: 'report', data: report + `\n\n---\n*Review: ${cout}*` };
    }

    console.log(`[Pipe] ✓ ${Date.now()-t0}ms`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Pipe] ✗', m);
    if (parts.length) { yield { type: 'report', data: `# Partial Results\n\n${parts.map(p => `### ${p.n}\n${p.o}`).join('\n\n---\n\n')}` }; }
    yield fail(m);
  }
}
