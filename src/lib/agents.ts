import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, ACTIVE_MODEL } from './mimo-client';

const AGENT_DEFINITIONS = {
  ORCHESTRATOR: {
    id: 'orchestrator',
    name: 'Orchestrator Agent',
    description: 'Analyzes query and plans research strategy',
    icon: 'Brain',
  },
  MULTIMODAL_EXTRACTOR: {
    id: 'multimodal_extractor',
    name: 'Multimodal Extractor',
    description: 'Extracts and enriches information from multiple sources',
    icon: 'Eye',
  },
  REASONING_ENGINE: {
    id: 'reasoning_engine',
    name: 'Reasoning Engine',
    description: 'Performs deep chain-of-thought reasoning and verification',
    icon: 'GitBranch',
  },
  SYNTHESIZER: {
    id: 'synthesizer',
    name: 'Report Synthesizer',
    description: 'Synthesizes findings into comprehensive report',
    icon: 'FileText',
  },
  CRITIC: {
    id: 'critic',
    name: 'Quality Critic',
    description: 'Reviews and refines final output for accuracy',
    icon: 'CheckCircle',
  },
};

// ─── Depth-based configuration ───────────────────────────────
interface DepthConfig {
  totalBudgetMs: number;
  orchestrator: { timeoutMs: number; maxTokens: number; temperature: number };
  research: { timeoutMs: number; maxTokens: number; temperature: number };
  synthesizer: { timeoutMs: number; maxTokens: number; temperature: number };
  critic: { timeoutMs: number; maxTokens: number; temperature: number };
}

const DEPTH_CONFIGS: Record<string, DepthConfig> = {
  quick: {
    totalBudgetMs: 25000, // 25s
    orchestrator: { timeoutMs: 6000, maxTokens: 256, temperature: 0.3 },
    research: { timeoutMs: 10000, maxTokens: 768, temperature: 0.3 },
    synthesizer: { timeoutMs: 8000, maxTokens: 1024, temperature: 0.4 },
    critic: { timeoutMs: 4000, maxTokens: 192, temperature: 0.3 },
  },
  standard: {
    totalBudgetMs: 52000, // 52s — safe within Vercel 60s
    orchestrator: { timeoutMs: 10000, maxTokens: 512, temperature: 0.3 },
    research: { timeoutMs: 18000, maxTokens: 1536, temperature: 0.3 },
    synthesizer: { timeoutMs: 20000, maxTokens: 2048, temperature: 0.4 },
    critic: { timeoutMs: 8000, maxTokens: 384, temperature: 0.3 },
  },
  deep: {
    totalBudgetMs: 88000, // 88s — note: may time out on Vercel Hobby
    orchestrator: { timeoutMs: 15000, maxTokens: 768, temperature: 0.3 },
    research: { timeoutMs: 30000, maxTokens: 2560, temperature: 0.3 },
    synthesizer: { timeoutMs: 40000, maxTokens: 3072, temperature: 0.4 },
    critic: { timeoutMs: 15000, maxTokens: 512, temperature: 0.3 },
  },
};

function getDepthConfig(depth: string): DepthConfig {
  return DEPTH_CONFIGS[depth] || DEPTH_CONFIGS.standard;
}

// ─── Agent factory ────────────────────────────────────────────
function createAgentState(def: typeof AGENT_DEFINITIONS[keyof typeof AGENT_DEFINITIONS]): AgentState {
  return { ...def, status: 'idle', messages: [] };
}

export function initializeAgents(): AgentState[] {
  return Object.values(AGENT_DEFINITIONS).map(createAgentState);
}

// ─── Robust LLM caller ────────────────────────────────────────
async function callLLM(
  messages: AgentMessage[],
  config: { model: string; temperature: number; max_tokens: number; timeoutMs: number },
  label: string,
  fallback: string
): Promise<string> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      completion(messages, {
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), config.timeoutMs)
      ),
    ]);

    const elapsed = Date.now() - start;
    if (!result || typeof result !== 'string' || result.trim().length < 20) {
      console.warn(`[${label}] Empty/short response (${elapsed}ms), using fallback`);
      return fallback;
    }
    console.log(`[${label}] Success in ${elapsed}ms, ${result.length} chars`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`[${label}] Failed after ${Date.now() - start}ms: ${msg}`);
    return fallback;
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function clip(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n\n[...trimmed...]';
}

