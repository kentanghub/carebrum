import { AgentState, AgentMessage, StreamEvent, ResearchRequest, SearchSource } from '@/types';
import { completion, streamCompletion, ACTIVE_MODEL } from './mimo-client';
import { searchWeb, crawlPages, formatSearchResults } from './search';
import { searchAcademic, formatAcademicResults } from './academic';

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

const DEPTH: Record<string, { timeoutMs: number; maxTokens: number; temp: number; searchCount: number; crawlCount: number }> = {
  quick:    { timeoutMs: 45000, maxTokens: 1500, temp: 0.4, searchCount: 4, crawlCount: 1 },
  standard: { timeoutMs: 80000, maxTokens: 2500, temp: 0.4, searchCount: 6, crawlCount: 3 },
  deep:     { timeoutMs: 110000, maxTokens: 3500, temp: 0.4, searchCount: 8, crawlCount: 5 },
  academic: { timeoutMs: 100000, maxTokens: 3000, temp: 0.3, searchCount: 6, crawlCount: 4 },
};

function chop(s: string, n: number) { return s && s.length > n ? s.slice(0, n) + '\n[...]' : s || ''; }

// ─── Streaming LLM call with token callback ─────────────────────────────────

async function callLLMStreamWithCallback(
  msgs: AgentMessage[],
  depth: string,
  onToken: (token: string) => void
): Promise<string> {
  const cfg = DEPTH[depth] || DEPTH.standard;
  const t = Date.now();
  let result = '';

  try {
    const stream = streamCompletion(msgs, {
      model: ACTIVE_MODEL,
      temperature: cfg.temp,
      max_tokens: cfg.maxTokens,
    });

    for await (const token of stream) {
      result += token;
      onToken(token);
    }

    if (result.trim().length >= 30) {
      console.log(`[LLM] ✓ ${Date.now()-t}ms ${result.length}c (streamed)`);
      return result;
    }
    throw new Error('short/empty response');
  } catch (e) {
    throw new Error(`API failed: ${e instanceof Error ? e.message : 'error'} (${Date.now()-t}ms)`);
  }
}

