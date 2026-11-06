import type { ReactNode } from "react";

interface IconProps {
  className?: string;
}

// The app's mark -- the same design as public/favicon.svg and the
// home-screen icons, which scripts/render-icons.mjs generates. Kept in sync
// by hand; those have to be static files, not React.
export function AppIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2a78d6" />
      <path
        d="M13 31 L32 15 L51 31"
        fill="none"
        stroke="#fcfcfb"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 28 V49 H45 V28" fill="none" stroke="#fcfcfb" strokeWidth="4.5" strokeLinejoin="round" />
      <line x1="32" y1="30" x2="32" y2="38" stroke="#ff8a3d" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="41.5" r="4.5" fill="#ff8a3d" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function PowerIcon({ className }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2v8" />
      <path d="M18.36 6.64a9 9 0 11-12.73 0" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

export function XCircleIcon({ className }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

function StrokeIcon({ className, size = 20, children }: IconProps & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function DotsIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} size={22}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </StrokeIcon>
  );
}

export function DropletIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} size={14}>
      <path d="M12 3.5s-6 6.6-6 10.5a6 6 0 0 0 12 0c0-3.9-6-10.5-6-10.5z" />
    </StrokeIcon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} size={14}>
      <path d="M5 12l5 5L20 7" />
    </StrokeIcon>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} size={18}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </StrokeIcon>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} size={18}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </StrokeIcon>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} size={18}>
      <path d="M6 9l6 6 6-6" />
    </StrokeIcon>
  );
}