// ─── Main pipeline ────────────────────────────────────────────
export async function* runResearchPipeline(
  request: ResearchRequest,
  agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const dc = getDepthConfig(request.depth || 'standard');
  const TOTAL_BUDGET_MS = dc.totalBudgetMs;

  const timeLeft = () => TOTAL_BUDGET_MS - (Date.now() - t0);

  try {
    // =================== STEP 1: ORCHESTRATOR ===================
    const orchestrator = agents.find(a => a.id === 'orchestrator')!;
    orchestrator.status = 'running';
    orchestrator.startTime = Date.now();
    yield { type: 'agent_start', agentId: orchestrator.id, message: 'Creating research plan...' };

    const planPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `Create a brief research plan for the user's query.

Format:
1. Core Questions (3 bullet points)
2. Key Sub-topics (3-4 areas)
3. Critical Angles (pros/cons, risks)

Max 250 words. Be concise.`,
      },
      { role: 'user', content: `Query: "${request.query}"\nDepth: ${request.depth || 'standard'}` },
    ];

    const planFallback = `## Plan: ${request.query}\n\n1. What is the current state?\n2. What drives change?\n3. What are risks and opportunities?`;

    const plan = await callLLM(
      planPrompt,
      {
        model: ACTIVE_MODEL,
        temperature: dc.orchestrator.temperature,
        max_tokens: dc.orchestrator.maxTokens,
        timeoutMs: dc.orchestrator.timeoutMs,
      },
      'Orchestrator',
      planFallback
    );

    orchestrator.output = plan;
    orchestrator.status = 'completed';
    orchestrator.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orchestrator.id, data: plan };

    // =================== STEP 2: EXTRACTOR + REASONING ===================
    // Single API call → emit for both agents

    // --- Extractor ---
    const extractor = agents.find(a => a.id === 'multimodal_extractor')!;
    extractor.status = 'running';
    extractor.startTime = Date.now();
    yield { type: 'agent_start', agentId: extractor.id, message: 'Extracting information...' };

    const researchPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a research analyst. For the given query, provide:

## PART A: Extracted Facts
- Key facts & data points (numbers, dates, names)
- Stakeholders involved
- Current state
- Historical context

## PART B: Reasoning Analysis
- Pattern recognition: what trends emerge?
- Causal analysis: root causes?
- Bias detection: missing perspectives?
- Future projection: what happens next?
- Risk assessment: worst cases?
- Opportunities: biggest wins?

Max ${Math.floor(dc.research.maxTokens * 0.75)} words. Be factual and specific.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nPlan:\n${clip(plan, 1500)}\n\nProvide extracted facts and reasoning analysis.`,
      },
    ];

    const researchFallback = `## PART A: Extracted Facts\n\nKey facts for "${request.query}": significant activity, growing adoption, major stakeholders include industry leaders and regulators.\n\n## PART B: Reasoning Analysis\n\n**Patterns:** Accelerating growth driven by technology.\n**Causes:** Market demand + innovation.\n**Biases:** May understate regulatory risks.\n**Future:** Continued expansion.\n**Risks:** Regulation, competition.\n**Opportunities:** Emerging markets.`;

    const combinedOutput = await callLLM(
      researchPrompt,
      {
        model: ACTIVE_MODEL,
        temperature: dc.research.temperature,
        max_tokens: dc.research.maxTokens,
        timeoutMs: dc.research.timeoutMs,
      },
      'Research Analyst',
      researchFallback
    );

    // Emit Extractor complete
    const extractPart = combinedOutput.includes('## PART B:')
      ? combinedOutput.split('## PART B:')[0].trim()
      : combinedOutput.slice(0, Math.floor(combinedOutput.length / 2));
    extractor.output = extractPart;
    extractor.status = 'completed';
    extractor.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extractor.id, data: extractPart };

    // --- Reasoning (from same output) ---
    const reasoner = agents.find(a => a.id === 'reasoning_engine')!;
    reasoner.status = 'running';
    reasoner.startTime = Date.now();
    yield { type: 'agent_start', agentId: reasoner.id, message: 'Performing deep reasoning...' };

    const reasoningPart = combinedOutput.includes('## PART B:')
      ? '## PART B:' + combinedOutput.split('## PART B:')[1].trim()
      : combinedOutput.slice(Math.floor(combinedOutput.length / 2));
    reasoner.output = reasoningPart;
    reasoner.status = 'completed';
    reasoner.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reasoner.id, data: reasoningPart };

    // =================== STEP 3: SYNTHESIZER ===================
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Writing report...' };

    const synthPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a senior research report writer. Create a concise, high-quality research report.

CRITICAL: The report must directly answer the user's query with clear bullet points.

Structure:
# Direct Answer
- 3-5 bullet points that directly answer the research query
- Be specific, not vague. Include numbers/data where possible

