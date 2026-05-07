'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentState, StreamEvent, ResearchRequest } from '@/types';
import AgentNode from './AgentNode';
import Logo from './Logo';
import NeuralBackground from './NeuralBackground';
import {
  Sparkles,
  Zap,
  BookOpen,
  Telescope,
  Loader2,
  Download,
  Terminal,
  Play,
  Square,
  ExternalLink,
  CheckCircle2,
  BrainCircuit,
  Code2,
  FileText,
} from 'lucide-react';

const DEPTH_OPTIONS = [
  {
    value: 'quick',
    label: 'Quick Scan',
    desc: 'Overview in ~30s',
    icon: <Zap className="w-4 h-4" />,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    value: 'standard',
    label: 'Standard',
    desc: 'Balanced depth ~2min',
    icon: <BookOpen className="w-4 h-4" />,
    color: 'from-emerald-500 to-green-500',
  },
  {
    value: 'deep',
    label: 'Deep Research',
    desc: 'Thorough analysis ~5min',
    icon: <Telescope className="w-4 h-4" />,
    color: 'from-green-500 to-lime-500',
  },
];

const SAMPLE_QUERIES = [
  'Impact of generative AI on software development in 2025',
  'Sustainable energy adoption barriers in Southeast Asia',
  'The future of decentralized finance and regulatory challenges',
  'Quantum computing applications in pharmaceutical drug discovery',
];

// Default agent definitions for frontend initialization
const DEFAULT_AGENTS: AgentState[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator Agent',
    status: 'idle',
    description: 'Analyzes query and plans research strategy',
    icon: 'Brain',
    messages: [],
  },
  {
    id: 'multimodal_extractor',
    name: 'Multimodal Extractor',
    status: 'idle',
    description: 'Extracts and enriches information from multiple sources',
    icon: 'Eye',
    messages: [],
  },
  {
    id: 'reasoning_engine',
    name: 'Reasoning Engine',
    status: 'idle',
    description: 'Performs deep chain-of-thought reasoning and verification',
    icon: 'GitBranch',
    messages: [],
  },
  {
    id: 'synthesizer',
    name: 'Report Synthesizer',
    status: 'idle',
    description: 'Synthesizes findings into comprehensive report',
    icon: 'FileText',
    messages: [],
  },
  {
    id: 'critic',
    name: 'Quality Critic',
    status: 'idle',
    description: 'Reviews and refines final output for accuracy',
    icon: 'CheckCircle',
    messages: [],
  },
];

