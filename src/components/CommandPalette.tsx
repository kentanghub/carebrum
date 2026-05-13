'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Download, History, Copy, X, Keyboard } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  const filtered = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && filtered.length > 0) {
      filtered[0].action();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
          >
            <div className="glass-strong rounded-2xl border border-white/[0.06] shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 p-4 border-b border-white/[0.04]">
                <Search className="w-5 h-5 text-gray-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command..."
                  className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-600 outline-none"
                />
                <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500 border border-white/[0.06]">ESC</kbd>
              </div>

              {/* Commands list */}
              <div className="max-h-64 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No commands found</p>
                ) : (
                  filtered.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => { cmd.action(); onClose(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] text-left transition-colors group"
                    >
                      <span className="text-gray-500 group-hover:text-green-400 transition-colors">{cmd.icon}</span>
                      <span className="flex-1 text-sm text-gray-300 group-hover:text-gray-100 transition-colors">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500 border border-white/[0.06] font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
