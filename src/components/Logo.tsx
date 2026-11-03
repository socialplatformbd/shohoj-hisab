export function Logo({ size = 72, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="সহজ হিসাব">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#lg-bg)" />
      <rect x="96" y="168" width="320" height="226" rx="40" fill="#ffffff" />
      <path d="M96 208c0-22 18-40 40-40h200c22 0 40 18 40 40v14H96z" fill="#a7f3d0" />
      <rect x="318" y="262" width="126" height="76" rx="38" fill="#047857" />
      <circle cx="356" cy="300" r="14" fill="#fde68a" />
      <rect x="140" y="258" width="26" height="86" rx="8" fill="#10b981" />
      <rect x="182" y="232" width="26" height="112" rx="8" fill="#059669" />
      <rect x="224" y="282" width="26" height="62" rx="8" fill="#34d399" />
      <circle cx="400" cy="152" r="52" fill="#fbbf24" />
      <circle cx="400" cy="152" r="38" fill="none" stroke="#b45309" strokeWidth="8" />
      <path d="M382 152l12 13 24-28" fill="none" stroke="#b45309" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
