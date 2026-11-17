import type { PresetSlug } from '../../shared/landingFacts';

export interface LandingMessages {
  readonly htmlLang: string;
  readonly meta: {
    readonly title: string;
    readonly description: string;
    readonly ogLocale: string;
    readonly appName: string;
    readonly appCategory: string;
  };
  readonly header: {
    readonly logoAria: string;
    readonly navAria: string;
    readonly howItLooks: string;
    readonly whereToUse: string;
    readonly currents: string;
    readonly sourceNav: string;
    readonly openApp: string;
  };
  readonly pageProgress: {
    readonly navAria: string;
    readonly top: string;
    readonly howItLooks: string;
    readonly whereToUse: string;
    readonly currents: string;
    readonly start: string;
  };
  readonly hero: {
    readonly screenReaderTitle: string;
    readonly lead: string;
    readonly sub: string;
    readonly primaryCta: string;
    readonly watchCta: string;
    readonly callouts: readonly [string, string, string, string];
  };
  readonly story: {
    readonly title: string;
    readonly hint: string;
    readonly verseTemplate: string;
    readonly initialVerse: string;
    readonly closingText: string;
    readonly closingCta: string;
  };
  readonly platforms: {
    readonly titleTop: string;
    readonly titleAccent: string;
    readonly desktop: {
      readonly title: string;
      readonly accent: string;
      readonly desc: string;
      readonly badge: string;
    };
    readonly browser: {
      readonly title: string;
      readonly accent: string;
      readonly desc: string;
      readonly badge: string;
    };
    readonly tiktok: {
      readonly title: string;
      readonly p1: string;
      readonly p2: string;
    };
    readonly local: {
      readonly title: string;
      readonly p1: string;
      readonly p2: string;
    };
  };
  readonly currents: {
    readonly titleTop: string;
    readonly titleAccent: string;
    readonly prev: string;
    readonly next: string;
    readonly stats: {
      readonly brightness: string;
      readonly blur: string;
      readonly effects: string;
      readonly size: string;
    };
    readonly sampleLines: readonly [string, string, string];
    readonly descriptions: Record<PresetSlug, string>;
  };
  readonly closing: {
    readonly title: string;
    readonly body: string;
    readonly openWeb: string;
    readonly downloadWindows: string;
    readonly metrics: {
      readonly fpsValue: string;
      readonly fpsLabel: string;
      readonly categoriesLabel: string;
      readonly zeroValue: string;
      readonly zeroLabel: string;
    };
  };
  readonly footer: {
    readonly licensePrefix: string;
    readonly sourceLink: string;
    readonly licenseSuffix: string;
    readonly disclaimer: string;
    readonly languageLabel: string;
    readonly otherLanguageName: string;
    readonly otherLanguageHref: string;
    readonly otherLanguageCode: string;
  };
  readonly clipDemo: {
    readonly songTitle: string;
    readonly songArtist: string;
    readonly watermark: string;
  };
}

