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
    color: 'from-violet-500 to-purple-500',
  },
  {
    value: 'deep',
    label: 'Deep Research',
    desc: 'Thorough analysis ~5min',
    icon: <Telescope className="w-4 h-4" />,
    color: 'from-pink-500 to-rose-500',
  },
];

const SAMPLE_QUERIES = [
  'Impact of generative AI on software development in 2025',
  'Sustainable energy adoption barriers in Southeast Asia',
  'The future of decentralized finance and regulatory challenges',
  'Quantum computing applications in pharmaceutical drug discovery',
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
    setLogs((prev) => [...prev.slice(-40), message]);
  }, []);

  const runResearch = async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setReport('');
    setLogs([]);
    setAgents([]);
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

      if (!response.ok) throw new Error('Failed to start research');

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
      if (error instanceof Error && error.name !== 'AbortError') {
        addLog(`Error: ${error.message}`);
      }
    } finally {
      setIsRunning(false);
      setActiveAgent(null);
    }
  };

  const handleEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'agent_start':
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agentId ? { ...a, status: 'running' } : a
          )
        );
        setActiveAgent(event.agentId || null);
        if (event.message) addLog(`→ ${event.agentId}: ${event.message}`);
        break;

      case 'agent_update':
        if (event.message) {
          addLog(`  ${event.message.substring(0, 80)}...`);
        }
        break;

      case 'agent_complete':
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agentId
              ? { ...a, status: 'completed', output: event.data }
              : a
          )
        );
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
    a.download = `cerebrum-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = agents.filter((a) => a.status === 'completed').length;
  const totalCount = 5;
  const progress = agents.length > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="relative min-h-screen bg-[#030308] text-gray-200 overflow-x-hidden">
      <NeuralBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.04] backdrop-blur-xl bg-[#030308]/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} animated />
            <div>
              <h1 className="font-bold text-lg gradient-text tracking-tight">
                Cerebrum
              </h1>
              <p className="text-[10px] text-gray-500 -mt-0.5 tracking-wide uppercase">
                Multi-Agent Research System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-gray-500 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.04]">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Powered by MiMo
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
                Research Query
              </label>
              <div className="relative">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What would you like to research? Try: 'Impact of generative AI on software development jobs in 2025'"
                  className="w-full h-28 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 resize-none text-sm text-gray-200 placeholder:text-gray-600 transition-all outline-none"
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
              <div className="grid grid-cols-3 gap-3">
                {DEPTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDepth(option.value as any)}
                    disabled={isRunning}
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-300 ${
                      depth === option.value
                        ? 'border-indigo-500/30 bg-indigo-500/[0.08] shadow-[0_0_20px_rgba(99,102,241,0.1)]'
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
                            ? 'text-indigo-300'
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
                        className="absolute inset-0 rounded-xl ring-1 ring-indigo-500/20"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Multimodal toggle + Action button */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    multimodal ? 'bg-indigo-500' : 'bg-white/[0.06]'
                  }`}
                  onClick={() => !isRunning && setMultimodal(!multimodal)}
                >
                  <motion.div
                    className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                    animate={{ x: multimodal ? 16 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
                <span className="text-xs text-gray-400">
                  Multimodal Analysis
                </span>
                <span className="text-[10px] text-gray-600">(Omni)</span>
              </label>

              <motion.button
                onClick={isRunning ? stopResearch : runResearch}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isRunning
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                    : 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30'
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
            <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        )}

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Agents */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit className="w-4 h-4 text-indigo-400" />
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
              <div className="glass rounded-xl p-3 h-40 overflow-y-auto font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0 ? (
                  <span className="text-gray-600">Waiting...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="text-gray-400 break-all">
                      <span className="text-gray-600">{log}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Center: Visualization */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-gray-300">
                Pipeline
              </h2>
            </div>
            <div className="glass rounded-xl p-4 min-h-[400px] flex flex-col items-center justify-center">
              {agents.length === 0 ? (
                <div className="text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-pulse" />
                    <div className="absolute inset-2 rounded-full bg-indigo-500/5" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      <BrainCircuit className="w-8 h-8 text-indigo-400/50" />
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
                <div className="w-full space-y-0">
                  {agents.map((agent, i) => (
                    <div key={agent.id} className="flex flex-col items-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.15 }}
                        className={`relative w-12 h-12 rounded-full flex items-center justify-center ${
                          agent.status === 'running'
                            ? 'bg-indigo-500/20 ring-2 ring-indigo-500/40'
                            : agent.status === 'completed'
                            ? 'bg-emerald-500/20 ring-2 ring-emerald-500/40'
                            : 'bg-white/[0.03] ring-1 ring-white/[0.06]'
                        }`}
                      >
                        {agent.status === 'running' && (
                          <span className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
                        )}
                        <span
                          className={`relative text-xs font-bold ${
                            agent.status === 'running'
                              ? 'text-indigo-300'
                              : agent.status === 'completed'
                              ? 'text-emerald-300'
                              : 'text-gray-600'
                          }`}
                        >
                          {i + 1}
                        </span>
                      </motion.div>
                      <p className="text-[10px] text-gray-500 mt-1.5 text-center">
                        {agent.name.split(' ')[0]}
                      </p>
                      {i < agents.length - 1 && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 32 }}
                          transition={{ delay: i * 0.15 + 0.2 }}
                          className="w-px bg-gradient-to-b from-white/[0.08] to-white/[0.02] my-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Report */}
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-gray-300">
                  Research Report
                </h2>
              </div>
              {report && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={downloadReport}
                  className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                >
                  <Download className="w-3 h-3" />
                  Download .md
                </motion.button>
              )}
            </div>

            <div className="glass rounded-xl min-h-[500px] overflow-hidden">
              {report ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 prose-invert text-sm overflow-y-auto max-h-[700px]"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report}
                  </ReactMarkdown>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[500px] text-center p-8">
                  <div className="relative w-16 h-16 mb-4">
                    <div className="absolute inset-0 rounded-full border border-white/[0.04]" />
                    <div className="absolute inset-0 rounded-full border border-t-indigo-500/20 animate-spin" />
                    <div className="absolute inset-3 rounded-full bg-white/[0.02] flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-600" />
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
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-white/[0.04] text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Logo size={24} />
            <span className="text-sm font-semibold gradient-text">Cerebrum</span>
          </div>
          <p className="text-[10px] text-gray-600">
            Multi-Agent Research System • Built for Xiaomi MiMo Orbit 100T
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a
              href="https://github.com/kentanghub/carebrum"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Code2 className="w-3 h-3" />
              GitHub
            </a>
            <a
              href="https://platform.xiaomimimo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              MiMo Platform
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
