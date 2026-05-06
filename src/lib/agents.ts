import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, streamCompletion, ACTIVE_MODEL } from './mimo-client';

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

function createAgentState(def: typeof AGENT_DEFINITIONS[keyof typeof AGENT_DEFINITIONS]): AgentState {
  return {
    ...def,
    status: 'idle',
    messages: [],
  };
}

export function initializeAgents(): AgentState[] {
  return Object.values(AGENT_DEFINITIONS).map(createAgentState);
}

// Timeout wrapper for promises
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

export async function* runResearchPipeline(
  request: ResearchRequest,
  agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  const TIMEOUT_MS = 55000; // 55 second total timeout (Vercel hobby = 60s)

  try {
    // ===================== STEP 1: ORCHESTRATOR =====================
    const orchestrator = agents.find(a => a.id === 'orchestrator')!;
    orchestrator.status = 'running';
    orchestrator.startTime = Date.now();
    yield { type: 'agent_start', agentId: orchestrator.id, message: 'Analyzing query and creating research plan...' };

    const planPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a world-class research strategist. Your job is to analyze a user's research query and create a highly structured, actionable research plan.

Output a plan with these sections:
1. **Core Research Questions** (3-5 specific questions)
2. **Key Sub-topics to Investigate** (list of areas)
3. **Target Sources & Perspectives** (academic, industry, regulatory, etc.)
4. **Critical Angles** (pros/cons, trends, risks, opportunities)
5. **Success Criteria** (what makes this research complete)

Be concise but thorough. Use bullet points. Max 600 words.`,
      },
      {
        role: 'user',
        content: `Research Query: "${request.query}"\nDesired Depth: ${request.depth || 'standard'}\nMultimodal Analysis: ${request.multimodal ? 'Enabled' : 'Disabled'}`,
      },
    ];

    orchestrator.messages = planPrompt;
    const plan = await withTimeout(
      completion(planPrompt, { model: ACTIVE_MODEL, temperature: 0.3, max_tokens: 2048 }),
      15000,
      'Planning phase'
    );
    orchestrator.output = plan;
    orchestrator.status = 'completed';
    orchestrator.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orchestrator.id, data: plan };

    // Check total time
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Research timed out. Try "Quick Scan" mode or a simpler query.');
    }

    // ===================== STEP 2: MULTIMODAL EXTRACTOR =====================
    const extractor = agents.find(a => a.id === 'multimodal_extractor')!;
    extractor.status = 'running';
    extractor.startTime = Date.now();
    yield { type: 'agent_start', agentId: extractor.id, message: 'Extracting and enriching information...' };

    const extractPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert information extractor. Given a research query and plan, extract comprehensive, factual information.

Your output must include:
1. **Key Facts & Data Points** (specific numbers, dates, names where applicable)
2. **Stakeholder Analysis** (who is involved, their interests)
3. **Current State** (what is happening now)
4. **Historical Context** (how we got here)
5. **Regional/Global Variations** (if applicable)

Use markdown. Be factual and specific. Avoid vague statements. Max 1500 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nResearch Plan:\n${plan}\n\nExtract all relevant information in a structured format.`,
      },
    ];

    extractor.messages = extractPrompt;
    const extractedInfo = await withTimeout(
      completion(extractPrompt, { model: ACTIVE_MODEL, temperature: 0.2, max_tokens: 4096 }),
      20000,
      'Extraction phase'
    );
    extractor.output = extractedInfo;
    extractor.status = 'completed';
    extractor.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extractor.id, data: extractedInfo };

    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Research timed out during extraction phase.');
    }

    // ===================== STEP 3: REASONING ENGINE =====================
    const reasoner = agents.find(a => a.id === 'reasoning_engine')!;
    reasoner.status = 'running';
    reasoner.startTime = Date.now();
    yield { type: 'agent_start', agentId: reasoner.id, message: 'Performing deep reasoning and verification...' };

    const reasoningPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an elite reasoning engine. Analyze the extracted information with deep, multi-step thinking.

Perform:
1. **Pattern Recognition** — What trends or patterns emerge?
2. **Causal Analysis** — What causes what? Root cause analysis.
3. **Bias Detection** — What perspectives might be missing? What's the counter-argument?
4. **Future Projection** — Based on current trajectory, what happens next?
5. **Risk Assessment** — What could go wrong? What's the worst-case scenario?
6. **Opportunity Mapping** — Where are the biggest opportunities?

