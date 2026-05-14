/**
 * Multi-Provider LLM Client
 * 
 * Supports: MiMo (Xiaomi), DeepSeek, Groq, Google Gemini, OpenRouter, Together AI
 * Features: automatic fallback, retry with backoff, token tracking, deduplication
 * 
 * Free tier providers (no cost):
 *   - Groq: Llama 3.3 70B (30 RPM free)
 *   - Google Gemini: 2.0 Flash (15 RPM free)
 *   - OpenRouter: Many free models available
 */

import { AgentMessage } from '@/types';

// ===== PROVIDER CONFIGURATION =====

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: Record<string, string>;
  defaultModel: string;
  maxTokens: number;
  isFree: boolean;
}

// Provider registry — loaded from environment
const PROVIDERS: Record<string, ProviderConfig> = {};

function initProviders() {
  // MiMo / Xiaomi (primary — user's credits)
  if (process.env.MIMO_API_KEY || process.env.API_KEY) {
    PROVIDERS['mimo'] = {
      name: 'MiMo (Xiaomi)',
      baseUrl: process.env.MIMO_API_BASE_URL || process.env.API_BASE_URL || 'https://api.mimo.ai/v1',
      apiKey: process.env.MIMO_API_KEY || process.env.API_KEY || '',
      models: {
        'mimo-pro': 'mimo-v2.5-pro',
        'mimo-flash': 'mimo-v2-flash',
      },
      defaultModel: 'mimo-v2.5-pro',
      maxTokens: 4096,
      isFree: false,
    };
  }

  // DeepSeek (backup — user's credits)
  if (process.env.DEEPSEEK_API_KEY) {
    PROVIDERS['deepseek'] = {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY,
      models: {
        'deepseek-chat': 'deepseek-chat',
        'deepseek-reasoner': 'deepseek-reasoner',
      },
      defaultModel: 'deepseek-chat',
      maxTokens: 8192,
      isFree: false,
    };
  }

  // Groq (FREE — Llama 3.3 70B, 30 RPM)
  if (process.env.GROQ_API_KEY) {
    PROVIDERS['groq'] = {
      name: 'Groq (Free)',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      models: {
        'llama-3.3-70b': 'llama-3.3-70b-versatile',
        'llama-3.1-8b': 'llama-3.1-8b-instant',
        'mixtral-8x7b': 'mixtral-8x7b-32768',
        'gemma2-9b': 'gemma2-9b-it',
      },
      defaultModel: 'llama-3.3-70b-versatile',
      maxTokens: 32768,
      isFree: true,
    };
  }

  // Google Gemini (FREE — 15 RPM)
  if (process.env.GOOGLE_API_KEY) {
    PROVIDERS['google'] = {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: process.env.GOOGLE_API_KEY,
      models: {
        'gemini-2.0-flash': 'gemini-2.0-flash',
        'gemini-2.5-flash': 'gemini-2.5-flash-preview-05-20',
        'gemini-1.5-pro': 'gemini-1.5-pro',
      },
      defaultModel: 'gemini-2.0-flash',
      maxTokens: 8192,
      isFree: true,
    };
  }

  // OpenRouter (access to many free models)
  if (process.env.OPENROUTER_API_KEY) {
    PROVIDERS['openrouter'] = {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      models: {
        'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct:free',
        'qwen-2.5-72b': 'qwen/qwen-2.5-72b-instruct:free',
        'deepseek-v3': 'deepseek/deepseek-chat-v3-0324:free',
        'gemini-2.0-flash': 'google/gemini-2.0-flash-exp:free',
      },
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      maxTokens: 4096,
      isFree: true,
    };
  }

  // NVIDIA (FREE — Nemotron, DeepSeek, Qwen via build.nvidia.com)
  if (process.env.NVIDIA_API_KEY) {
    PROVIDERS['nvidia'] = {
      name: 'NVIDIA (Free)',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
      models: {
        'nemotron-super-49b': 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        'deepseek-v4-pro': 'deepseek-ai/deepseek-v4-pro',
        'deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash',
        'qwen3.5-122b': 'qwen/qwen3.5-122b-a10b',
        'llama4-maverick': 'meta/llama-4-maverick-17b-128e-instruct',
        'nemotron-ultra-253b': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        'phi-4-mini': 'microsoft/phi-4-mini-instruct',
      },
      defaultModel: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
      maxTokens: 8192,
      isFree: true,
    };
  }

  // Canopywave (Kimi K2.6 — powerful, ~15 days credit)
  if (process.env.CANOPYWAVE_API_KEY) {
    PROVIDERS['canopywave'] = {
      name: 'Canopywave (Kimi)',
      baseUrl: process.env.CANOPYWAVE_API_BASE_URL || 'https://inference.canopywave.io/v1',
      apiKey: process.env.CANOPYWAVE_API_KEY,
      models: {
        'kimi-k2.6': 'moonshotai/kimi-k2.6',
      },
      defaultModel: 'moonshotai/kimi-k2.6',
      maxTokens: 8192,
      isFree: false,
    };
  }

  // Bluesminds (legacy — user's credits)
  if (process.env.BLUESMINDS_API_KEY) {
    PROVIDERS['bluesminds'] = {
      name: 'Bluesminds',
      baseUrl: process.env.BLUESMINDS_API_BASE_URL || 'https://api.bluesminds.ai/v1',
      apiKey: process.env.BLUESMINDS_API_KEY,
      models: {
        'deepseek-v3.2': 'deepseek.v3.2',
      },
      defaultModel: 'deepseek.v3.2',
      maxTokens: 4096,
      isFree: false,
    };
  }
}

