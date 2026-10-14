import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function RoutineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 2h5" />
      <path d="M10 2v3.3l-2.3 2.8A3 3 0 0 0 7 10v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9a3 3 0 0 0-.7-1.9L14 5.3V2" />
      <path d="M7 14h10" />
    </svg>
  );
}

export function ShopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 7h12l1 13H5z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function AdvisorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="11" rx="2.5" />
      <path d="M8.5 16L6.5 20v-4" />
    </svg>
  );
}

export function ProgressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 17l5-5 4 4 7-8" />
      <path d="M15 8h4v4" />
    </svg>
  );
}

export function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4v4.5h4.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function ClearChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function MicrophoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4h2l2.2 11.6a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}

export function RobotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v2.5" />
      <circle cx="12" cy="2.3" r="1" fill="currentColor" stroke="none" />
      <rect x="5" y="5.5" width="14" height="11" rx="3.5" />
      <circle cx="9.3" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 19v1.5" />
      <path d="M15 19v1.5" />
    </svg>
  );
}

export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20l16-8L4 4l2 7.5L4 20z" strokeLinejoin="round" />
      <path d="M6 11.5h7" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19 19l-4.3-4.3" />
    </svg>
  );
}

export function FilterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}

/** 4-point sparkle — solid fill, not a stroked line icon like the others
 * in this file (reads better as a tiny twinkle at small sizes). */
export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
    </svg>
  );
}
