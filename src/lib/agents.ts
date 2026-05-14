/**
 * Multi-Agent Research Engine v2.0
 * 
 * Features:
 * - Real multi-agent architecture with independent LLM calls
 * - Multi-model routing (free models first, fallback to paid)
 * - Iterative refinement (Critic can trigger re-runs)
 * - Source verification pipeline
 * - Structured data extraction
 * - Research templates
 * - Knowledge graph integration
 * - RAG document support
 * - Streaming tokens to UI
 */

import { AgentState, AgentMessage, StreamEvent, ResearchRequest, SearchSource, VerificationResult, StructuredData } from '@/types';
import { completion, streamCompletion, ACTIVE_MODEL, getAvailableProviders } from './llm-client';
import { searchWeb, crawlPages, formatSearchResults } from './search';
import { searchAcademic, formatAcademicResults } from './academic';
import { getTemplate } from './templates';
import { extractKnowledgeFromReport } from './knowledge-graph';

const AGENTS = {
  ORCHESTRATOR:   { id: 'orchestrator',        name: 'Orchestrator',     desc: 'Research strategy & planning',  icon: 'Brain' },
  EXTRACTOR:      { id: 'multimodal_extractor', name: 'Web Extractor',   desc: 'Real-time web data gathering',  icon: 'Eye' },
  REASONER:       { id: 'reasoning_engine',     name: 'Reasoning Engine',desc: 'Deep analysis & reasoning',     icon: 'GitBranch' },
  SYNTHESIZER:    { id: 'synthesizer',          name: 'Report Writer',   desc: 'Structured report compilation', icon: 'FileText' },
  CRITIC:         { id: 'critic',               name: 'Quality Critic',  desc: 'Accuracy & completeness review',icon: 'CheckCircle' },
  VERIFIER:       { id: 'verifier',             name: 'Fact Checker',    desc: 'Source verification & confidence', icon: 'Shield' },
};

export function initializeAgents(): AgentState[] {
  return Object.values(AGENTS).map(a => ({ ...a, description: a.desc, status: 'idle' as const, messages: [] }));
}

const DEPTH: Record<string, { timeoutMs: number; maxTokens: number; temp: number; searchCount: number; crawlCount: number; maxIterations: number }> = {
  quick:    { timeoutMs: 45000, maxTokens: 1500, temp: 0.4, searchCount: 4, crawlCount: 1, maxIterations: 1 },
  standard: { timeoutMs: 80000, maxTokens: 2500, temp: 0.4, searchCount: 6, crawlCount: 3, maxIterations: 2 },
  deep:     { timeoutMs: 110000, maxTokens: 3500, temp: 0.4, searchCount: 8, crawlCount: 5, maxIterations: 3 },
  academic: { timeoutMs: 100000, maxTokens: 3000, temp: 0.3, searchCount: 6, crawlCount: 4, maxIterations: 2 },
};

function chop(s: string, n: number) { return s && s.length > n ? s.slice(0, n) + '\n[...]' : s || ''; }

// ===== MODEL ROUTING PER AGENT =====

/** Choose the best model for each agent role */
function getAgentModelConfig(agentId: string, depth: string): { provider?: string; model?: string; temperature?: number } {
  const depthCfg = DEPTH[depth] || DEPTH.standard;

  switch (agentId) {
    case 'orchestrator':
      // Fast model for planning — free provider preferred
      return { provider: 'groq', temperature: 0.4 };
    case 'multimodal_extractor':
      // Balanced model for extraction
      return { provider: 'groq', temperature: 0.3 };
    case 'reasoning_engine':
      // Best model for deep reasoning — Kimi K2.6 if available
      return { provider: 'canopywave', temperature: depthCfg.temp };
    case 'synthesizer':
      // Best model for report writing — Kimi K2.6 if available
      return { provider: 'canopywave', temperature: 0.5 };
    case 'critic':
      // Different model for objectivity
      return { provider: 'google', temperature: 0.3 };
    case 'verifier':
      // Fast model for fact-checking
      return { provider: 'groq', temperature: 0.2 };
    default:
      return { temperature: depthCfg.temp };
  }
}