// Non-streaming fallback
async function callLLM(msgs: AgentMessage[], depth: string): Promise<string> {
  const cfg = DEPTH[depth] || DEPTH.standard;
  const t = Date.now();
  try {
    const r = await Promise.race([
      completion(msgs, { model: ACTIVE_MODEL, temperature: cfg.temp, max_tokens: cfg.maxTokens, timeoutMs: cfg.timeoutMs }),
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

function buildSearchQueries(query: string): string[] {
  const queries = [query];
  if (!/indonesia/i.test(query)) {
    queries.push(`${query} Indonesia`);
  }
  const acronymMatch = query.match(/\b[A-Z]{2,5}\b/g);
  if (acronymMatch) {
    const acronym = acronymMatch[0];
    queries.push(`${acronym} adalah program Indonesia`);
    queries.push(`${query} terbaru 2025`);
  }
  const noQuestion = query.replace(/^(apakah|apa|bagaimana|mengapa|kenapa|siapa|kapan|dimana)\s+/i, '');
  if (noQuestion !== query) {
    queries.push(noQuestion);
  }
  return [...new Set(queries)].slice(0, 4);
}

// ─── Citation Builder ───────────────────────────────────────────────────────

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
                        text.includes(domain) ||
                        text.includes(r.url);

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

  const refsSection = refs.length > 0
    ? `\n\n---\n\n## 📚 References\n\n${refs.join('\n')}`
    : '';

  return { cited: citedText, refs: refsSection };
}

// ─── Agent Prompts ──────────────────────────────────────────────────────────

function getOrchestratorPrompt(query: string, searchText: string, depth: string, isAcademic: boolean): string {
  return `You are the Orchestrator agent in a multi-agent research system.
Your job: Analyze the research query and create a structured research plan.

QUERY: ${query}

${searchText ? `PRELIMINARY WEB DATA:\n${chop(searchText, 2000)}` : ''}

${isAcademic ? 'This is an ACADEMIC research task. Focus on scholarly analysis.' : ''}

Create a research plan with:
1. TOPIC IDENTIFICATION — What exactly are we researching? Disambiguate if needed.
2. KEY SUB-QUESTIONS — 3-5 specific questions to investigate
3. RESEARCH STRATEGY — What sources and approaches to prioritize
4. EXPECTED OUTCOMES — What the final report should cover

Be specific. Answer in the SAME LANGUAGE as the query.
${depth === 'deep' ? 'Be thorough — identify edge cases and contrarian viewpoints.' : depth === 'quick' ? 'Be concise — focus on the most critical aspects.' : 'Be balanced — cover main aspects without over-elaborating.'}`;
}

function getExtractorPrompt(query: string, pageContents: string, searchResults: any[], academicResults: string): string {
  return `You are the Web Extractor agent. Your job: Extract and organize key facts from web sources.

QUERY: ${query}

${searchResults.length > 0 ? `SEARCH RESULTS:\n${formatSearchResults(searchResults.slice(0, 8))}` : 'No web search results available.'}

${pageContents ? `FULL PAGE CONTENTS (from crawled pages):\n${chop(pageContents, 4000)}` : ''}

${academicResults ? `ACADEMIC PAPERS:\n${chop(academicResults, 2000)}` : ''}

Extract and organize:
1. KEY FACTS — Specific data points, statistics, dates, names
2. DATA TABLE — If applicable, structured comparison data
3. EXPERT OPINIONS — Quotes or paraphrased expert views
4. SOURCE QUALITY — Rate the reliability of available sources

Be specific with numbers and dates. Cite sources by title.
Answer in the SAME LANGUAGE as the query.`;
}

function getReasonerPrompt(query: string, facts: string, depth: string): string {
  return `You are the Reasoning Engine agent. Your job: Deep analysis and chain-of-thought reasoning.

QUERY: ${query}

EXTRACTED FACTS:
${chop(facts, 3000)}

Perform deep analysis:
1. PATTERN RECOGNITION — What themes and trends emerge?
2. CAUSAL ANALYSIS — What are the root causes and effects?
3. CONTRADICTION CHECK — Do any sources disagree? Why?
4. IMPLICATION ANALYSIS — What does this mean for the future?
5. CONFIDENCE ASSESSMENT — How confident are we in each finding? (High/Medium/Low)

${depth === 'deep' ? 'Explore multiple perspectives including contrarian views. Consider second-order effects.' : 'Focus on the most significant patterns and implications.'}

Answer in the SAME LANGUAGE as the query.`;
}

function getCriticPrompt(query: string, report: string, sourceCount: number): string {
  return `You are the Quality Critic agent. Your job: Review the research report for accuracy and completeness.

QUERY: ${query}
SOURCES CONSULTED: ${sourceCount}

REPORT TO REVIEW:
${chop(report, 3000)}

Evaluate and provide:
1. ACCURACY CHECK — Any unsupported claims or factual errors?
2. COMPLETENESS — What important aspects are missing?
3. BIAS DETECTION — Any obvious bias or one-sidedness?
4. SOURCE QUALITY — Are sources diverse and reliable?
5. IMPROVEMENT SUGGESTIONS — Specific additions or corrections

Be constructive but thorough. Rate overall quality: A/B/C/D.
Answer in the SAME LANGUAGE as the query.`;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function* runResearchPipeline(
  req: ResearchRequest, agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const depth = req.depth || 'standard';
  const cfg = DEPTH[depth] || DEPTH.standard;
  const isFollowUp = req.mode === 'followup' && req.history && req.history.length > 0;
  const isAcademic = req.mode === 'academic';

  try {
    // ── Step 1: Web search + Page crawling ─────────────────────────────────
    let searchResults: any[] = [];
    let searchText = '';
    let pageContents = '';
    let academicText = '';

    if (!isFollowUp || req.query.length > 20) {
      const searchQueries = buildSearchQueries(req.query);
      console.log(`[Search] queries:`, searchQueries);

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

      yield {
        type: 'sources',
        data: searchResults.map((r: any) => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
          source: r.source || 'web',
        })),
      };

      yield { type: 'progress', step: 0, message: `Found ${searchResults.length} sources`, progress: 15 };

      // Crawl top pages (Jina Reader)
      const topUrls = searchResults
        .filter(r => r.url && !r.url.includes('youtube.com') && !r.url.includes('twitter.com'))
        .slice(0, cfg.crawlCount)
        .map(r => r.url);

      if (topUrls.length > 0) {
        yield { type: 'progress', step: 0, message: `Crawling ${topUrls.length} pages...`, progress: 20 };
        const crawled = await crawlPages(topUrls, 3000, 3);
        pageContents = Array.from(crawled.values()).join('\n\n---\n\n');
        console.log(`[Crawl] ${crawled.size}/${topUrls.length} pages in ${Date.now()-t0}ms`);
      }

      // Academic search
      if (isAcademic) {
        yield { type: 'progress', step: 0, message: 'Searching academic papers...', progress: 25 };
        try {
          const papers = await searchAcademic(req.query, 6);
          academicText = formatAcademicResults(papers);
          console.log(`[Academic] ${papers.length} papers found`);
        } catch { /* continue */ }
      }
    }

    // ── Step 2: ORCHESTRATOR (collect tokens, then emit) ──────────────────
    const orch = agents.find(a => a.id === 'orchestrator')!;
    orch.status = 'running'; orch.startTime = Date.now();
    yield { type: 'agent_start', agentId: orch.id, message: isFollowUp ? 'Processing follow-up...' : 'Creating research plan...' };
    yield { type: 'progress', step: 1, progress: 30 };

    const orchPrompt = getOrchestratorPrompt(req.query, searchText, depth, isAcademic);
    const orchMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are a research planning agent.' },
      ...(isFollowUp && req.history ? req.history : []),
      { role: 'user', content: orchPrompt },
    ];

    // Collect tokens then yield them
    const orchTokens: string[] = [];
    let orchOutput = '';
    try {
      orchOutput = await callLLMStreamWithCallback(orchMsgs, depth, (token) => {
        orchTokens.push(token);
      });
    } catch {
      orchOutput = await callLLM(orchMsgs, depth);
    }

    // Emit collected tokens
    for (const token of orchTokens) {
      yield { type: 'agent_token', agentId: orch.id, token };
    }

    orch.output = orchOutput;
    orch.status = 'completed'; orch.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orch.id, data: orchOutput };
    yield { type: 'progress', step: 1, progress: 40 };

    // ── Step 3: EXTRACTOR ──────────────────────────────────────────────────
    const extr = agents.find(a => a.id === 'multimodal_extractor')!;
    extr.status = 'running'; extr.startTime = Date.now();
    yield { type: 'agent_start', agentId: extr.id, message: 'Extracting data from sources...' };
    yield { type: 'progress', step: 2, progress: 45 };

    const extrPrompt = getExtractorPrompt(req.query, pageContents, searchResults, academicText);
    const extrMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are a data extraction agent.' },
      { role: 'user', content: extrPrompt },
    ];

    let extrResult = '';
    try {
      extrResult = await callLLM(extrMsgs, depth);
    } catch (e) {
      extrResult = e instanceof Error ? e.message : 'Extraction failed';
    }

    extr.output = extrResult; extr.status = 'completed'; extr.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extr.id, data: extrResult };
    yield { type: 'progress', step: 2, progress: 55 };

    // ── Step 4: REASONER (streams tokens) ─────────────────────────────────
    const reas = agents.find(a => a.id === 'reasoning_engine')!;
    reas.status = 'running'; reas.startTime = Date.now();
    yield { type: 'agent_start', agentId: reas.id, message: 'Deep analysis...' };
    yield { type: 'progress', step: 2, progress: 58 };

    const reasPrompt = getReasonerPrompt(req.query, extrResult, depth);
    const reasMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are an analytical reasoning agent.' },
      { role: 'user', content: reasPrompt },
    ];

    const reasTokens: string[] = [];
    let reasOutput = '';
    try {
      reasOutput = await callLLMStreamWithCallback(reasMsgs, depth, (token) => {
        reasTokens.push(token);
      });
    } catch {
      reasOutput = await callLLM(reasMsgs, depth);
    }

    for (const token of reasTokens) {
      yield { type: 'agent_token', agentId: reas.id, token };
    }

    reas.output = reasOutput; reas.status = 'completed'; reas.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reas.id, data: reasOutput };
    yield { type: 'progress', step: 3, progress: 70 };

    // ── Step 5: SYNTHESIZER (streams report tokens) ───────────────────────
    const synth = agents.find(a => a.id === 'synthesizer')!;
    synth.status = 'running'; synth.startTime = Date.now();
    yield { type: 'agent_start', agentId: synth.id, message: 'Writing final report...' };
    yield { type: 'progress', step: 3, progress: 75 };

    const synthSystem = `You are a professional research report writer. Write comprehensive, well-structured reports.

Use markdown formatting with clear headings (## and ###), bullet points, and bold for key terms.
Include inline citations by referencing source titles.
Write in the SAME LANGUAGE as the query.

Structure your report with these sections:
## 📌 Executive Summary
## 📊 Key Findings & Data
## 🔍 Deep Analysis
## 💡 Implications & Outlook
## ✅ Conclusion`;

    const synthUser = `QUERY: ${req.query}

ORCHESTRATOR PLAN:
${chop(orchOutput, 1500)}

EXTRACTED DATA:
${chop(extrResult, 2000)}

ANALYSIS:
${chop(reasOutput, 2000)}

${searchResults.length > 0 ? `SOURCES (${searchResults.length}):\n${searchResults.map((r: any, i: number) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')}` : ''}

Write a complete, publication-quality research report. Be thorough but readable.`;

    const synthMsgs: AgentMessage[] = [
      { role: 'system', content: synthSystem },
      ...(isFollowUp && req.history ? req.history : []),
      { role: 'user', content: synthUser },
    ];

    // Stream report tokens in real-time
    const synthTokens: string[] = [];
    let reportContent = '';
    try {
      reportContent = await callLLMStreamWithCallback(synthMsgs, depth, (token) => {
        synthTokens.push(token);
        // Note: We can't yield here from callback, tokens are emitted below
      });
    } catch {
      reportContent = await callLLM(synthMsgs, depth);
    }

    // Emit report tokens in chunks for real-time display
    for (const token of synthTokens) {
      yield { type: 'report_token', token, agentId: synth.id };
    }

    // Build citations
    const { cited, refs } = buildCitations(reportContent, searchResults);
    const finalReport = cited + refs + (searchResults.length > 0 ? `\n\n---\n*${searchResults.length} web sources consulted*` : '');

    synth.output = finalReport; synth.status = 'completed'; synth.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synth.id, data: finalReport };
    yield { type: 'report', data: finalReport };
    yield { type: 'progress', step: 4, progress: 85 };

    // ── Step 6: QUALITY CRITIC ─────────────────────────────────────────────
    const crit = agents.find(a => a.id === 'critic')!;
    crit.status = 'running'; crit.startTime = Date.now();
    yield { type: 'agent_start', agentId: crit.id, message: 'Quality review...' };

    const critPrompt = getCriticPrompt(req.query, finalReport, searchResults.length);
    const critMsgs: AgentMessage[] = [
      { role: 'system', content: 'You are a quality assurance agent.' },
      { role: 'user', content: critPrompt },
    ];

    // Run critic, emit followup_ready immediately
    yield { type: 'followup_ready', data: { query: req.query, hasHistory: true } };
    yield { type: 'progress', step: 4, progress: 90 };

    let critResult = '';
    try {
      critResult = await callLLM(critMsgs, depth);
    } catch (e) {
      critResult = e instanceof Error ? e.message : 'Review failed';
    }

    crit.output = critResult; crit.status = 'completed'; crit.endTime = Date.now();
    yield { type: 'agent_complete', agentId: crit.id, data: critResult };
    yield { type: 'progress', step: 5, progress: 100 };

    console.log(`[Pipe] ✓ ${Date.now()-t0}ms | ${searchResults.length} web | ${finalReport.length}c`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Pipe] ✗', m);
    agents.filter(a => a.status === 'running').forEach(a => { a.status = 'error'; a.output = m; });
    yield { type: 'error', message: m };
  }
}