export default function ResearchDashboard() {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [multimodal, setMultimodal] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [report, setReport] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev.slice(-100), message]);
  }, []);

  const runResearch = async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setReport('');
    setLogs([]);
    setAgents(DEFAULT_AGENTS.map(a => ({ ...a }))); // Initialize agents
    setActiveAgent(null);
    setShowReport(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const request: ResearchRequest = { query, depth, multimodal };

      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Failed to start research: ${response.status} ${response.statusText}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || line.includes('[DONE]')) continue;
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch {
              // skip
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        addLog('✗ Research cancelled by user');
        // Show whatever partial report we have
        if (!showReport && agents.some(a => a.status === 'completed')) {
          const partial = agents
            .filter(a => a.output && a.status === 'completed')
            .map(a => `### ${a.name}\n\n${a.output}`)
            .join('\n\n---\n\n');
          if (partial) {
            setReport(`# Partial Research Report\n\n*Research was cancelled before completion. Below are results from agents that finished.*\n\n${partial}`);
            setShowReport(true);
          }
        }
      } else if (error instanceof Error) {
        const errMsg = error.message || 'Unknown error occurred';
        addLog(`✗ Error: ${errMsg}`);
        console.error('Research error:', error);
        // Show partial report on error too
        const completedAgents = agents.filter(a => a.output && a.status === 'completed');
        if (completedAgents.length > 0 && !showReport) {
          const partial = completedAgents
            .map(a => `### ${a.name}\n\n${a.output}`)
            .join('\n\n---\n\n');
          setReport(`# Partial Research Report\n\n*An error occurred: ${errMsg}. Below are results from agents that completed successfully.*\n\n${partial}`);
          setShowReport(true);
        }
      }
    } finally {
      setIsRunning(false);
      setActiveAgent(null);
    }
  };

  const handleEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'agent_start':
        setAgents((prev) => {
          const exists = prev.find((a) => a.id === event.agentId);
          if (exists) {
            return prev.map((a) =>
              a.id === event.agentId ? { ...a, status: 'running' } : a
            );
          }
          // Add agent if not exists
          const defaultAgent = DEFAULT_AGENTS.find((a) => a.id === event.agentId);
          if (defaultAgent) {
            return [...prev, { ...defaultAgent, status: 'running' }];
          }
          return prev;
        });
        setActiveAgent(event.agentId || null);
        if (event.message) addLog(`→ ${event.agentId}: ${event.message}`);
        break;

      case 'agent_update':
        if (event.message) {
          const cleanMsg = event.message.replace(/\n/g, ' ').trim();
          if (cleanMsg.length > 5) {
            addLog(`  ${cleanMsg.substring(0, 120)}${cleanMsg.length > 120 ? '...' : ''}`);
          }
        }
        break;

      case 'agent_complete':
        setAgents((prev) => {
          const exists = prev.find((a) => a.id === event.agentId);
          if (exists) {
            return prev.map((a) =>
              a.id === event.agentId
                ? { ...a, status: 'completed', output: event.data }
                : a
            );
          }
          const defaultAgent = DEFAULT_AGENTS.find((a) => a.id === event.agentId);
          if (defaultAgent) {
            return [...prev, { ...defaultAgent, status: 'completed', output: event.data }];
          }
          return prev;
        });
        if (event.message) addLog(`✓ ${event.agentId}: completed`);
        break;

      case 'report':
        setReport(event.data || '');
        setShowReport(true);
        addLog('✓ Report generated');
        break;

      case 'error':
        addLog(`✗ Error: ${event.message}`);
        break;
    }
  };

  const stopResearch = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = query
      .replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g, '')
      .trim()
      .slice(0, 50) || 'research';
    a.download = `carebrum-${safeName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = agents.filter((a) => a.status === 'completed').length;
  const totalCount = 5;
  const progress = agents.length > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="relative min-h-screen bg-[#030806] text-gray-200 overflow-x-hidden">
      <NeuralBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.04] backdrop-blur-xl bg-[#030806]/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} animated />
            <div>
              <h1 className="font-bold text-lg text-green-400 tracking-tight drop-shadow-sm">
                Carebrum
              </h1>
              <p className="text-[10px] text-gray-400 -mt-0.5 tracking-wide uppercase">
                Multi-Agent Research System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-gray-400 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.04]">
              <Sparkles className="w-3 h-3 text-green-400" />
              Powered by AI
            </span>
            <a
              href="https://github.com/kentanghub/carebrum"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors"
            >
              <Code2 className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {/* Hero / Input Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="glass-strong rounded-2xl p-6 sm:p-8">
            {/* Input Area */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Ask Anything
              </label>
              <div className="relative">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Any question, any topic — from global politics to local policy. Try: 'What's the future of AI?' or 'Is nuclear energy making a comeback?'"
                  className="w-full h-20 sm:h-28 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 resize-none text-sm text-gray-200 placeholder:text-gray-600 transition-all outline-none"
                  disabled={isRunning}
                />
                <div className="absolute bottom-3 right-3 text-[10px] text-gray-600 font-mono">
                  {query.length} chars
                </div>
              </div>
            </div>

            {/* Quick suggestions */}
            {!query && !isRunning && (
              <div className="mb-5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                  Try asking
                </p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_QUERIES.map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuery(q)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:text-gray-200 hover:border-white/[0.08] hover:bg-white/[0.05] transition-all"
                    >
                      {q.length > 50 ? q.slice(0, 50) + '...' : q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Depth Selector */}
            <div className="mb-5">
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                Research Depth
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DEPTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => !isRunning && setDepth(option.value as any)}
                    disabled={isRunning}
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-300 ${
                      depth === option.value
                        ? 'border-green-500/30 bg-green-500/[0.08] shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                        : 'border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08] hover:bg-white/[0.03]'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-md bg-gradient-to-br ${option.color} text-white`}
                    >
                      {option.icon}
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-xs font-medium ${
                          depth === option.value
                            ? 'text-green-300'
                            : 'text-gray-300'
                        }`}
                      >
                        {option.label}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {option.desc}
                      </div>
                    </div>
                    {depth === option.value && (
                      <motion.div
                        layoutId="depth-indicator"
                        className="absolute inset-0 rounded-xl ring-1 ring-green-500/20"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Action button */}
            <div className="flex justify-end">
              <motion.button
                onClick={isRunning ? stopResearch : runResearch}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isRunning
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                    : !query.trim()
                    ? 'bg-white/[0.03] text-gray-500 border border-white/[0.04] cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:shadow-green-500/30'
                }`}
              >
                {isRunning ? (
                  <>
                    <Square className="w-4 h-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Research
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Progress Bar */}
        {isRunning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6"
          >
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
              <span>Research Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        )}

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Agents — order 2 on mobile, 1 on desktop */}
          <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit className="w-4 h-4 text-green-400" />
              <h2 className="text-sm font-semibold text-gray-300">
                Agent Swarm
              </h2>
              {agents.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-gray-500 font-mono">
                  {completedCount}/{totalCount}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {agents.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="glass rounded-xl p-8 text-center"
                  >
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/[0.03] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-500">
                      Agents will appear here
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      Start a research query above
                    </p>
                  </motion.div>
                ) : (
                  agents.map((agent, i) => (
                    <AgentNode
                      key={agent.id}
                      agent={agent}
                      isActive={activeAgent === agent.id}
                      index={i}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Logs */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 text-gray-500" />
                <h3 className="text-[10px] text-gray-500 uppercase tracking-wider">
                  System Logs
                </h3>
              </div>
              <div className="glass rounded-xl p-3 h-52 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1">
                {logs.length === 0 ? (
                  <span className="text-gray-400">Waiting...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="text-gray-200 break-all">
                      <span className="text-gray-100">{log}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Center: Pipeline — order 3 on mobile, 2 on desktop */}
          <div className="lg:col-span-3 order-3 lg:order-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-gray-300">
                Pipeline
              </h2>
            </div>
            <div className="glass rounded-xl p-4 min-h-[80px] lg:min-h-[400px] flex flex-col items-center justify-center">
              {agents.length === 0 ? (
                <div className="text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                    <div className="absolute inset-2 rounded-full bg-green-500/5" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      <BrainCircuit className="w-8 h-8 text-green-400/50" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Research pipeline visualization
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Will show agent connections
                  </p>
                </div>
              ) : (
                <div className="w-full flex flex-row lg:flex-col items-center justify-center gap-0">
                  {agents.map((agent, i) => (
                    <div key={agent.id} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: i * 0.15 }}
                          className={`relative w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center ${
                            agent.status === 'running'
                              ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30'
                              : agent.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-white/[0.03] text-gray-600'
                          }`}
                        >
                          {agent.status === 'running' && (
                            <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                          )}
                          {agent.status === 'completed' && (
                            <CheckCircle2 className="w-4 h-4 lg:w-5 lg:h-5" />
                          )}
                          {agent.status === 'idle' && (
                            <span className="text-[10px] lg:text-xs font-mono">{i + 1}</span>
                          )}
                        </motion.div>
                        <span className="text-[9px] lg:text-[10px] text-gray-500 mt-1 text-center max-w-[60px] lg:max-w-[80px] leading-tight">
                          {agent.name.split(' ')[0]}
                        </span>
                      </div>
                      {i < agents.length - 1 && (
                        <motion.div
                          initial={{ width: 0, height: 0 }}
                          animate={{ width: 24, height: 2 }}
                          className={`mx-1 lg:hidden ${
                            agent.status === 'completed'
                              ? 'bg-emerald-500/40'
                              : 'bg-white/[0.04]'
                          }`}
                        />
                      )}
                      {i < agents.length - 1 && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 24 }}
                          transition={{ delay: i * 0.15 + 0.1 }}
                          className={`w-0.5 my-1 hidden lg:block ${
                            agent.status === 'completed'
                              ? 'bg-emerald-500/40'
                              : 'bg-white/[0.04]'
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Report — order 1 on mobile, 3 on desktop */}
          <div className="lg:col-span-5 order-1 lg:order-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                <h2 className="text-sm font-semibold text-gray-300">
                  Research Report
                </h2>
              </div>
              {report && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadReport}
                    className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-green-400 transition-colors px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:border-green-500/20"
                  >
                    <Download className="w-3 h-3" />
                    Download MD
                  </button>
                </div>
              )}
            </div>
            <div className="glass rounded-xl p-5 min-h-[400px]">
              {!showReport || !report ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      <FileText className="w-8 h-8 text-green-400/50" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Your research report will appear here
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1 max-w-[200px]">
                    Start a research query and watch the agents collaborate in
                    real-time
                  </p>
                </div>
              ) : (
                <div id="report-content" className="prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-white/[0.04] text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Logo size={24} />
            <span className="text-sm font-semibold text-green-400">Carebrum</span>
          </div>
          <p className="text-[10px] text-gray-500">
            Multi-Agent Research System • Powered by AI
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a
              href="https://github.com/kentanghub/carebrum"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors"
            >
              <Code2 className="w-3 h-3" />
              GitHub
            </a>
            <a
              href="https://carebrum.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Live Demo
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