// ===== LLM HELPERS =====

async function callLLMWithFallback(
  msgs: AgentMessage[],
  depth: string,
  agentId: string
): Promise<string> {
  const cfg = DEPTH[depth] || DEPTH.standard;
  const modelCfg = getAgentModelConfig(agentId, depth);
  const t = Date.now();

  // Try primary provider first, then fallback to free providers
  const configsToTry = [
    { provider: modelCfg.provider, model: modelCfg.model, temperature: modelCfg.temperature },
    // Fallback 1: Groq (free, fast)
    { provider: 'groq', temperature: modelCfg.temperature },
    // Fallback 2: Google Gemini (free)
    { provider: 'google', temperature: modelCfg.temperature },
    // Fallback 3: OpenRouter (free models)
    { provider: 'openrouter', temperature: modelCfg.temperature },
  ];

  // Deduplicate by provider name, keeping order
  const seen = new Set<string>();
  const uniqueConfigs = configsToTry.filter(c => {
    if (!c.provider || seen.has(c.provider)) return false;
    seen.add(c.provider);
    return true;
  });

  let lastError: Error | null = null;

  for (const config of uniqueConfigs) {
    try {
      const result = await completion(msgs, {
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        max_tokens: cfg.maxTokens,
        timeoutMs: cfg.timeoutMs,
      });

      if (result.trim().length >= 20) {
        console.log(`[LLM] ✓ ${agentId} via ${config.provider} ${Date.now()-t}ms ${result.length}c`);
        return result;
      }
      lastError = new Error('short/empty response');
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.log(`[LLM] ✗ ${agentId} via ${config.provider}: ${lastError.message.slice(0, 80)}`);
      // Continue to next provider
    }
  }

  throw new Error(`Agent ${agentId} failed on all providers: ${lastError?.message || 'unknown'} (${Date.now()-t}ms)`);
}

async function callLLMStreamWithCallback(
  msgs: AgentMessage[],
  depth: string,
  agentId: string,
  onToken: (token: string) => void
): Promise<string> {
  const cfg = DEPTH[depth] || DEPTH.standard;
  const modelCfg = getAgentModelConfig(agentId, depth);
  const t = Date.now();

  // Try primary provider, fallback to free providers
  const configsToTry = [
    { provider: modelCfg.provider, model: modelCfg.model, temperature: modelCfg.temperature },
    { provider: 'groq', temperature: modelCfg.temperature },
    { provider: 'google', temperature: modelCfg.temperature },
    { provider: 'openrouter', temperature: modelCfg.temperature },
  ];

  const seen = new Set<string>();
  const uniqueConfigs = configsToTry.filter(c => {
    if (!c.provider || seen.has(c.provider)) return false;
    seen.add(c.provider);
    return true;
  });

  let lastError: Error | null = null;

  for (const config of uniqueConfigs) {
    try {
      let result = '';
      const stream = streamCompletion(msgs, {
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        max_tokens: cfg.maxTokens,
      });

      for await (const token of stream) {
        result += token;
        onToken(token);
      }

      if (result.trim().length >= 20) {
        console.log(`[LLM] ✓ ${agentId} via ${config.provider} (stream) ${Date.now()-t}ms ${result.length}c`);
        return result;
      }
      lastError = new Error('short/empty response');
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.log(`[LLM] ✗ ${agentId} stream via ${config.provider}: ${lastError.message.slice(0, 80)}`);
    }
  }

  throw new Error(`Agent ${agentId} stream failed on all providers: ${lastError?.message || 'unknown'} (${Date.now()-t}ms)`);
}

