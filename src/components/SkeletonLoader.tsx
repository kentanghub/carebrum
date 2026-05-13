'use client';

import { motion } from 'framer-motion';

interface SkeletonLoaderProps {
  count?: number;
}

export default function SkeletonLoader({ count = 5 }: SkeletonLoaderProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="glass rounded-xl p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/[0.04]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 bg-white/[0.04] rounded" />
              <div className="h-2.5 w-48 bg-white/[0.03] rounded" />
            </div>
            <div className="w-12 h-4 bg-white/[0.03] rounded-full" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