// Initialize on import
initProviders();

// ===== MODEL ROUTING =====

export interface LLMConfig {
  model?: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  timeoutMs?: number;
  /** Force free providers only */
  preferFree?: boolean;
  /** External abort signal for overall deadline control */
  signal?: AbortSignal;
}

/** Route to the best available provider+model */
function resolveProvider(config: LLMConfig): { provider: ProviderConfig; model: string } {
  const providerNames = Object.keys(PROVIDERS);
  
  if (providerNames.length === 0) {
    throw new Error('No LLM providers configured. Set at least one API key: GROQ_API_KEY (free), GOOGLE_API_KEY (free), MIMO_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY');
  }

  // Explicit provider requested
  if (config.provider && PROVIDERS[config.provider]) {
    const p = PROVIDERS[config.provider];
    const model = config.model || p.defaultModel;
    return { provider: p, model };
  }

  // Explicit model requested — find which provider has it
  if (config.model) {
    for (const p of Object.values(PROVIDERS)) {
      if (Object.values(p.models).includes(config.model) || p.models[config.model]) {
        return { provider: p, model: config.model };
      }
    }
  }

  // Auto-route: free providers first, then paid
  const freeProviders = providerNames.filter(n => PROVIDERS[n].isFree);
  const paidProviders = providerNames.filter(n => !PROVIDERS[n].isFree);

  if (config.preferFree !== false && freeProviders.length > 0) {
    const p = PROVIDERS[freeProviders[0]];
    return { provider: p, model: p.defaultModel };
  }

  // Use first available
  const p = PROVIDERS[providerNames[0]];
  return { provider: p, model: config.model || p.defaultModel };
}

