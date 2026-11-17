import type { PresetSlug } from '../../shared/landingFacts';

export interface PrivacyItem {
  readonly text: string;
  /** `{repo}` and `{issues}` in `href` are replaced with the configured repository URL at build time. */
  readonly link?: { readonly label: string; readonly href: string };
}

export interface PrivacySection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly items: readonly PrivacyItem[];
  readonly closing: readonly string[];
}

export interface LandingPrivacy {
  readonly path: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly title: string;
  readonly intro: string;
  readonly updatedLabel: string;
  readonly updatedIso: string;
  readonly updatedText: string;
  readonly sections: readonly PrivacySection[];
}

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
    readonly privacyLink: string;
    readonly privacyHref: string;
  };
  readonly privacy: LandingPrivacy;
  readonly notFound: {
    readonly title: string;
    readonly body: string;
    readonly home: string;
    readonly app: string;
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
    privacyLink: 'Privacidad',
    privacyHref: '/privacidad/',
  },
  privacy: {
    path: '/privacidad/',
    metaTitle: 'Privacidad · ZH3 Marea',
    metaDescription:
      'ZH3 Marea no tiene cuentas ni servidor propio. Qué se guarda en tu navegador y qué servicios externos contacta tu navegador.',
    title: 'Privacidad',
    intro:
      'ZH3 Marea no tiene cuentas ni servidor propio. No recopilamos, guardamos ni vendemos datos personales. Esta página dice qué hace la app y, como el código es abierto, puedes comprobarlo.',
    updatedLabel: 'Última actualización:',
    updatedIso: '2026-11-16',
    updatedText: '16 de noviembre de 2026',
    sections: [
      {
        heading: 'Lo que se guarda en tu navegador',
        paragraphs: [
          'Solo en tu navegador, para este sitio. Nada de esto se envía a un servidor nuestro:',
        ],
        items: [
          {
            text: 'Tus proyectos (letras, estilo y portada), tus presets de Corrientes y el historial de exportaciones.',
          },
          { text: 'El audio que cargas y los videos que exportas.' },
          { text: 'Tus ajustes: tema, idioma y preferencias de exportación.' },
          {
            text: 'Una copia de las letras que ya buscaste, por unos días, para no repetir la consulta.',
          },
          {
            text: 'Si los configuras: tu llave de Spicy Lyrics y la conexión con Spotify (tu Client ID y un token de renovación).',
          },
          { text: 'Una copia de la app para abrirla sin conexión.' },
        ],
        closing: [
          'Si borras los datos del sitio en tu navegador, todo esto desaparece. También puedes hacerlo desde Ajustes, con «Borrar todos mis datos».',
          'Para respaldar un proyecto, usa «Descargar .marea.json» en Biblioteca. El archivo guarda letras, estilo y portada, pero no tu audio: conserva el original.',
        ],
      },
      {
        heading: 'Tu audio, tus letras y tus videos se quedan en tu dispositivo',
        paragraphs: [
          'El audio, las letras y los videos se procesan en tu dispositivo y no se suben a ningún lado.',
        ],
        items: [],
        closing: [],
      },
      {
        heading: 'Servicios externos',
        paragraphs: [
          'Tu navegador contacta directamente a estos servicios, sin pasar por nosotros, y ellos ven tu dirección IP. Si no buscas letras ni conectas Spotify o Spicy Lyrics, la app no contacta a ningún tercero.',
        ],
        items: [
          {
            text: 'LRCLIB (lrclib.net): búsqueda de letras. Recibe el título, artista, álbum y duración de lo que buscas. No publica una política de privacidad; es un proyecto de código abierto.',
            link: { label: 'Proyecto LRCLIB', href: 'https://github.com/tranxuanthang/lrclib' },
          },
          {
            text: 'Spicy Lyrics (api.spicylyrics.org): letras sílaba por sílaba. Solo si guardas tu llave en Ajustes; recibe tu llave y el ID de la canción en Spotify.',
            link: {
              label: 'Política de privacidad de Spicy Lyrics',
              href: 'https://spicylyrics.org/legal/privacy',
            },
          },
          {
            text: 'Spotify (accounts.spotify.com, api.spotify.com, i.scdn.co): iniciar sesión, buscar canciones, ver qué escuchas y cargar portadas. Solo si lo conectas en Ajustes con tu propio Client ID.',
            link: {
              label: 'Política de privacidad de Spotify',
              href: 'https://www.spotify.com/legal/privacy-policy/',
            },
          },
        ],
        closing: [],
      },
      {
        heading: 'Hospedaje',
        paragraphs: [
          'El sitio está alojado en Cloudflare. Como cualquier servidor web, recibe datos estándar de cada petición: dirección IP, navegador y página solicitada. Nosotros no añadimos analíticas, cookies, rastreadores ni anuncios.',
        ],
        items: [
          {
            text: 'Cloudflare:',
            link: {
              label: 'Política de privacidad de Cloudflare',
              href: 'https://www.cloudflare.com/privacypolicy/',
            },
          },
        ],
        closing: [],
      },
      {
        heading: 'Código abierto y contacto',
        paragraphs: [
          'ZH3 Marea es software libre bajo AGPL-3.0, así que cualquiera puede verificar todo lo anterior.',
        ],
        items: [
          { text: 'Código fuente:', link: { label: 'Repositorio en GitHub', href: '{repo}' } },
          {
            text: 'Preguntas o reportes:',
            link: { label: 'Issues del repositorio', href: '{issues}' },
          },
        ],
        closing: [],
      },
    ],
  },
  notFound: {
    title: 'Esta página no existe',
    body: 'La dirección no lleva a ningún lado. Vuelve al inicio o abre la app.',
    home: 'Ir al inicio',
    app: 'Abrir la app',
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
    privacyLink: 'Privacy',
    privacyHref: '/en/privacy/',
  },
  privacy: {
    path: '/en/privacy/',
    metaTitle: 'Privacy · ZH3 Marea',
    metaDescription:
      'ZH3 Marea has no accounts and no server of its own. What is stored in your browser and which external services your browser contacts.',
    title: 'Privacy',
    intro:
      'ZH3 Marea has no accounts and no server of its own. We do not collect, store or sell personal data. This page says what the app does, and since the code is open you can verify it.',
    updatedLabel: 'Last updated:',
    updatedIso: '2026-11-16',
    updatedText: 'November 16, 2026',
    sections: [
      {
        heading: 'What is stored in your browser',
        paragraphs: [
          'Only in your browser, for this site. None of it is sent to a server of ours:',
        ],
        items: [
          {
            text: 'Your projects (lyrics, style and cover), your own Currents presets and your export history.',
          },
          { text: 'The audio you load and the videos you export.' },
          { text: 'Your settings: theme, language and export preferences.' },
          {
            text: 'A copy of the lyrics you already searched for, for a few days, so the lookup is not repeated.',
          },
          {
            text: 'If you set them up: your Spicy Lyrics key and the Spotify connection (your Client ID and a refresh token).',
          },
          { text: 'A copy of the app so it opens offline.' },
        ],
        closing: [
          'If you clear this site’s data in your browser, all of it disappears. You can also do it from Settings with “Borrar todos mis datos” (delete all my data).',
          'To back up a project, use “Descargar .marea.json” (download) in Library. The file keeps lyrics, style and cover, but not your audio: keep the original.',
        ],
      },
      {
        heading: 'Your audio, lyrics and videos stay on your device',
        paragraphs: [
          'Audio, lyrics and videos are processed on your device and are never uploaded anywhere.',
        ],
        items: [],
        closing: [],
      },
      {
        heading: 'External services',
        paragraphs: [
          'Your browser contacts these services directly, without going through us, and they see your IP address. If you do not search for lyrics or connect Spotify or Spicy Lyrics, the app contacts no third party.',
        ],
        items: [
          {
            text: 'LRCLIB (lrclib.net): lyrics search. It receives the title, artist, album and duration of what you search for. It does not publish a privacy policy; it is an open-source project.',
            link: { label: 'LRCLIB project', href: 'https://github.com/tranxuanthang/lrclib' },
          },
          {
            text: 'Spicy Lyrics (api.spicylyrics.org): syllable-synced lyrics. Only if you save your key in Settings; it receives your key and the Spotify track ID.',
            link: {
              label: 'Spicy Lyrics privacy policy',
              href: 'https://spicylyrics.org/legal/privacy',
            },
          },
          {
            text: 'Spotify (accounts.spotify.com, api.spotify.com, i.scdn.co): sign-in, track search, what you are playing and album covers. Only if you connect it in Settings with your own Client ID.',
            link: {
              label: 'Spotify privacy policy',
              href: 'https://www.spotify.com/legal/privacy-policy/',
            },
          },
        ],
        closing: [],
      },
      {
        heading: 'Hosting',
        paragraphs: [
          'The site is hosted on Cloudflare. Like any web host, it receives standard request data: IP address, browser and the page requested. We add no analytics, cookies, trackers or ads.',
        ],
        items: [
          {
            text: 'Cloudflare:',
            link: {
              label: 'Cloudflare privacy policy',
              href: 'https://www.cloudflare.com/privacypolicy/',
            },
          },
        ],
        closing: [],
      },
      {
        heading: 'Open source and contact',
        paragraphs: [
          'ZH3 Marea is free software under AGPL-3.0, so anyone can verify all of the above.',
        ],
        items: [
          { text: 'Source code:', link: { label: 'GitHub repository', href: '{repo}' } },
          { text: 'Questions or reports:', link: { label: 'Repository issues', href: '{issues}' } },
        ],
        closing: [],
      },
    ],
  },
  notFound: {
    title: 'This page does not exist',
    body: 'That address leads nowhere. Go back home or open the app.',
    home: 'Go to the home page',
    app: 'Open the app',
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
