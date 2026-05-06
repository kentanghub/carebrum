'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentState, StreamEvent, ResearchRequest } from '@/types';
import { AgentNode } from './AgentNode';
import { Send, Sparkles, Zap, BookOpen, FileText, Loader2, Download, Brain, Eye } from 'lucide-react';

const DEPTH_OPTIONS = [
  { value: 'quick', label: 'Quick Scan', desc: 'Fast overview (~30s)', icon: <Zap className="w-4 h-4" /> },
  { value: 'standard', label: 'Standard', desc: 'Balanced depth (~2min)', icon: <BookOpen className="w-4 h-4" /> },
  { value: 'deep', label: 'Deep Research', desc: 'Thorough analysis (~5min)', icon: <Sparkles className="w-4 h-4" /> },
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
  const abortRef = useRef<AbortController | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const runResearch = async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setReport('');
    setLogs([]);
    setAgents([]);
    setActiveAgent(null);

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
              // Skip malformed events
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
        setAgents(prev => prev.map(a => 
          a.id === event.agentId ? { ...a, status: 'running' } : a
        ));
        setActiveAgent(event.agentId || null);
        if (event.message) addLog(`${event.agentId}: ${event.message}`);
        break;

      case 'agent_update':
        if (event.message) {
          addLog(`${event.agentId}: ${event.message.substring(0, 100)}...`);
        }
        break;

      case 'agent_complete':
        setAgents(prev => prev.map(a => 
          a.id === event.agentId ? { ...a, status: 'completed', output: event.data } : a
        ));
        if (event.message) addLog(`${event.agentId}: Completed`);
        break;

      case 'report':
        setReport(event.data || '');
        addLog('Report generated successfully');
        break;

      case 'error':
        addLog(`Error: ${event.message}`);
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
    a.download = `research-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Cerebrum
              </h1>
              <p className="text-xs text-gray-500">Multi-Agent Research System</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-blue-50 rounded-full">Powered by MiMo</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Input */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Research Query</h2>
              
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your research topic... e.g., 'Impact of AI on climate change mitigation strategies'"
                className="w-full h-32 p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none text-sm"
                disabled={isRunning}
              />

              <div className="mt-4">
                <label className="text-xs font-medium text-gray-700 mb-2 block">Research Depth</label>
                <div className="space-y-2">
                  {DEPTH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setDepth(option.value as any)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        depth === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                      disabled={isRunning}
                    >
                      <div className={depth === option.value ? 'text-blue-600' : 'text-gray-400'}>
                        {option.icon}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-gray-500">{option.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multimodal}
                    onChange={(e) => setMultimodal(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    disabled={isRunning}
                  />
                  <span className="text-sm text-gray-700">Enable Multimodal Analysis</span>
                  <span className="text-xs text-gray-400">(Omni model)</span>
                </label>
              </div>

              <button
                onClick={isRunning ? stopResearch : runResearch}
                className={`w-full mt-4 py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                  isRunning
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg hover:shadow-blue-200'
                }`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Stop Research
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Start Research
                  </>
                )}
              </button>
            </div>

            {/* System Logs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3 text-sm">System Logs</h2>
              <div className="h-48 overflow-y-auto text-xs font-mono space-y-1 bg-gray-50 rounded-xl p-3">
                {logs.length === 0 ? (
                  <span className="text-gray-400">Waiting to start...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="text-gray-600 break-all">{log}</div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Middle Panel - Agent Flow */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Agent Collaboration</h2>
              <div className="space-y-3">
                <AnimatePresence>
                  {agents.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Agents will appear here when research starts</p>
                    </div>
                  ) : (
                    agents.map((agent) => (
                      <AgentNode
                        key={agent.id}
                        agent={agent}
                        isActive={activeAgent === agent.id}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right Panel - Output */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Research Report</h2>
                {report && (
                  <button
                    onClick={downloadReport}
                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                )}
              </div>
              
              <div className="prose prose-sm max-w-none">
                {report ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report}
                  </ReactMarkdown>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Your research report will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Brain className="w-6 h-6 text-blue-600" />}
            title="Chain-of-Thought Reasoning"
            description="Deep reasoning with MiMo-V2-Pro for complex problem analysis"
          />
          <FeatureCard
            icon={<Eye className="w-6 h-6 text-purple-600" />}
            title="Multimodal Understanding"
            description="Process text, images, audio, and video with MiMo-V2-Omni"
          />
          <FeatureCard
            icon={<Sparkles className="w-6 h-6 text-green-600" />}
            title="Multi-Agent Collaboration"
            description="Specialized agents work together for comprehensive research"
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="p-3 bg-gray-50 rounded-xl w-fit mb-4">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
