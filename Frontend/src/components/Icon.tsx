/**
 * Iconos de línea (SVG en línea, sin librería). Heredan el color del texto
 * (`currentColor`) y miden 16 px por defecto.
 */
const PATHS = {
  up: 'M4 10l4-4 4 4',
  back: 'M12.5 8h-9M7 4.5 3.5 8 7 11.5',
  forward: 'M3.5 8h9M9 4.5 12.5 8 9 11.5',
  down: 'M4 6l4 4 4-4',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  plus: 'M8 3.5v9M3.5 8h9',
  check: 'M3.5 8.5l3 3 6-7',
  search: 'M7 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zM10.5 10.5l3 3',
  external: 'M9 3.5h3.5V7M12.5 3.5 7.5 8.5M11 9.5v3H3.5V5h3',
  refresh: 'M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 3.5v2.8H9.7',
  spark: 'M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.5 4.5l1.6 1.6M9.9 9.9l1.6 1.6M11.5 4.5 9.9 6.1M6.1 9.9l-1.6 1.6',
  heart: 'M8 13s-5-3-5-6.5A2.5 2.5 0 0 1 8 5a2.5 2.5 0 0 1 5 1.5C13 10 8 13 8 13z',
  lock: 'M5 7.5V5.5a3 3 0 0 1 6 0v2M4 7.5h8v5.5H4z',
  edit: 'M10.5 3.2a1.4 1.4 0 0 1 2 2L6 11.7l-2.7.7.7-2.7 6.5-6.5z',
  trash: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5M7 7v4M9 7v4',
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  undo: 'M5.5 4 2.5 7l3 3M2.5 7h6.5a3.5 3.5 0 0 1 0 7H7',
  chat: 'M3 3.5h10v7H7l-3 2.5v-2.5H3z',
  send: 'M2.5 8 13.5 3l-4 10-2-4.5zM7.5 8.5 13.5 3',
  users: 'M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM2 13c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8M10.5 3.2a2.2 2.2 0 0 1 0 4.2M11.5 9.4c1.5.4 2.5 1.8 2.5 3.6',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  bell: 'M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3zM6.5 13.5a1.5 1.5 0 0 0 3 0',
  bulb: 'M6 11.5h4M6.5 13.5h3M5.8 9.6A3.8 3.8 0 1 1 10.2 9.6c-.5.4-.7.9-.7 1.4H6.5c0-.5-.2-1-.7-1.4z',
  megaphone: 'M3 6.5v3h2l5 3v-9l-5 3zM12 6.3a2.2 2.2 0 0 1 0 3.4M5.5 9.5l.8 3.5h1.5l-.6-3',
  flag: 'M4 13.5V3M4 3.5h7.5l-1.5 2.5 1.5 2.5H4',
  shield: 'M8 2.5 3.5 4v4c0 2.8 2 4.6 4.5 5.5 2.5-.9 4.5-2.7 4.5-5.5V4z',
  pin: 'M6 2.5h4M7 2.5v3.5L4.5 8.5h7L9 6V2.5M8 8.5v5',
  eyeOff: 'M2.5 8s2-4 5.5-4c1 0 1.9.3 2.6.8M13.5 8s-2 4-5.5 4c-1 0-1.9-.3-2.6-.8M6.6 6.6a2 2 0 0 0 2.8 2.8M3 13 13 3',
  pulse: 'M1.5 8.5h3l1.5-4 2.5 8 2-6 1 2h3',
  star: 'M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.2 4.6 13l.7-3.8L2.5 6.5l3.8-.5z',
  volume: 'M2.5 6.5v3h2.5l3.5 3v-9L5 6.5zM10.5 6a2.5 2.5 0 0 1 0 4M12 4.3a5 5 0 0 1 0 7.4',
  mute: 'M2.5 6.5v3h2.5l3.5 3v-9L5 6.5zM10.5 6l3 3M13.5 6l-3 3',
  tshirt: 'M5.5 2.5 2.5 4.5l1.5 2.5 1.5-.8V13.5h5V6.2l1.5.8 1.5-2.5-3-2c-.3 1-1.2 1.6-2.5 1.6S5.8 3.5 5.5 2.5z',
  jacket: 'M5.5 2.5 3 4v9.5h3.5V6L8 3.5 9.5 6v7.5H13V4l-2.5-1.5M8 3.5V13.5M5.5 2.5 8 3.5l2.5-1',
  pants: 'M4.5 2.5h7l.5 11h-3L8 7l-1 6.5H4zM4.5 4.5h7',
  shoe: 'M2 11.5V7l3 .5c.5 1 1.8 1.5 3 1.5l4.5 1c.8.2 1.5.8 1.5 1.5H2zM2 12.5h12',
  cap: 'M3 10a5 5 0 0 1 10 0zM3 10h11.5c-.5 1-1.8 1.5-3.5 1.5H3zM8 5v-.5',
  bag: 'M3.5 6h9l-.8 7.5H4.3zM6 6V4.5a2 2 0 0 1 4 0V6',
  dress: 'M6 2.5h4l-.5 3 3 8h-9l3-8z',
  shuffle: 'M2.5 4.5h2.5l6 7h2.5M2.5 11.5h2.5l1.8-2.1M9.2 6.6 11 4.5h2.5M12 3l1.5 1.5L12 6M12 10l1.5 1.5L12 13',
  grid: 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z',
  filter: 'M2.5 3.5h11L9.5 8.5v4l-3 1.5V8.5z',
  palette: 'M8 2.5a5.5 5.5 0 1 0 0 11c.9 0 1.2-.6 1-1.3-.3-.9.3-1.7 1.2-1.7h1.3a2 2 0 0 0 2-2A5.6 5.6 0 0 0 8 2.5zM5 7.5h0M7 5h0M10 5.5h0',
  target: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 8h0',
  scale: 'M8 2.5v11M5 13.5h6M3 5.5h10M3 5.5 1.5 9a1.8 1.8 0 0 0 3 0zM13 5.5 11.5 9a1.8 1.8 0 0 0 3 0z',
  gem: 'M4.5 3h7l2.5 3-6 7.5L2 6zM2 6h12M6.5 3 5.5 6 8 13.5 10.5 6l-1-3',
  crown: 'M2.5 12.5h11M3 11l-.5-6.5 3.2 2.7L8 3l2.3 4.2 3.2-2.7L13 11z',
  compare: 'M5.5 2.5v11M10.5 2.5v11M2.5 5.5h3M2.5 9h3M10.5 7h3M10.5 11h3',
  history: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5M8 5v3l2 1.5',
  hanger: 'M8 5.5a1.5 1.5 0 1 1 1.5-1.5c0 .9-1.5 1.3-1.5 2.3L2.5 10.5c-.6.5-.3 1.5.5 1.5h10c.8 0 1.1-1 .5-1.5L8 6.3',
  hoodie: 'M5.5 3.5C5.5 2.2 6.6 1.5 8 1.5s2.5.7 2.5 2L13 5l-1 2.5-1-.5v6.5H5V7l-1 .5L3 5zM5.5 3.5c.4 1.2 1.3 2 2.5 2s2.1-.8 2.5-2M6.5 10h3',
  tag: 'M2.5 2.5h5l6 6-5 5-6-6zM5.2 5.2h.01',
  trendDown: 'M2.5 4.5l4 4 2.5-2.5 4.5 4.5M13.5 7.5v3h-3',
  trendUp: 'M2.5 11.5l4-4 2.5 2.5 4.5-4.5M13.5 8.5v-3h-3',
  wallet: 'M2.5 4.5h10.5v8.5H2.5zM2.5 4.5 10.5 2.5v2M10.5 8.5h2.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  const grip = name === 'grip' || name === 'more';
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={grip ? 2.4 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
