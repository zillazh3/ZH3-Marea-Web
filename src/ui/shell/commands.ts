import type { Messages } from '@/features/i18n/messages';
import type { IconName } from '../icons/icons';
import { ROUTES, type RouteId } from '../router/routes';

export interface Command {
  id: string;
  group: 'goTo' | 'action';
  label: string;
  icon: IconName;
  /** Extra words that should find the command, in every supported language. */
  keywords: string;
  /** Shortcut shown next to the label, when there is one. */
  shortcut?: string;
  run: () => void;
}

export interface CommandActions {
  navigate: (route: RouteId) => void;
  toggleTheme: () => void;
  toggleRail: () => void;
}

const ROUTE_ICONS = {
  home: 'house',
  search: 'search',
  editor: 'sliders-horizontal',
  library: 'library',
  exports: 'download',
  settings: 'settings',
} as const satisfies Record<Exclude<RouteId, 'callback'>, IconName>;

const ROUTE_KEYWORDS = {
  home: 'home inicio',
  search: 'search buscar canciones letras',
  editor: 'editor clip',
  library: 'library biblioteca proyectos',
  exports: 'exports exportar exportaciones descargas video',
  settings: 'settings ajustes preferencias',
} as const satisfies Record<Exclude<RouteId, 'callback'>, string>;

function isNavigable(route: RouteId): route is Exclude<RouteId, 'callback'> {
  return route !== 'callback';
}

export function buildCommands(m: Messages, actions: CommandActions): Command[] {
  const screens = ROUTES.filter(isNavigable).map((route): Command => ({
    id: `go-${route}`,
    group: 'goTo',
    label: m.nav[route],
    icon: ROUTE_ICONS[route],
    keywords: ROUTE_KEYWORDS[route],
    run: () => {
      actions.navigate(route);
    },
  }));

  return [
    ...screens,
    {
      id: 'search-song',
      group: 'action',
      label: m.palette.searchSong,
      icon: 'search',
      keywords: 'song search cancion letra lyrics',
      run: () => {
        actions.navigate('search');
      },
    },
    {
      id: 'toggle-theme',
      group: 'action',
      label: m.palette.toggleTheme,
      icon: 'sun',
      keywords: 'theme tema claro oscuro light dark',
      run: actions.toggleTheme,
    },
    {
      id: 'toggle-menu',
      group: 'action',
      label: m.palette.toggleMenu,
      icon: 'menu',
      keywords: 'menu rail barra lateral sidebar',
      shortcut: m.palette.toggleMenuShortcut,
      run: actions.toggleRail,
    },
  ];
}