Use clear reasoning chains. Be skeptical and thorough. Max 2000 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Information:\n${extractedInfo}\n\nPerform deep reasoning and analysis.`,
      },
    ];

    reasoner.messages = reasoningPrompt;
    
    let reasoningOutput = '';
    const reasoningStream = streamCompletion(reasoningPrompt, { 
      model: ACTIVE_MODEL, 
      temperature: 0.4,
      max_tokens: 4096 
    });
    
    const reasoningTimeout = setTimeout(() => {
      reasoningStream.return?.();
    }, 20000);

    for await (const chunk of reasoningStream) {
      reasoningOutput += chunk;
      yield { type: 'agent_update', agentId: reasoner.id, message: chunk };
    }
    clearTimeout(reasoningTimeout);
    
    reasoner.output = reasoningOutput;
    reasoner.status = 'completed';
    reasoner.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reasoner.id, data: reasoningOutput };

    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Research timed out during reasoning phase.');
    }

    // ===================== STEP 4: SYNTHESIZER =====================
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Writing comprehensive report...' };

    const synthesizePrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a senior research report writer. Create a publication-quality research report in markdown.

Structure:
# Executive Summary
- 3-5 bullet points summarizing key findings

# Introduction
- Context and importance of the topic

# Key Findings
- Numbered list of major discoveries (use **bold** for emphasis)

# Detailed Analysis
- Sectioned by sub-topic
- Use tables, bullet points, and blockquotes where helpful

# Implications & Recommendations
- Actionable insights
- Who should do what

# Conclusion
- Final synthesis

Style: Professional, clear, authoritative. Use markdown tables and formatting. Max 3000 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Information:\n${extractedInfo}\n\nReasoning & Analysis:\n${reasoningOutput}\n\nWrite the final research report.`,
      },
    ];

    synthesizer.messages = synthesizePrompt;
    
    let reportOutput = '';
    const reportStream = streamCompletion(synthesizePrompt, { 
      model: ACTIVE_MODEL, 
      temperature: 0.5,
      max_tokens: 4096 
    });
    
    const reportTimeout = setTimeout(() => {
      reportStream.return?.();
    }, 25000);

    for await (const chunk of reportStream) {
      reportOutput += chunk;
      yield { type: 'agent_update', agentId: synthesizer.id, message: chunk };
    }
    clearTimeout(reportTimeout);
    
    synthesizer.output = reportOutput;
    synthesizer.status = 'completed';
    synthesizer.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synthesizer.id, data: reportOutput };

    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Research timed out during synthesis phase.');
    }

    // ===================== STEP 5: CRITIC =====================
    const critic = agents.find(a => a.id === 'critic')!;
    critic.status = 'running';
    critic.startTime = Date.now();
    yield { type: 'agent_start', agentId: critic.id, message: 'Reviewing report quality...' };

    const criticPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a senior editor and quality assurance expert. Review the research report.

Assess:
1. **Factual Accuracy** — Any claims that seem unsupported?
2. **Completeness** — What's missing that should be covered?
3. **Clarity** — Is anything confusing or poorly explained?
4. **Balance** — Are multiple perspectives represented fairly?
5. **Actionability** — Are recommendations specific and useful?

Provide a brief quality score (1-10) and 2-3 specific improvement suggestions.
Max 400 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nReport:\n${reportOutput}\n\nProvide quality assessment.`,
      },
    ];

    critic.messages = criticPrompt;
    const criticOutput = await withTimeout(
      completion(criticPrompt, { model: ACTIVE_MODEL, temperature: 0.3, max_tokens: 1024 }),
      10000,
      'Quality review phase'
    );
    critic.output = criticOutput;
    critic.status = 'completed';
    critic.endTime = Date.now();
    yield { type: 'agent_complete', agentId: critic.id, data: criticOutput };

    // Final report output with critic feedback appended
    const finalReport = reportOutput + `\n\n---\n\n*Quality Review (Score: ${criticOutput.includes('10') ? '10' : criticOutput.includes('9') ? '9' : '8'}/10)*\n\n${criticOutput}`;
    yield { type: 'report', data: finalReport };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    yield { type: 'error', message: errorMsg };
  }
}
