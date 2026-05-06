'use client';

interface LogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export default function Logo({ className = '', size = 40, animated = false }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="logoGradient2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        {animated && (
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      
      {/* Outer brain silhouette / C shape */}
      <path
        d="M50 8 C28 8 10 26 10 50 C10 74 28 92 50 92 C72 92 90 74 90 50"
        stroke="url(#logoGradient)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        filter={animated ? 'url(#glow)' : undefined}
      />
      
      {/* Neural nodes */}
      <circle cx="50" cy="25" r="5" fill="url(#logoGradient)" />
      <circle cx="30" cy="40" r="4" fill="url(#logoGradient2)" />
      <circle cx="70" cy="40" r="4" fill="url(#logoGradient2)" />
      <circle cx="35" cy="60" r="4.5" fill="url(#logoGradient)" />
      <circle cx="65" cy="60" r="4.5" fill="url(#logoGradient)" />
      <circle cx="50" cy="75" r="5" fill="url(#logoGradient2)" />
      <circle cx="50" cy="50" r="6" fill="url(#logoGradient)" opacity="0.9" />
      
      {/* Neural connections */}
      <line x1="50" y1="25" x2="30" y2="40" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.6" />
      <line x1="50" y1="25" x2="70" y2="40" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.6" />
      <line x1="50" y1="25" x2="50" y2="50" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.6" />
      <line x1="30" y1="40" x2="35" y2="60" stroke="url(#logoGradient2)" strokeWidth="2" opacity="0.5" />
      <line x1="70" y1="40" x2="65" y2="60" stroke="url(#logoGradient2)" strokeWidth="2" opacity="0.5" />
      <line x1="30" y1="40" x2="50" y2="50" stroke="url(#logoGradient2)" strokeWidth="2" opacity="0.5" />
      <line x1="70" y1="40" x2="50" y2="50" stroke="url(#logoGradient2)" strokeWidth="2" opacity="0.5" />
      <line x1="35" y1="60" x2="50" y2="50" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.5" />
      <line x1="65" y1="60" x2="50" y2="50" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.5" />
      <line x1="35" y1="60" x2="50" y2="75" stroke="url(#logoGradient2)" strokeWidth="2" opacity="0.5" />
      <line x1="65" y1="60" x2="50" y2="75" stroke="url(#logoGradient2)" strokeWidth="2" opacity="0.5" />
      <line x1="50" y1="50" x2="50" y2="75" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}
