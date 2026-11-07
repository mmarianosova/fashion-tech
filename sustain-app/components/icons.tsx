import type { ReactNode } from 'react';
const S = (d: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const Ico = {
  back: S(<path d="m15 5-7 7 7 7" />),
  book: S(<><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>),
  home: S(<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  chev: S(<path d="m9 6 6 6-6 6" />),
  pin: S(<><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  check: S(<path d="m5 12.5 4.5 4.5L19 7.5" />),
  x: S(<path d="M6 6l12 12M18 6 6 18" />),
  label: S(<><path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z" /><circle cx="8.5" cy="8.5" r="1.3" /></>),
  truck: S(<><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>),
  bell: S(<><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  wrench: S(<path d="M14.5 6.5a4 4 0 0 0 4.9 4.9L21 13l-8 8-3-3 8-8-1.5-1.5ZM5 15l-2 2 4 4 2-2" />),
  person: S(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-4 3.5-6 7-6s6.2 2 7 6" /></>),
  trash: S(<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />),
  clock: S(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  flag: S(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />),
  calendar: S(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></>),
  question: S(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></>),
};