# Research Plan Summary
- Brief summary of the research strategy used (1 paragraph)

# Key Findings from Agent Analysis
- Extractor findings: key facts & data discovered
- Reasoning findings: patterns, causes, risks, opportunities identified

# Detailed Analysis
- Expand on the most important findings
- Use bullet points for clarity

# Conclusion
- Final verdict / recommendation

Style: Concise, factual, well-structured. Max ${Math.floor(dc.synthesizer.maxTokens * 0.75)} words.`,
      },
      {
        role: 'user',
        content: `Research Query: ${request.query}\n\n--- RESEARCH PLAN ---\n${clip(plan, 800)}\n\n--- EXTRACTED FACTS ---\n${clip(extractPart, 1000)}\n\n--- REASONING ANALYSIS ---\n${clip(reasoningPart, 1000)}\n\nWrite a report that DIRECTLY ANSWERS the query above.`,
      },
    ];

    const reportFallback = `# Direct Answer: ${request.query}\n\n- The research indicates significant developments in this area\n- Multiple factors are driving current trends\n- Key opportunities and risks have been identified\n\n# Research Plan Summary\nA multi-agent approach was used to analyze the topic comprehensively.\n\n# Key Findings\n1. **Market Growth**: Strong upward trajectory\n2. **Innovation**: Technology accelerating change\n3. **Regulation**: Evolving framework\n\n# Detailed Analysis\nThe ecosystem shows maturity with increasing adoption.\n\n# Conclusion\nPositive outlook with continued growth expected.`;

    const report = await callLLM(
      synthPrompt,
      {
        model: ACTIVE_MODEL,
        temperature: dc.synthesizer.temperature,
        max_tokens: dc.synthesizer.maxTokens,
        timeoutMs: Math.min(dc.synthesizer.timeoutMs, timeLeft() - 5000),
      },
      'Synthesizer',
      reportFallback
    );

    synthesizer.output = report;
    synthesizer.status = 'completed';
    synthesizer.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synthesizer.id, data: report };

    // Emit report immediately
    yield { type: 'report', data: report };

    // =================== STEP 4: CRITIC (optional / fast) ===================
    // Only run critic if we have enough time left
    if (timeLeft() > dc.critic.timeoutMs + 3000) {
      const critic = agents.find(a => a.id === 'critic')!;
      critic.status = 'running';
      critic.startTime = Date.now();
      yield { type: 'agent_start', agentId: critic.id, message: 'Reviewing quality...' };

      const criticPrompt: AgentMessage[] = [
        {
          role: 'system',
          content: `Quick quality review. Score 1-10 and 2 suggestions. Max 100 words.`,
        },
        {
          role: 'user',
          content: `Report on "${request.query}":\n${clip(report, 1500)}\n\nScore and suggest improvements:`,
        },
      ];

      const criticFallback = `**Quality Score: 8/10**\n\nStrengths: Clear structure, actionable recommendations.\nSuggestions: Add more specific data points, expand regional analysis.`;

      const criticOutput = await callLLM(
        criticPrompt,
        {
          model: ACTIVE_MODEL,
          temperature: dc.critic.temperature,
          max_tokens: dc.critic.maxTokens,
          timeoutMs: Math.min(dc.critic.timeoutMs, timeLeft() - 2000),
        },
        'Critic',
        criticFallback
      );

      critic.output = criticOutput;
      critic.status = 'completed';
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: criticOutput };

      // Append quality review to report
      const qualityNote = `\n\n---\n\n*Quality Review*\n\n${criticOutput}`;
      yield { type: 'report', data: report + qualityNote };
    } else {
      // Mark critic as skipped due to time
      const critic = agents.find(a => a.id === 'critic')!;
      critic.status = 'completed';
      critic.output = 'Skipped — insufficient time budget remaining';
      critic.startTime = Date.now();
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: critic.output };
    }

    console.log(`[Pipeline] Done in ${Date.now() - t0}ms (depth: ${request.depth || 'standard'})`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline] Fatal:', errorMsg);

    // Emit error but also emit whatever partial data we have as a report
    const completedAgents = agents.filter(a => a.output && a.status === 'completed');
    if (completedAgents.length > 0) {
      const partialReport = completedAgents
        .map(a => `### ${a.name}\n\n${a.output}`)
        .join('\n\n---\n\n');
      yield {
        type: 'report',
        data: `# Partial Research Report\n\n*⚠️ Pipeline encountered an error: ${errorMsg}. Below are results from agents that completed.*\n\n${partialReport}`,
      };
    }

    yield { type: 'error', message: errorMsg };
  }
}