export const landingEsMX: LandingMessages = {
  htmlLang: 'es-MX',
  meta: {
    title: 'ZH3 Marea — clips de letra sincronizada para TikTok',
    description:
      'Clips de letra sílaba por sílaba, estilo Apple Music, listos para TikTok. Gratis, de código abierto y sin cuenta.',
    ogLocale: 'es_MX',
    appName: 'ZH3 Marea',
    appCategory: 'MultimediaApplication',
  },
  header: {
    logoAria: 'ZH3 Marea, inicio',
    navAria: 'Secciones',
    howItLooks: 'Cómo se ve',
    whereToUse: 'Dónde usarlo',
    currents: 'Corrientes',
    sourceNav: 'Código',
    openApp: 'Abrir la app',
  },
  pageProgress: {
    navAria: 'Progreso de la página',
    top: 'Inicio',
    howItLooks: 'Cómo se ve',
    whereToUse: 'Dónde usarlo',
    currents: 'Corrientes',
    start: 'Empezar',
  },
  hero: {
    screenReaderTitle: 'ZH3 Marea',
    lead: 'Elige una canción, marca los versos y llévate un clip con la letra animada sílaba por sílaba, listo para TikTok.',
    sub: 'Gratis, de código abierto y sin cuenta: la letra se anima y el video se arma en tu propio equipo.',
    primaryCta: 'Crear mi primer clip',
    watchCta: 'Mira cómo sube la marea',
    callouts: [
      'Sílaba por sílaba',
      'Portada en movimiento',
      'Efectos según la palabra',
      'Tu marca de agua',
    ],
  },
  story: {
    title: 'Así se ve una letra en ZH3 Marea',
    hint: 'Desliza despacio y canta con ella',
    verseTemplate: 'Verso {current} de {total}',
    initialVerse: 'Verso 1 de 5',
    closingText:
      'Así se mueve cada clip: la sílaba que suena se ilumina, la que viene espera, y algunas palabras brillan por lo que significan.',
    closingCta: 'Hacer el mío',
  },
  platforms: {
    titleTop: 'En tu PC',
    titleAccent: 'y en tu cel',
    desktop: {
      title: 'Escritorio,',
      accent: 'completa',
      desc: 'Graba el audio de lo que suena y exporta la canción entera',
      badge: 'Windows',
    },
    browser: {
      title: 'Navegador,',
      accent: 'sin instalar',
      desc: 'Abre la página y arma tu clip donde estés',
      badge: 'Android, PC y navegadores modernos',
    },
    tiktok: {
      title: 'Hecho para TikTok',
      p1: 'Video vertical de 1080×1920 a 60 fps, con la marca de agua lejos de los botones de la app.',
      p2: 'Exporta solo la letra y ponle el sonido oficial desde TikTok: así tu clip no se silencia.',
    },
    local: {
      title: 'Tus clips no salen de tu equipo',
      p1: 'No hay cuentas ni servidores. La letra se anima y el video se codifica en tu dispositivo.',
      p2: 'El código es abierto: cualquiera puede revisarlo, mejorarlo o llevarlo a otra parte.',
    },
  },
  currents: {
    titleTop: 'Elige una',
    titleAccent: 'corriente',
    prev: 'Anterior',
    next: 'Siguiente',
    stats: {
      brightness: 'Brillo',
      blur: 'Desenfoque',
      effects: 'Efectos',
      size: 'Tamaño',
    },
    sampleLines: [
      'y se lo lleva antes de entenderlo',
      'Si la marea sube, déjala subir',
      'que la luz se quede en el fondo del mar',
    ],
    descriptions: {
      bajamar: 'El look de siempre: limpio y fácil de leer.',
      pleamar: 'Letra grande y brillo fuerte para el coro.',
      niebla: 'Suave y difuminada, para canciones lentas.',
      abisal: 'Oscura y profunda, en azul y violeta.',
    },
  },
  closing: {
    title: 'Deja que suba.',
    body: 'Abre ZH3 Marea en el navegador o descarga la versión de escritorio. No necesitas cuenta.',
    openWeb: 'Abrir en el navegador',
    downloadWindows: 'Descargar para Windows',
    metrics: {
      fpsValue: '60 fps',
      fpsLabel: 'en vertical, cuadrado u horizontal',
      categoriesLabel: 'categorías de efectos por palabra',
      zeroValue: '0',
      zeroLabel: 'cuentas, servidores o anuncios',
    },
  },
  footer: {
    licensePrefix: 'ZH3 Marea es software libre bajo AGPL-3.0.',
    sourceLink: 'Código fuente',
    licenseSuffix: 'Hecho por Zilla-ZH3.',
    disclaimer:
      'Spotify, TikTok y Apple Music son marcas de sus dueños. Este proyecto no está afiliado a ellos.',
    languageLabel: 'Idioma:',
    otherLanguageName: 'English',
    otherLanguageHref: '/en/',
    otherLanguageCode: 'en',
  },
  clipDemo: {
    songTitle: 'Marea alta',
    songArtist: 'Nadia Coral',
    watermark: 'Zilla-ZH3',
  },
};