// ===== RETRY WITH EXPONENTIAL BACKOFF =====

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // If the outer signal is aborted, stop immediately
    if (signal?.aborted) {
      throw new Error('Aborted by deadline');
    }
    
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on auth errors or abort/timeout
      if (lastError.message.includes('401') || lastError.message.includes('403') ||
          lastError.name === 'AbortError' || lastError.message.includes('Aborted')) {
        throw lastError;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        console.log(`[LLM] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError || new Error('All retries exhausted');
}

// ===== TOKEN USAGE TRACKING =====

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: string;
  model: string;
  timestamp: number;
}

const tokenLog: TokenUsage[] = [];

function trackTokens(provider: string, model: string, promptTokens: number, completionTokens: number) {
  tokenLog.push({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    provider,
    model,
    timestamp: Date.now(),
  });
}

export function getTokenUsage(): { total: number; byProvider: Record<string, number>; byModel: Record<string, number>; recent: TokenUsage[] } {
  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  
  for (const entry of tokenLog) {
    byProvider[entry.provider] = (byProvider[entry.provider] || 0) + entry.totalTokens;
    byModel[entry.model] = (byModel[entry.model] || 0) + entry.totalTokens;
  }
  
  return {
    total: tokenLog.reduce((sum, e) => sum + e.totalTokens, 0),
    byProvider,
    byModel,
    recent: tokenLog.slice(-20),
  };
}

// ===== REQUEST DEDUPLICATION =====

const inflightRequests = new Map<string, Promise<string>>();

function requestKey(messages: AgentMessage[], model: string): string {
  const content = messages.map(m => `${m.role}:${m.content.slice(0, 200)}`).join('|');
  return `${model}:${content}`;
}

// ===== MOCK RESPONSES =====

function getMockResponse(messages: AgentMessage[]): string {
  const userMsg = messages.find(m => m.role === 'user')?.content || '';
  const len = userMsg.length;
  
  if (userMsg.toLowerCase().includes('plan') || userMsg.includes('research plan')) {
    return `# Research Plan\n\n## Objectives\n1. Gather comprehensive information\n2. Identify key stakeholders\n3. Analyze current trends\n4. Evaluate conflicting viewpoints\n\n## Methodology\n- Multi-source extraction\n- Cross-reference verification\n- Chain-of-thought reasoning\n- Structured synthesis`;
  }
  
  if (userMsg.toLowerCase().includes('extract') || userMsg.toLowerCase().includes('key facts')) {
    return `## Extracted Information\n\n### Key Facts\n- The topic involves multiple interconnected domains\n- Recent developments show accelerating trends\n- Stakeholder opinions vary significantly\n\n### Data Points\n- Growth rate: 15-20% CAGR\n- Primary adoption in developed markets\n- Regulatory frameworks still evolving`;
  }
  
  if (userMsg.toLowerCase().includes('reason') || userMsg.toLowerCase().includes('analysis')) {
    return `## Reasoning Analysis\n\n### Pattern Recognition\n- Theme A: Technological advancement driving change\n- Theme B: Regulatory frameworks lagging behind innovation\n- Theme C: Economic implications vary by sector\n\n### Causal Analysis\nPrimary drivers → Secondary effects → Tertiary implications\n\n### Confidence Assessment\n- Claim 1: High confidence (multiple sources agree)\n- Claim 2: Medium confidence (mixed evidence)\n- Claim 3: Low confidence (insufficient data)`;
  }
  
  if (userMsg.toLowerCase().includes('report') || userMsg.toLowerCase().includes('synthesize')) {
    return `# Research Report\n\n## 📌 Executive Summary\nBased on comprehensive analysis, this report examines the query through multiple lenses.\n\n## 📊 Key Findings\n\n### 1. Market Landscape\nThe current market demonstrates robust growth with increasing competitive intensity.\n\n### 2. Technical Capabilities\nModern approaches leverage advanced AI models for unprecedented results.\n\n### 3. Challenges\n- Regulatory uncertainty\n- Technical limitations in edge cases\n- Adoption barriers\n\n## ✅ Conclusion\nThe intersection of capabilities and demand creates compelling opportunity.`;
  }
  
  if (userMsg.toLowerCase().includes('quality') || userMsg.toLowerCase().includes('review')) {
    return `## Quality Review\n\n### Accuracy: B+\n- Most claims are well-supported\n- Minor gaps in source diversity\n\n### Completeness: B\n- Core topics covered well\n- Could expand on counter-arguments\n\n### Suggestions\n1. Add more quantitative data\n2. Include opposing viewpoints\n3. Expand methodology section`;
  }
  
  return `Analysis complete. The research indicates complex interdependencies requiring careful consideration of multiple factors.`;
}

// ===== MAIN LLM CLIENT =====

export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  provider: string;
  model: string;
}

