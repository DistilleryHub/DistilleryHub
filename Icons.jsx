// Minimal, dependency-free line icons (24x24, currentColor stroke).
// Keeps the app's package.json lean — no icon library install required.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

export function IconBell({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconStar({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function IconHome({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </svg>
  );
}

export function IconUsers({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 8.2a3 3 0 1 1 3.3 4.5" />
      <path d="M16 14.2c2.6.4 4.7 2.5 5 5.8" />
    </svg>
  );
}

export function IconMessage({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function IconMenu({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function IconSearch({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconSend({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function IconMaximize({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconMinimize({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function IconPlaySquare({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <polygon points="10 8.5 16 12 10 15.5 10 8.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconVolume({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polygon points="4 9 8 9 13 4 13 20 8 15 4 15 4 9" />
      <path d="M17 8a5 5 0 0 1 0 8" />
      <path d="M19.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function IconVolumeMute({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polygon points="4 9 8 9 13 4 13 20 8 15 4 15 4 9" />
      <line x1="17" y1="9" x2="22" y2="14" />
      <line x1="22" y1="9" x2="17" y2="14" />
    </svg>
  );
}

export function IconThumbsUp({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <path d="M11 21h6.5a2 2 0 0 0 2-1.6l1.3-7A2 2 0 0 0 18.8 10H14l1-5.5a1.7 1.7 0 0 0-3-1.3L7 10H3v11h4" />
    </svg>
  );
}

export function IconComment({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconRepeat({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function IconPhone({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.85.55 2.81.68A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function IconBookmark({ className = 'w-4 h-4', filled = false }) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconPlus({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconX({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconLock({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconEye({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconBriefcase({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

export function IconFolder({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconPalette({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.2 4.2 0 0 0 21.5 11 9.9 9.9 0 0 0 12 2z" />
      <circle cx="6.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconGlobe({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function IconShield({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
    </svg>
  );
}

export function IconUser({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function IconMic({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function IconMicOff({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M9 9v3a3 3 0 0 0 4.6 2.5" />
      <path d="M15 8V5a3 3 0 0 0-5.9-.7" />
      <path d="M5 11a7 7 0 0 0 10.7 5.9" />
      <path d="M19 11a7 7 0 0 1-.4 2.3" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function IconVideo({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

export function IconVideoOff({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
      <path d="M9.5 5H14a2 2 0 0 1 2 2v3.5" />
      <polygon points="23 7 16 12 23 17 23 7" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function IconRefreshCw({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

export function IconEdit({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function IconTrash({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconMapPin({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function IconCornerUpLeft({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

export function IconCornerUpRight({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

export function IconSmile({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

export function IconCopy({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconMoreVertical({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function IconCamera({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function IconClock({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function IconShoppingCart({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
    </svg>
  );
}

export function IconGraduationCap({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </svg>
  );
}

export function IconNewspaper({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <line x1="7" y1="8" x2="14" y2="8" />
      <line x1="7" y1="12" x2="14" y2="12" />
      <line x1="7" y1="16" x2="11" y2="16" />
      <path d="M19 8h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}

export function IconImage({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function IconFileText({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

export function IconBan({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  );
}

export function IconCheck({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconCheckCheck({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="18 6 7 17 2 12" />
      <polyline points="22 6 11 17 9.5 15.5" />
    </svg>
  );
}

export function IconFlask({ className = 'w-6 h-6' }) {
  return (
    <svg {...base} className={className}>
      <path d="M9 2h6" />
      <path d="M10 2v6.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2" />
      <line x1="7.5" y1="14" x2="16.5" y2="14" />
    </svg>
  );
}

export function IconAlertTriangle({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconStore({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function IconFlag({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 22V4a1 1 0 0 1 1-1h13l-2.5 5 2.5 5H6a1 1 0 0 0-1 1v8" />
    </svg>
  );
}

export function IconTrash2({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function IconUpload({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function IconVerified({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className} fill="currentColor" stroke="none">
      <path d="M12 2l2.4 1.2 2.6-.4 1.4 2.3 2.3 1.4-.4 2.6L21.5 12l-1.2 2.4.4 2.6-2.3 1.4-1.4 2.3-2.6-.4L12 21.5l-2.4-1.2-2.6.4-1.4-2.3-2.3-1.4.4-2.6L2.5 12l1.2-2.4-.4-2.6 2.3-1.4 1.4-2.3 2.6.4z" />
      <polyline points="8.5 12 11 14.5 16 9" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function IconCrown({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className} fill="currentColor" stroke="none">
      <path d="M3 8l4 3 5-6 5 6 4-3-1.5 10h-15z" />
    </svg>
  );
}

export function IconBellOff({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      <path d="M18 8a6 6 0 0 0-9.3-5" />
      <path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8c0 2.5.5 4.2 1.1 5.5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function IconArrowUpRight({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

export function IconArrowDownLeft({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <line x1="17" y1="7" x2="7" y2="17" />
      <polyline points="17 17 7 17 7 7" />
    </svg>
  );
}

export function IconChevronUp({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function IconBarChart({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

export function IconCalendar({ className = 'w-5 h-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