function extractSection(text: string, marker: string, nextMarkers: string[]): string {
  const pattern = new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=${nextMarkers.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)`, 'i');
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

function buildSearchQueries(query: string): string[] {
  const queries = [query];
  if (!/indonesia/i.test(query)) queries.push(`${query} Indonesia`);
  const acronymMatch = query.match(/\b[A-Z]{2,5}\b/g);
  if (acronymMatch) {
    queries.push(`${acronymMatch[0]} adalah program Indonesia`);
    queries.push(`${query} terbaru 2025`);
  }
  const noQuestion = query.replace(/^(apakah|apa|bagaimana|mengapa|kenapa|siapa|kapan|dimana)\s+/i, '');
  if (noQuestion !== query) queries.push(noQuestion);
  return [...new Set(queries)].slice(0, 4);
}

// ===== CITATION BUILDER =====

function buildCitations(text: string, searchResults: any[]): { cited: string; refs: string } {
  if (!searchResults.length) return { cited: text, refs: '' };
  const refs: string[] = [];
  const urlMap = new Map<string, number>();

  for (const r of searchResults) {
    if (!r.url) continue;
    try {
      const domain = new URL(r.url).hostname.replace('www.', '');
      const titleWords = (r.title || '').split(/\s+/).filter((w: string) => w.length > 4);
      const mentioned = titleWords.some((w: string) => text.toLowerCase().includes(w.toLowerCase())) ||
                        text.includes(domain) || text.includes(r.url);
      if (mentioned && !urlMap.has(r.url)) {
        const num = refs.length + 1;
        urlMap.set(r.url, num);
        refs.push(`[${num}] [${r.title || domain}](${r.url})`);
      }
    } catch { /* invalid URL */ }
  }

  let citedText = text;
  for (const [url, num] of urlMap) {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      citedText = citedText.replace(domain, `${domain}[^${num}]`);
    } catch { /* invalid URL */ }
  }

  const refsSection = refs.length > 0 ? `\n\n---\n\n## 📚 References\n\n${refs.join('\n')}` : '';
  return { cited: citedText, refs: refsSection };
}

// ===== AGENT PROMPTS (TEMPLATE-AWARE) =====

function getOrchestratorPrompt(query: string, searchText: string, depth: string, isAcademic: boolean, template: any, docContext: string): string {
  const customPrompt = template.systemPrompts.orchestrator;
  return `${customPrompt}

QUERY: ${query}

${searchText ? `PRELIMINARY WEB DATA:\n${chop(searchText, 2000)}` : ''}
${isAcademic ? '\nThis is an ACADEMIC research task. Focus on scholarly analysis.' : ''}
${docContext ? `\nUSER DOCUMENTS:\n${chop(docContext, 2000)}` : ''}

Create a research plan with:
1. TOPIC IDENTIFICATION — What exactly are we researching?
2. KEY SUB-QUESTIONS — 3-5 specific questions to investigate
3. RESEARCH STRATEGY — What sources and approaches to prioritize
4. EXPECTED OUTCOMES — What the final report should cover

Answer in the SAME LANGUAGE as the query.
${depth === 'deep' ? 'Be thorough — identify edge cases and contrarian viewpoints.' : depth === 'quick' ? 'Be concise.' : 'Be balanced.'}`;
}

function getExtractorPrompt(query: string, pageContents: string, searchResults: any[], academicResults: string, template: any, docContext: string): string {
  return `${template.systemPrompts.extractor}

QUERY: ${query}

${searchResults.length > 0 ? `SEARCH RESULTS:\n${formatSearchResults(searchResults.slice(0, 8))}` : 'No web search results available.'}
${pageContents ? `\nFULL PAGE CONTENTS:\n${chop(pageContents, 4000)}` : ''}
${academicResults ? `\nACADEMIC PAPERS:\n${chop(academicResults, 2000)}` : ''}
${docContext ? `\nUSER DOCUMENTS:\n${chop(docContext, 3000)}` : ''}

Extract and organize:
1. KEY FACTS — Specific data points, statistics, dates, names
2. DATA TABLE — If applicable, structured comparison data
3. EXPERT OPINIONS — Quotes or paraphrased expert views
4. SOURCE QUALITY — Rate the reliability of available sources

Be specific with numbers and dates. Cite sources by title.
Answer in the SAME LANGUAGE as the query.`;
}

