import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, streamCompletion, ACTIVE_MODEL } from './mimo-client';

const AGENT_DEFINITIONS = {
  ORCHESTRATOR: {
    id: 'orchestrator',
    name: 'Orchestrator Agent',
    description: 'Analyzes query and plans research strategy',
    icon: 'Brain',
  },
  RESEARCHER: {
    id: 'researcher',
    name: 'Research Analyst',
    description: 'Gathers and analyzes information from multiple angles',
    icon: 'Eye',
  },
  SYNTHESIZER: {
    id: 'synthesizer',
    name: 'Report Writer',
    description: 'Synthesizes findings into comprehensive report',
    icon: 'FileText',
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
  const TIMEOUT_MS = 45000; // 45 second total timeout

  try {
    // Step 1: Orchestrator - Quick plan (max 2048 tokens, fast)
    const orchestrator = agents.find(a => a.id === 'orchestrator')!;
    orchestrator.status = 'running';
    orchestrator.startTime = Date.now();
    yield { type: 'agent_start', agentId: orchestrator.id, message: 'Analyzing query and creating research plan...' };

    const planPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a research planner. Analyze the query and create a brief research plan (max 500 words).
Identify: 1) Key questions to answer, 2) Important aspects to cover, 3) Potential sources.
Be concise and focused.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\nDepth: ${request.depth || 'standard'}`,
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

    // Step 2: Researcher - Gather and analyze (stream for real-time feedback)
    const researcher = agents.find(a => a.id === 'researcher')!;
    researcher.status = 'running';
    researcher.startTime = Date.now();
    yield { type: 'agent_start', agentId: researcher.id, message: 'Gathering and analyzing information...' };

    const researchPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert research analyst. Based on the research plan, provide a thorough analysis.
Cover: key facts, trends, stakeholders, challenges, and opportunities.
Use markdown formatting. Be comprehensive but focused (max 2000 words).`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nResearch Plan:\n${plan}\n\nProvide your analysis.`,
      },
    ];

    researcher.messages = researchPrompt;
    
    let researchOutput = '';
    const researchStream = streamCompletion(researchPrompt, { 
      model: ACTIVE_MODEL, 
      temperature: 0.4,
      max_tokens: 4096 
    });
    
    const researchTimeout = setTimeout(() => {
      researchStream.return?.();
    }, 20000);

    for await (const chunk of researchStream) {
      researchOutput += chunk;
      yield { type: 'agent_update', agentId: researcher.id, message: chunk };
    }
    clearTimeout(researchTimeout);
    
    researcher.output = researchOutput;
    researcher.status = 'completed';
    researcher.endTime = Date.now();
    yield { type: 'agent_complete', agentId: researcher.id, data: researchOutput };

    // Check total time again
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Research timed out during analysis phase.');
    }

    // Step 3: Synthesizer - Create final report (stream directly to user)
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Writing final report...' };

    const synthesizePrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert report writer. Create a well-structured research report in markdown.
Include: Executive Summary, Key Findings, Detailed Analysis, and Recommendations.
Use clear headings, bullet points, and bold text for emphasis.
Maximum 3000 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nAnalysis:\n${researchOutput}\n\nWrite the final research report.`,
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

    // Final report
    yield { type: 'report', data: reportOutput };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    yield { type: 'error', message: errorMsg };
  }
}