/** Non-streaming completion with retry + dedup + fallback */
export async function completion(
  messages: AgentMessage[],
  config: LLMConfig = {}
): Promise<string> {
  const { provider, model } = resolveProvider(config);
  
  // Check mock mode
  if (!provider.apiKey || provider.apiKey === 'demo') {
    return getMockResponse(messages);
  }
  
  // Dedup check
  const key = requestKey(messages, model);
  if (inflightRequests.has(key)) {
    console.log(`[LLM] Dedup: reusing inflight request for ${model}`);
    return inflightRequests.get(key)!;
  }
  
  const timeoutMs = config.timeoutMs || 60000;
  
  const promise = retryWithBackoff(async () => {
    const t = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // If an external signal is provided, propagate its abort to our controller
    const onExternalAbort = () => controller.abort();
    config.signal?.addEventListener('abort', onExternalAbort);
    if (config.signal?.aborted) controller.abort();
    
    try {
      const url = `${provider.baseUrl}/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
          ...(provider.name.includes('OpenRouter') ? {
            'HTTP-Referer': 'https://cerebrum.vercel.app',
            'X-Title': 'Cerebrum Research',
          } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: config.temperature ?? 0.7,
          max_tokens: config.max_tokens ?? provider.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`${provider.name} API ${response.status}: ${errText.slice(0, 200)}`);
      }
      
      // Keep timeout active through body read — only clear after full response
      const data = await response.json();
      clearTimeout(timeoutId);
      config.signal?.removeEventListener('abort', onExternalAbort);
      
      const content = data.choices?.[0]?.message?.content || '';
      const usage = data.usage;
      
      if (usage) {
        trackTokens(provider.name, model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
      }
      
      console.log(`[LLM] ✓ ${provider.name}/${model} ${Date.now()-t}ms ${content.length}c`);
      
      if (content.trim().length < 10) {
        throw new Error('Empty/too short response');
      }
      
      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      config.signal?.removeEventListener('abort', onExternalAbort);
      throw error;
    }
  }, 2, 1500, config.signal);
  
  inflightRequests.set(key, promise);
  
  try {
    return await promise;
  } finally {
    inflightRequests.delete(key);
  }
}

/** Streaming completion with inactivity timeout + external signal support */
export async function* streamCompletion(
  messages: AgentMessage[],
  config: LLMConfig = {}
): AsyncGenerator<string> {
  const { provider, model } = resolveProvider(config);
  
  // Mock mode
  if (!provider.apiKey || provider.apiKey === 'demo') {
    const mock = getMockResponse(messages);
    const words = mock.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      yield words.slice(i, i + 3).join(' ') + ' ';
      await new Promise(r => setTimeout(r, 30));
    }
    return;
  }
  
  const timeoutMs = config.timeoutMs || 60000;
  const INACTIVITY_TIMEOUT = 15000; // 15s with no chunks = abort
  const controller = new AbortController();
  
  // If an external signal is provided, propagate its abort
  const onExternalAbort = () => controller.abort();
  config.signal?.addEventListener('abort', onExternalAbort);
  if (config.signal?.aborted) controller.abort();
  
  // Set initial timeout for connection
  let timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const url = `${provider.baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
        ...(provider.name.includes('OpenRouter') ? {
          'HTTP-Referer': 'https://cerebrum.vercel.app',
          'X-Title': 'Cerebrum Research',
        } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.max_tokens ?? provider.maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });
    
    // Switch to inactivity timeout for the body stream
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), INACTIVITY_TIMEOUT);
    
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`${provider.name} API ${response.status}: ${errText.slice(0, 200)}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    let buffer = '';
    let totalContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Reset inactivity timeout on each chunk
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), INACTIVITY_TIMEOUT);
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              totalContent += content;
              yield content;
            }
            // Track usage from streaming response
            if (data.usage) {
              trackTokens(provider.name, model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    }
    
    clearTimeout(timeoutId);
    config.signal?.removeEventListener('abort', onExternalAbort);
    console.log(`[LLM] ✓ ${provider.name}/${model} (stream) ${totalContent.length}c`);
  } catch (error) {
    clearTimeout(timeoutId);
    config.signal?.removeEventListener('abort', onExternalAbort);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout after ${timeoutMs}ms from ${provider.name}`);
    }
    throw error;
  }
}

// ===== FALLBACK CHAIN =====

/**
 * Try multiple providers in order. First success wins.
 * Useful for critical operations where you want maximum reliability.
 */
export async function completionWithFallback(
  messages: AgentMessage[],
  configs: LLMConfig[]
): Promise<LLMResponse> {
  let lastError: Error | null = null;
  
  for (const config of configs) {
    try {
      const { provider, model } = resolveProvider(config);
      const content = await completion(messages, config);
      return { content, provider: provider.name, model };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[LLM] Fallback: ${config.provider || config.model || 'next'} failed, trying next...`);
    }
  }
  
  throw lastError || new Error('All providers failed');
}

// ===== UTILITIES =====

/** Get list of available providers */
export function getAvailableProviders(): Array<{ name: string; models: string[]; isFree: boolean }> {
  return Object.values(PROVIDERS).map(p => ({
    name: p.name,
    models: Object.keys(p.models),
    isFree: p.isFree,
  }));
}

/** Check if any provider is configured */
export function hasProviders(): boolean {
  return Object.keys(PROVIDERS).length > 0;
}

// Backward compatibility
export const MODELS = {
  MIMO_PRO: 'mimo-v2.5-pro',
  MIMO_OMNI: 'mimo-v2-omni',
  MIMO_FLASH: 'mimo-v2-flash',
  BLUESMINDS_DEEPSEEK: 'deepseek.v3.2',
} as const;

export const ACTIVE_MODEL = process.env.ACTIVE_MODEL || 'mimo-v2.5-pro';
export { PROVIDERS };