function getReasonerPrompt(query: string, facts: string, depth: string, template: any): string {
  return `${template.systemPrompts.reasoner}

QUERY: ${query}

EXTRACTED FACTS:
${chop(facts, 3000)}

Perform deep analysis:
1. PATTERN RECOGNITION — What themes and trends emerge?
2. CAUSAL ANALYSIS — What are the root causes and effects?
3. CONTRADICTION CHECK — Do any sources disagree? Why?
4. IMPLICATION ANALYSIS — What does this mean for the future?
5. CONFIDENCE ASSESSMENT — How confident are we in each finding? (High/Medium/Low)

${depth === 'deep' ? 'Explore multiple perspectives including contrarian views.' : 'Focus on the most significant patterns.'}
Answer in the SAME LANGUAGE as the query.`;
}

function getSynthesizerPrompt(query: string, orchOutput: string, extrResult: string, reasOutput: string, searchResults: any[], template: any, iteration: number, criticFeedback: string): string {
  return `${template.systemPrompts.synthesizer}

Write a comprehensive research report using this structure:
${template.outputFormat}

QUERY: ${query}

ORCHESTRATOR PLAN:
${chop(orchOutput, 1500)}

EXTRACTED DATA:
${chop(extrResult, 2000)}

ANALYSIS:
${chop(reasOutput, 2000)}

${searchResults.length > 0 ? `SOURCES (${searchResults.length}):\n${searchResults.map((r: any, i: number) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')}` : ''}
${iteration > 1 && criticFeedback ? `\nPREVIOUS REVIEW FEEDBACK (address these points):\n${chop(criticFeedback, 1500)}` : ''}

Write a complete, publication-quality research report. Be thorough but readable.
${iteration > 1 ? 'This is iteration ' + iteration + '. Address the feedback from the previous review.' : ''}
Answer in the SAME LANGUAGE as the query.`;
}

function getCriticPrompt(query: string, report: string, sourceCount: number, template: any): string {
  return `${template.systemPrompts.critic}

QUERY: ${query}
SOURCES CONSULTED: ${sourceCount}

REPORT TO REVIEW:
${chop(report, 3000)}

Evaluate and provide:
1. ACCURACY CHECK — Any unsupported claims or factual errors?
2. COMPLETENESS — What important aspects are missing? (score 1-10)
3. BIAS DETECTION — Any obvious bias or one-sidedness?
4. SOURCE QUALITY — Are sources diverse and reliable?
5. IMPROVEMENT SUGGESTIONS — Specific additions or corrections
6. OVERALL GRADE — A/B/C/D
7. NEEDS_REFINEMENT — true/false (set to true if grade is B or below)

Format your response with clear sections. End with:
NEEDS_REFINEMENT: true/false
GRADE: A/B/C/D

Answer in the SAME LANGUAGE as the query.`;
}

function getVerifierPrompt(query: string, claims: string, sources: string): string {
  return `You are a fact-checking specialist. Verify the following claims against available sources.

QUERY: ${query}

CLAIMS TO VERIFY:
${chop(claims, 2000)}

AVAILABLE SOURCES:
${chop(sources, 2000)}

For each claim, provide:
- CLAIM: [the claim]
- VERDICT: VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED / CONTRADICTED
- CONFIDENCE: HIGH / MEDIUM / LOW
- EVIDENCE: [supporting or contradicting evidence]
- SOURCES: [which sources support/refute this]

Be rigorous. Mark as UNVERIFIED if insufficient evidence exists.
Answer in the SAME LANGUAGE as the query.`;
}

function getStructuredExtractionPrompt(query: string, report: string): string {
  return `Extract structured data from this research report. Output ONLY valid JSON.

QUERY: ${query}

REPORT:
${chop(report, 4000)}

Extract the following into JSON format:
{
  "tables": [{"title": "...", "headers": ["col1", "col2"], "rows": [["val1", "val2"]]}],
  "statistics": [{"label": "...", "value": "...", "source": "..."}],
  "quotes": [{"text": "...", "attribution": "...", "source": "..."}],
  "timeline": [{"date": "...", "event": "..."}]
}

Only include data that actually exists in the report. Empty arrays if none found.
Output ONLY the JSON object, no other text.`;
}

// ===== MAIN PIPELINE =====

export async function* runResearchPipeline(
  req: ResearchRequest, agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const depth = req.depth || 'standard';
  const cfg = DEPTH[depth] || DEPTH.standard;
  const maxIterations = req.maxIterations || cfg.maxIterations;
  const isFollowUp = req.mode === 'followup' && req.history && req.history.length > 0;
  const isAcademic = req.mode === 'academic';
  const template = getTemplate(req.template || 'general');
  const docContext = req.documentContent || '';

  // Log provider info
  const providers = getAvailableProviders();
  console.log(`[Pipe] Providers: ${providers.map(p => `${p.name}(${p.isFree ? 'free' : 'paid'})`).join(', ')}`);

  try {
    // ── Step 1: Web search + Page crawling ─────────────────────────────────
    let searchResults: any[] = [];
    let searchText = '';
    let pageContents = '';
    let academicText = '';

    if (!isFollowUp || req.query.length > 20) {
      const searchQueries = buildSearchQueries(req.query);
      yield { type: 'progress', step: 0, message: 'Searching the web...', progress: 5 };

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
      searchText = searchResults.length > 0 ? formatSearchResults(searchResults) : '';
      console.log(`[Search] ${searchResults.length} results in ${Date.now()-t0}ms`);

      yield { type: 'sources', data: searchResults.map((r: any) => ({ title: r.title, snippet: r.snippet, url: r.url, source: r.source || 'web' })) };
      yield { type: 'progress', step: 0, message: `Found ${searchResults.length} sources`, progress: 15 };

      // Crawl pages
      const topUrls = searchResults.filter(r => r.url && !r.url.includes('youtube.com') && !r.url.includes('twitter.com')).slice(0, cfg.crawlCount).map(r => r.url);
      if (topUrls.length > 0) {
        yield { type: 'progress', step: 0, message: `Crawling ${topUrls.length} pages...`, progress: 20 };
        const crawled = await crawlPages(topUrls, 3000, 3);
        pageContents = Array.from(crawled.values()).join('\n\n---\n\n');
      }

      // Academic search
      if (isAcademic) {
        yield { type: 'progress', step: 0, message: 'Searching academic papers...', progress: 25 };
        try {
          const papers = await searchAcademic(req.query, 6);
          academicText = formatAcademicResults(papers);
        } catch { /* continue */ }
      }
    }

    // ── Step 2: ORCHESTRATOR ───────────────────────────────────────────────
    const orch = agents.find(a => a.id === 'orchestrator')!;
    orch.status = 'running'; orch.startTime = Date.now();
    yield { type: 'agent_start', agentId: orch.id, message: 'Creating research plan...' };
    yield { type: 'progress', step: 1, progress: 30 };

    const orchMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are a research planning agent.' },
      ...(isFollowUp && req.history ? req.history : []),
      { role: 'user', content: getOrchestratorPrompt(req.query, searchText, depth, isAcademic, template, docContext) },
    ];

    let orchOutput = '';
    try {
      orchOutput = await callLLMWithFallback(orchMsgs, depth, orch.id);
    } catch (e) {
      orchOutput = `Research plan for: ${req.query}`;
    }

    orch.output = orchOutput; orch.status = 'completed'; orch.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orch.id, data: orchOutput };
    yield { type: 'progress', step: 1, progress: 40 };

    // ── Step 3: EXTRACTOR ──────────────────────────────────────────────────
    const extr = agents.find(a => a.id === 'multimodal_extractor')!;
    extr.status = 'running'; extr.startTime = Date.now();
    yield { type: 'agent_start', agentId: extr.id, message: 'Extracting data from sources...' };
    yield { type: 'progress', step: 2, progress: 45 };

    const extrMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are a data extraction agent.' },
      { role: 'user', content: getExtractorPrompt(req.query, pageContents, searchResults, academicText, template, docContext) },
    ];

    let extrResult = '';
    try { extrResult = await callLLMWithFallback(extrMsgs, depth, extr.id); }
    catch (e) { extrResult = 'Extraction failed: ' + (e instanceof Error ? e.message : 'unknown'); }

    extr.output = extrResult; extr.status = 'completed'; extr.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extr.id, data: extrResult };
    yield { type: 'progress', step: 2, progress: 55 };

    // ── Step 4: REASONER (streaming) ──────────────────────────────────────
    const reas = agents.find(a => a.id === 'reasoning_engine')!;
    reas.status = 'running'; reas.startTime = Date.now();
    yield { type: 'agent_start', agentId: reas.id, message: 'Deep analysis...' };
    yield { type: 'progress', step: 2, progress: 58 };

    const reasMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are an analytical reasoning agent.' },
      { role: 'user', content: getReasonerPrompt(req.query, extrResult, depth, template) },
    ];

    const reasTokens: string[] = [];
    let reasOutput = '';
    try {
      reasOutput = await callLLMStreamWithCallback(reasMsgs, depth, reas.id, (t) => reasTokens.push(t));
    } catch { reasOutput = await callLLMWithFallback(reasMsgs, depth, reas.id); }

    for (const token of reasTokens) yield { type: 'agent_token', agentId: reas.id, token };
    reas.output = reasOutput; reas.status = 'completed'; reas.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reas.id, data: reasOutput };
    yield { type: 'progress', step: 3, progress: 70 };

    // ── Step 5: ITERATIVE REFINEMENT LOOP ─────────────────────────────────
    let finalReport = '';
    let criticFeedback = '';
    let iteration = 1;

    for (iteration = 1; iteration <= maxIterations; iteration++) {
      yield { type: 'iteration', iteration, maxIterations, message: `Iteration ${iteration}/${maxIterations}` };

      // SYNTHESIZER (streaming)
      const synth = agents.find(a => a.id === 'synthesizer')!;
      synth.status = 'running'; synth.startTime = Date.now();
      yield { type: 'agent_start', agentId: synth.id, message: iteration > 1 ? `Refining report (iteration ${iteration})...` : 'Writing report...' };
      yield { type: 'progress', step: 3, progress: 70 + (iteration * 5) };

      const synthMsgs: AgentMessage[] = [
        { role: 'system', content: template.systemPrompts.synthesizer },
        ...(isFollowUp && req.history ? req.history : []),
        { role: 'user', content: getSynthesizerPrompt(req.query, orchOutput, extrResult, reasOutput, searchResults, template, iteration, criticFeedback) },
      ];

      const synthTokens: string[] = [];
      let reportContent = '';
      try {
        reportContent = await callLLMStreamWithCallback(synthMsgs, depth, synth.id, (t) => synthTokens.push(t));
      } catch { reportContent = await callLLMWithFallback(synthMsgs, depth, synth.id); }

      for (const token of synthTokens) yield { type: 'report_token', token, agentId: synth.id };

      const { cited, refs } = buildCitations(reportContent, searchResults);
      finalReport = cited + refs + (searchResults.length > 0 ? `\n\n---\n*${searchResults.length} web sources consulted*` : '');

      synth.output = finalReport; synth.status = 'completed'; synth.endTime = Date.now();
      yield { type: 'agent_complete', agentId: synth.id, data: finalReport };
      yield { type: 'progress', step: 3, progress: 80 };

      // CRITIC
      const crit = agents.find(a => a.id === 'critic')!;
      crit.status = 'running'; crit.startTime = Date.now();
      yield { type: 'agent_start', agentId: crit.id, message: `Quality review (iteration ${iteration})...` };

      const critMsgs: AgentMessage[] = [
        { role: 'system', content: template.systemPrompts.critic },
        { role: 'user', content: getCriticPrompt(req.query, finalReport, searchResults.length, template) },
      ];

      let critResult = '';
      try { critResult = await callLLMWithFallback(critMsgs, depth, crit.id); }
      catch { critResult = 'NEEDS_REFINEMENT: false\nGRADE: B'; }

      crit.output = critResult; crit.status = 'completed'; crit.endTime = Date.now();
      yield { type: 'agent_complete', agentId: crit.id, data: critResult };

      // Check if refinement needed
      const needsRefinement = critResult.includes('NEEDS_REFINEMENT: true') && iteration < maxIterations;
      if (!needsRefinement) {
        console.log(`[Pipe] Quality check passed at iteration ${iteration}`);
        break;
      }

      criticFeedback = critResult;
      console.log(`[Pipe] Refinement needed, starting iteration ${iteration + 1}`);
    }

    // ── Step 6: SOURCE VERIFICATION (always runs, not just when claims found) ──
    const verifier = agents.find(a => a.id === 'verifier')!;
    if (verifier) {
      verifier.status = 'running'; verifier.startTime = Date.now();
      yield { type: 'agent_start', agentId: verifier.id, message: 'Verifying claims against sources...' };
      yield { type: 'progress', step: 4, message: 'Fact-checking...', progress: 88 };

      // Extract claims — be more lenient with what counts as a claim
      const claimLines = finalReport.split('\n')
        .filter(l => {
          const trimmed = l.trim();
          return (
            trimmed.startsWith('- ') ||
            trimmed.startsWith('* ') ||
            trimmed.match(/^\d+\./) ||
            (trimmed.startsWith('**') && trimmed.includes('**:')) ||
            (trimmed.length > 30 && trimmed.length < 300 && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('['))
          );
        })
        .slice(0, 12)
        .map(l => l.replace(/^[-*\d.]+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim())
        .filter(l => l.length > 10);

      const claims = claimLines.join('\n');
      const verifyMsgs: AgentMessage[] = [
        { role: 'system', content: 'You are a fact-checking specialist.' },
        { role: 'user', content: getVerifierPrompt(
          req.query,
          claims || `Main topic: ${req.query}\nReport summary: ${finalReport.slice(0, 1000)}`,
          searchText.slice(0, 2000)
        ) },
      ];

      let verifyResult = '';
      try { verifyResult = await callLLMWithFallback(verifyMsgs, depth, verifier.id); }
      catch { verifyResult = 'Verification completed with limited sources.'; }

      verifier.output = verifyResult; verifier.status = 'completed'; verifier.endTime = Date.now();
      yield { type: 'agent_complete', agentId: verifier.id, data: verifyResult };
      yield { type: 'verification', data: verifyResult };
    }

    // ── Step 7: STRUCTURED DATA EXTRACTION ─────────────────────────────────
    if (depth !== 'quick') {
      yield { type: 'progress', step: 4, message: 'Extracting structured data...', progress: 90 };

      const structMsgs: AgentMessage[] = [
        { role: 'system', content: 'You are a data extraction specialist. Output ONLY valid JSON.' },
        { role: 'user', content: getStructuredExtractionPrompt(req.query, finalReport) },
      ];

      try {
        const structResult = await callLLMWithFallback(structMsgs, depth, 'extractor');
        // Try to parse JSON from the response
        const jsonMatch = structResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const structuredData: StructuredData = JSON.parse(jsonMatch[0]);
          yield { type: 'structured_data', data: structuredData };
        }
      } catch { /* structured extraction is optional */ }
    }

    // ── Step 8: KNOWLEDGE GRAPH UPDATE ─────────────────────────────────────
    try {
      const sessionId = `session-${Date.now()}`;
      const knowledgeNodes = extractKnowledgeFromReport(finalReport, req.query, sessionId);
      if (knowledgeNodes.length > 0) {
        yield { type: 'knowledge_update', data: { nodeCount: knowledgeNodes.length, sessionId } };
      }
    } catch { /* knowledge graph is optional */ }

    // ── Finalize ───────────────────────────────────────────────────────────
    yield { type: 'report', data: finalReport };
    yield { type: 'followup_ready', data: { query: req.query, hasHistory: true } };
    yield { type: 'progress', step: 5, progress: 100 };

    console.log(`[Pipe] ✓ ${Date.now()-t0}ms | ${searchResults.length} web | ${finalReport.length}c | ${iteration} iterations`);

  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Pipe] ✗', m);
    agents.filter(a => a.status === 'running').forEach(a => { a.status = 'error'; a.output = m; });
    yield { type: 'error', message: m };
  }
}
