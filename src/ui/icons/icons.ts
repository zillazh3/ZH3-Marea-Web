// Lucide icons (ISC), the same set as the desktop app's assets/icons. Stored as shapes so they render without {@html}.
export type Shape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };

const path = (d: string): Shape => ({ kind: 'path', d });
const circle = (cx: number, cy: number, r: number): Shape => ({ kind: 'circle', cx, cy, r });
const rect = (x: number, y: number, width: number, height: number, rx: number): Shape => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
  rx,
});
const polygon = (points: string): Shape => ({ kind: 'polygon', points });
const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({
  kind: 'line',
  x1,
  y1,
  x2,
  y2,
});

export const ICONS = {
  house: [
    path('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'),
    path(
      'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    ),
  ],
  search: [path('m21 21-4.34-4.34'), circle(11, 11, 8)],
  library: [path('m16 6 4 14'), path('M12 6v14'), path('M8 8v12'), path('M4 4v16')],
  'sliders-horizontal': [
    path('M10 5H3'),
    path('M12 19H3'),
    path('M14 3v4'),
    path('M16 17v4'),
    path('M21 12h-9'),
    path('M21 19h-5'),
    path('M21 5h-7'),
    path('M8 10v4'),
    path('M8 12H3'),
  ],
  download: [
    path('M12 15V3'),
    path('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'),
    path('m7 10 5 5 5-5'),
  ],
  settings: [
    path(
      'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
    ),
    circle(12, 12, 3),
  ],
  menu: [path('M4 5h16'), path('M4 12h16'), path('M4 19h16')],
  play: [
    path('M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'),
  ],
  pause: [rect(14, 3, 5, 18, 1), rect(5, 3, 5, 18, 1)],
  'skip-back': [polygon('19 20 9 12 19 4 19 20'), line(5, 19, 5, 5)],
  'skip-forward': [polygon('5 4 15 12 5 20 5 4'), line(19, 5, 19, 19)],
  sun: [
    circle(12, 12, 4),
    path('M12 2v2'),
    path('M12 20v2'),
    path('m4.93 4.93 1.41 1.41'),
    path('m17.66 17.66 1.41 1.41'),
    path('M2 12h2'),
    path('M20 12h2'),
    path('m6.34 17.66-1.41 1.41'),
    path('m19.07 4.93-1.41 1.41'),
  ],
  moon: [
    path(
      'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
    ),
  ],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;