export const landingEn: LandingMessages = {
  htmlLang: 'en',
  meta: {
    title: 'ZH3 Marea — syllable-synced lyric clips for TikTok',
    description:
      'Syllable-by-syllable lyric clips, Apple Music style, ready for TikTok. Free, open source, and no account required.',
    ogLocale: 'en_US',
    appName: 'ZH3 Marea',
    appCategory: 'MultimediaApplication',
  },
  header: {
    logoAria: 'ZH3 Marea, top',
    navAria: 'Sections',
    howItLooks: 'How it looks',
    whereToUse: 'Where to use it',
    currents: 'Corrientes',
    sourceNav: 'Source',
    openApp: 'Open the app',
  },
  pageProgress: {
    navAria: 'Page progress',
    top: 'Top',
    howItLooks: 'How it looks',
    whereToUse: 'Where to use it',
    currents: 'Corrientes',
    start: 'Get started',
  },
  hero: {
    screenReaderTitle: 'ZH3 Marea',
    lead: 'Pick a song, mark the verses, and take home a clip with syllable-by-syllable animated lyrics, ready for TikTok.',
    sub: 'Free, open source, and no account: the lyrics animate and the video renders right on your own device.',
    primaryCta: 'Create my first clip',
    watchCta: 'Watch the tide rise',
    callouts: ['Syllable by syllable', 'Cover in motion', 'Word-meaning effects', 'Your watermark'],
  },
  story: {
    title: 'How lyrics look in ZH3 Marea',
    hint: 'Scroll slowly and sing along',
    verseTemplate: 'Line {current} of {total}',
    initialVerse: 'Line 1 of 5',
    closingText:
      'That is how every clip moves: the active syllable lights up, upcoming lines wait, and certain words glow for what they mean.',
    closingCta: 'Make mine',
  },
  platforms: {
    titleTop: 'On your PC',
    titleAccent: 'and your phone',
    desktop: {
      title: 'Desktop,',
      accent: 'complete',
      desc: 'Capture playing system audio and export the full song',
      badge: 'Windows',
    },
    browser: {
      title: 'Browser,',
      accent: 'no install',
      desc: 'Open the page and build your clip wherever you are',
      badge: 'Android, PC & modern browsers',
    },
    tiktok: {
      title: 'Built for TikTok',
      p1: '1080×1920 vertical video at 60 fps, with the watermark tucked away from app buttons.',
      p2: 'Export lyrics only and attach the official sound inside TikTok so your clip never gets muted.',
    },
    local: {
      title: 'Your clips never leave your device',
      p1: 'No accounts and no servers. Lyrics animate and video encodes locally on your machine.',
      p2: 'The code is open source: anyone can inspect, improve, or fork it.',
    },
  },
  currents: {
    titleTop: 'Pick a',
    titleAccent: 'Corriente',
    prev: 'Previous',
    next: 'Next',
    stats: {
      brightness: 'Glow',
      blur: 'Blur',
      effects: 'Effects',
      size: 'Size',
    },
    sampleLines: [
      'y se lo lleva antes de entenderlo',
      'Si la marea sube, déjala subir',
      'que la luz se quede en el fondo del mar',
    ],
    descriptions: {
      bajamar: 'The signature look: clean and effortless to read.',
      pleamar: 'Large type and bold glow built for the chorus.',
      niebla: 'Soft and diffused, tuned for slow tracks.',
      abisal: 'Dark and deep, accented in electric blue and violet.',
    },
  },
  closing: {
    title: 'Let it rise.',
    body: 'Open ZH3 Marea in your browser or download the desktop app. No account needed.',
    openWeb: 'Open in browser',
    downloadWindows: 'Download for Windows',
    metrics: {
      fpsValue: '60 fps',
      fpsLabel: 'vertical, square, or landscape',
      categoriesLabel: 'word-effect categories',
      zeroValue: '0',
      zeroLabel: 'accounts, servers, or ads',
    },
  },
  footer: {
    licensePrefix: 'ZH3 Marea is free software under AGPL-3.0.',
    sourceLink: 'Source code',
    licenseSuffix: 'Made by Zilla-ZH3.',
    disclaimer:
      'Spotify, TikTok, and Apple Music are trademarks of their owners. This project is not affiliated with them.',
    languageLabel: 'Language:',
    otherLanguageName: 'Español',
    otherLanguageHref: '/',
    otherLanguageCode: 'es-MX',
  },
  clipDemo: {
    songTitle: 'Marea alta',
    songArtist: 'Nadia Coral',
    watermark: 'Zilla-ZH3',
  },
};

export type LandingLocale = 'es-MX' | 'en';

export function landingMessagesFor(locale: LandingLocale): LandingMessages {
  return locale === 'en' ? landingEn : landingEsMX;
}
