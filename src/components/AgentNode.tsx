'use client';

import { motion } from 'framer-motion';
import { AgentState } from '@/types';
import { Brain, Eye, GitBranch, FileText, CheckCircle, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  Brain: <Brain className="w-5 h-5" />,
  Eye: <Eye className="w-5 h-5" />,
  GitBranch: <GitBranch className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  CheckCircle: <CheckCircle className="w-5 h-5" />,
};

const statusConfig = {
  idle: { color: 'bg-gray-100 text-gray-500', icon: null },
  running: { color: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed: { color: 'bg-green-50 text-green-600 border-green-200', icon: <CheckCircle2 className="w-4 h-4" /> },
  error: { color: 'bg-red-50 text-red-600 border-red-200', icon: <AlertCircle className="w-4 h-4" /> },
};

interface AgentNodeProps {
  agent: AgentState;
  isActive: boolean;
}

export function AgentNode({ agent, isActive }: AgentNodeProps) {
  const status = statusConfig[agent.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
        isActive ? 'border-blue-500 shadow-lg shadow-blue-100' : 'border-gray-200'
      } ${status.color}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
          {iconMap[agent.icon] || <Brain className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">{agent.name}</h3>
            {status.icon}
          </div>
          <p className="text-xs mt-1 opacity-80">{agent.description}</p>
          {agent.model && (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-white/60 font-mono">
              {agent.model}
            </span>
          )}
        </div>
      </div>

      {isActive && agent.status === 'running' && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-blue-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {agent.startTime && agent.endTime && (
        <div className="mt-2 text-xs opacity-60">
          Duration: {((agent.endTime - agent.startTime) / 1000).toFixed(1)}s
        </div>
      )}
    </motion.div>
  );
}
