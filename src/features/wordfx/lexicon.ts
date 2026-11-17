import { isAlnum } from '@/shared/pycompat';

const MAX_CANDIDATES = 29;
const COMBINING_RE = /^\p{M}$/u;

const normalizeCache = new Map<string, string>();

/** Lowercase without accents, keeping letters, digits and apostrophes (matches `wordfx/lexicon.py:normalize`). */
export function normalizeWord(s: string): string {
  const cached = normalizeCache.get(s);
  if (cached !== undefined) return cached;
  const lowered = s.toLowerCase().replaceAll('’', "'").replaceAll('‘', "'").normalize('NFD');
  let out = '';
  for (const ch of lowered) {
    if (COMBINING_RE.test(ch)) continue;
    if (isAlnum(ch) || ch === "'") out += ch;
  }
  if (normalizeCache.size > 16_384) normalizeCache.clear();
  normalizeCache.set(s, out);
  return out;
}

function invert(src: Record<string, string>): Map<string, readonly string[]> {
  const table = new Map<string, string[]>();
  for (const [lemma, forms] of Object.entries(src)) {
    for (const form of forms.split(' ')) {
      if (!form) continue;
      let list = table.get(form);
      if (!list) {
        list = [];
        table.set(form, list);
      }
      if (!list.includes(lemma)) list.push(lemma);
    }
  }
  return table;
}

const ES_IRREG = invert({
  ir: 'voy vas va vamos van fui fuiste fue fuimos fueron iba ibas ibamos iban vaya',
  ser: 'soy eres es somos son sea seas fui fuiste fue fuimos fueron era eras eramos eran sido',
  estar: 'estoy estas esta estamos estan estuve estuvo estaba estabas estaban',
  tener: 'tengo tienes tiene tenemos tienen tuve tuvo tuvieron tenia tenias tenian',
  poder: 'puedo puedes puede podemos pueden pude pudo pudieron podia podias podria',
  querer: 'quiero quieres quiere queremos quieren quise quiso queria querias querria',
  volver: 'vuelvo vuelves vuelve vuelven vuelvas vuelva vuelvan volvi volvio vuelto',
  perder: 'pierdo pierdes pierde pierden pierda pierdas pierdan perdio',
  sentir:
    'siento sientes siente sienten sienta sientas sientan sintamos senti sintio sintieron sintiendo',
  dormir:
    'duermo duermes duerme duermen duerma duermas duerman durmamos durmio durmieron durmiendo',
  morir: 'muero mueres muere mueren muera mueras mueran muramos murio murieron muriendo muerto',
  pedir: 'pido pides pide piden pida pidas pidan pidamos pidio pidieron pidiendo',
  seguir: 'sigo sigues sigue siguen siga sigas sigan sigamos siguio siguieron siguiendo',
  mentir: 'miento mientes miente mienten mienta mientas mientan mintio mintieron mintiendo',
  reir: 'rio ries rie rien ria rias rian riamos rio rieron riendo',
  huir: 'huyo huyes huye huyen huya huyas huyan huyamos huyo huyeron huyendo',
  soltar: 'suelto sueltas suelta sueltan suelte sueltes suelten',
  decir: 'digo dices dice dijo dije dijeron dicho di',
  hacer: 'hago hace haces hizo hice hecho haz',
  deshacer: 'deshago deshace deshacen deshice deshizo deshecho deshaz',
  sostener: 'sostengo sostienes sostiene sostienen sostuve sostuvo sostenido sosten',
  mantener: 'mantengo mantienes mantiene mantienen mantuve mantuvo mantenido manten',
  ver: 'veo ves ve vi vio visto veia',
  dar: 'doy da das di dio dieron',
  saber: 'se sabe sabes supo supe sepa',
  venir: 'vengo vienes viene vino vine vienen ven',
  poner: 'pongo pones pone puso puse puesto pon',
  suponer: 'supongo supones supone suponemos suponen supuse supuso supusieron suponia',
  caer: 'caigo cae caes caiga caigas caigan caemos cayo cayeron',
  oir: 'oigo oye oyes oyo oido',
  traer: 'traigo trae traes trajo traje traido',
  salir: 'salgo sal',
  conocer: 'conozco',
  romper: 'roto rompa rompas rompan',
  abrir: 'abierto abra abras abran',
  escribir: 'escrito',
  volar: 'vuelo vuelas vuela vuelan vuele vueles vuelen',
  contar: 'cuento cuentas cuenta',
  sonar: 'sueno suenas suena suene suenes suenen',
  recordar: 'recuerdo recuerdas recuerda recuerde recuerdes recuerden',
  encontrar: 'encuentro encuentras encuentra encuentre encuentres encuentren',
  pensar: 'pienso piensas piensa piense pienses piensen',
  empezar: 'empiezo empiezas empieza empece empiece empieces empecemos',
  cerrar: 'cierro cierras cierra cierre cierres cierren',
  morder: 'muerdo muerde muerda muerdas',
  doler: 'duele dueles duelen duela duelas dolia dolio dolera',
  llover: 'llueve llueva',
  arder: 'ardo arde arda ardas ardan ardio ardieron ardiendo',
});

const CLITICS = ['nos', 'les', 'los', 'las', 'me', 'te', 'se', 'lo', 'la', 'le'] as const;
const AR = ['ar'] as const;
const ER_IR = ['er', 'ir'] as const;
const ALL_INF = ['ar', 'er', 'ir'] as const;

const VERB_END: Record<string, readonly string[]> = {
  o: ALL_INF,
  a: ALL_INF,
  as: ALL_INF,
  es: ALL_INF,
  e: ALL_INF,
  an: ALL_INF,
  en: ALL_INF,
  amos: ALL_INF,
  emos: ALL_INF,
  aste: AR,
  aron: AR,
  ando: AR,
  aba: AR,
  abas: AR,
  aban: AR,
  abamos: AR,
  ado: AR,
  ada: AR,
  ados: AR,
  adas: AR,
  i: ER_IR,
  iste: ER_IR,
  io: ER_IR,
  imos: ER_IR,
  ieron: ER_IR,
  iendo: ER_IR,
  ido: ER_IR,
  ida: ER_IR,
  idos: ER_IR,
  idas: ER_IR,
  ia: ER_IR,
  ias: ER_IR,
  ian: ER_IR,
  iamos: ER_IR,
  yo: ER_IR,
  ye: ER_IR,
  yen: ER_IR,
  ya: ER_IR,
  yan: ER_IR,
  yendo: ER_IR,
  yeron: ER_IR,
};
const VERB_END_ORDER = Object.keys(VERB_END).sort((a, b) => b.length - a.length);
const STEM_CHANGE_END = new Set(['o', 'a', 'as', 'es', 'e', 'an', 'en', 'io', 'ieron', 'iendo']);
const STEM_RULES: readonly (readonly [string, string])[] = [
  ['ue', 'o'],
  ['ie', 'e'],
  ['ie', 'i'],
  ['ue', 'u'],
  ['i', 'e'],
  ['u', 'o'],
];
const FUTURE = ['iamos', 'ias', 'ian', 'ia', 'emos', 'an', 'as', 'e', 'a'] as const;
const VOWELS = 'aeiou';

function stemVariants(stem: string): string[] {
  const out: string[] = [];
  for (const [a, b] of STEM_RULES) {
    const i = stem.lastIndexOf(a);
    const j = i + a.length;
    if (i < 0 || stem.length - j > 3) continue;
    const nextCh = stem[j] ?? '';
    const prevCh = i > 0 ? (stem[i - 1] ?? '') : '';
    if (
      (j < stem.length && VOWELS.includes(nextCh)) ||
      (a.length === 1 && i > 0 && VOWELS.includes(prevCh))
    ) {
      continue;
    }
    out.push(stem.slice(0, i) + b + stem.slice(j));
  }
  return out;
}

function verbLemmas(b: string, stemChange: boolean | null = null): string[] {
  const res: string[] = [];
  if (stemChange !== true) {
    if (b.length >= 4 && (b.endsWith('ar') || b.endsWith('er') || b.endsWith('ir'))) {
      res.push(b);
    }
    for (const suf of FUTURE) {
      const r = b.slice(0, -suf.length);
      if (
        b.endsWith(suf) &&
        r.length >= 4 &&
        (r.endsWith('ar') || r.endsWith('er') || r.endsWith('ir'))
      ) {
        res.push(r);
      }
    }
  }
  for (const end of VERB_END_ORDER) {
    if (!b.endsWith(end) || b.length - end.length < 2) continue;
    const stem = b.slice(0, -end.length);
    let stems: string[];
    if (stemChange === true) {
      if (!STEM_CHANGE_END.has(end)) continue;
      stems = stemVariants(stem);
    } else if (stemChange === false) {
      stems = [stem];
    } else {
      stems = STEM_CHANGE_END.has(end) ? [stem, ...stemVariants(stem)] : [stem];
    }

    if (
      (end === 'o' || end === 'a' || end === 'as' || end === 'an' || end === 'amos') &&
      stem.endsWith('zc') &&
      stemChange !== true
    ) {
      stems.push(stem.slice(0, -2) + 'c');
    } else if (end === 'e' || end === 'es' || end === 'en' || end === 'emos') {
      for (const baseS of [...stems]) {
        if (baseS.endsWith('c')) stems.push(baseS.slice(0, -1) + 'z');
        else if (baseS.endsWith('qu')) stems.push(baseS.slice(0, -2) + 'c');
        else if (baseS.endsWith('gu')) stems.push(baseS.slice(0, -1));
      }
    }
    const infs = VERB_END[end] ?? [];
    for (const s of stems) {
      for (const inf of infs) res.push(s + inf);
    }
  }
  return res;
}

function esCandidates(w: string): string[] {
  const out = [w];
  const seen = new Set(out);
  const add = (x: string): void => {
    if (x && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  };

  const bases = [w];
  let frontier = [w];
  for (let step = 0; step < 2; step += 1) {
    const nextFrontier: string[] = [];
    for (const b of frontier) {
      for (const c of CLITICS) {
        if (b.endsWith(c) && b.length - c.length >= 2) {
          nextFrontier.push(b.slice(0, -c.length));
        }
      }
    }
    frontier = nextFrontier;
    bases.push(...frontier);
  }
  for (const b of bases) {
    for (const lemma of ES_IRREG.get(b) ?? []) add(lemma);
  }
  for (const b of bases) {
    for (const lemma of verbLemmas(b, false)) add(lemma);
  }

  const sing = [w];
  if (w.endsWith('ces')) sing.push(w.slice(0, -3) + 'z');
  if (w.endsWith('es') && w.length > 3) sing.push(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 2) sing.push(w.slice(0, -1));

  const dimRules: readonly (readonly [string, readonly string[]])[] = [
    ['cito', ['', 'e']],
    ['cita', ['', 'a', 'e']],
    ['ito', ['o']],
    ['ita', ['a']],
    ['isimo', ['o', 'e', '']],
    ['isima', ['o', 'a', 'e', '']],
  ];
  for (const s of [...sing]) {
    for (const [suf, reps] of dimRules) {
      if (s.endsWith(suf) && s.length - suf.length >= 2) {
        const stem = s.slice(0, -suf.length);
        for (const r of reps) sing.push(stem + r);
      }
    }
  }
  for (const s of sing) {
    add(s);
    if (s.endsWith('ona') || s.endsWith('ora')) add(s.slice(0, -1));
    if (s.endsWith('a')) add(s.slice(0, -1) + 'o');
  }
  for (const b of bases) {
    for (const lemma of verbLemmas(b, true)) add(lemma);
  }
  if (w.endsWith('mente') && w.length > 7) {
    const r = w.slice(0, -5);
    add(r);
    if (r.endsWith('a')) add(r.slice(0, -1) + 'o');
  }
  return out;
}

const EN_IRREG = invert({
  be: 'was were been is are am being',
  have: 'had has having',
  do: 'did does done',
  go: 'went gone goes',
  lose: 'lost',
  leave: 'left',
  feel: 'felt',
  fall: 'fell fallen',
  break: 'broke broken',
  fly: 'flew flown',
  sleep: 'slept',
  wake: 'woke woken',
  forget: 'forgot forgotten',
  burn: 'burnt burned',
  drink: 'drank drunk',
  run: 'ran',
  come: 'came',
  see: 'saw seen',
  say: 'said',
  think: 'thought',
  hold: 'held',
  keep: 'kept',
  swear: 'swore sworn',
  tear: 'tore torn',
  weep: 'wept',
  dream: 'dreamt',
  drown: 'drowned',
  sing: 'sang sung',
  begin: 'began begun',
  know: 'knew known',
  take: 'took taken',
  give: 'gave given',
  make: 'made',
  tell: 'told',
  find: 'found',
  stand: 'stood',
  grow: 'grew grown',
  hide: 'hid hidden',
  rise: 'rose risen',
  fight: 'fought',
  bleed: 'bled',
  shine: 'shone',
  sink: 'sank sunk',
  freeze: 'froze frozen',
  bind: 'bound',
  cling: 'clung',
  sow: 'sown',
  blow: 'blew blown',
  throw: 'threw thrown',
  draw: 'drew drawn',
  wolf: 'wolves',
  life: 'lives',
  knife: 'knives',
  foot: 'feet',
  tooth: 'teeth',
  man: 'men',
  woman: 'women',
  child: 'children',
});

function undouble(s: string): string {
  if (s.length <= 2) return '';
  const last = s[s.length - 1] ?? '';
  const prev = s[s.length - 2] ?? '';
  return last === prev ? s.slice(0, -1) : '';
}

function enCandidates(rawWord: string): string[] {
  const out = [rawWord];
  const seen = new Set(out);
  const add = (x: string): void => {
    if (x.length >= 2 && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  };

  let w = rawWord;
  if (w.endsWith("'s")) w = w.slice(0, -2);
  else if (w.endsWith("in'") && w.length > 4) w = w.slice(0, -1) + 'g';
  if (w !== out[0]) add(w);
  for (const lemma of EN_IRREG.get(w) ?? []) add(lemma);
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ves')) {
    add(w.slice(0, -3) + 'f');
    add(w.slice(0, -3) + 'fe');
  }
  if (w.endsWith('es') && w.length > 3) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed') && w.length > 3) {
    add(undouble(w.slice(0, -2)));
    add(w.slice(0, -1));
    add(w.slice(0, -2));
  }
  if (w.endsWith('ing') && w.length > 4) {
    const s = w.slice(0, -3);
    add(undouble(s));
    if (s.length === 2 && s.endsWith('y')) add(s.slice(0, -1) + 'ie');
    add(s + 'e');
    add(s);
  }
  for (const suf of ['est', 'er']) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      const s = w.slice(0, -suf.length);
      if (s.endsWith('i')) add(s.slice(0, -1) + 'y');
      add(undouble(s));
      add(s + 'e');
      add(s);
    }
  }
  if (w.endsWith('ily')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ly') && w.length > 4) add(w.slice(0, -2));
  return out;
}

const lemmaCache = new Map<string, readonly string[]>();

export function lemmaCandidates(word: string, lang: 'es' | 'en'): readonly string[] {
  const w = normalizeWord(word);
  if (!w) return [];
  const key = `${lang}:${w}`;
  let res = lemmaCache.get(key);
  if (!res) {
    const cands = lang === 'es' ? esCandidates(w) : enCandidates(w);
    res = cands.slice(0, MAX_CANDIDATES);
    if (lemmaCache.size > 16_384) lemmaCache.clear();
    lemmaCache.set(key, res);
  }
  return res;
}

const STOP_ES = new Set(
  (
    'el la los las un una unos unas lo de del al y que quien como cuando donde porque pero si mas muy ya ' +
    'ni yo tu mi mis tus su sus te se nos le les con sin por para en sobre entre hasta desde ese esa ' +
    'esto eso este esta aquel aqui alli ahi hoy siempre nunca nada todo toda todos tanto tan es soy eres ' +
    'fue era hay tengo quiero voy vas va estoy bien asi tambien aun aunque entonces ahora despues antes ' +
    'otra otro cada mucho poco algo nadie vez ella ellos nosotros solo no a me'
  ).split(' '),
);
const STOP_EN = new Set(
  (
    'the and of to in is it you that she we they i my your his her our their me a an was were are am be ' +
    "been will would can could shall should do does did don't not no with for on at by from this these " +
    'those there here what when where why how who which if but or so just like all one up down out over ' +
    "never ever us as i'm you're it's can't won't ain't gonna wanna cause sin yo solo la"
  ).split(' '),
);
const ONLY_ES = new Set([...STOP_ES].filter((w) => !STOP_EN.has(w)));
const ONLY_EN = new Set([...STOP_EN].filter((w) => !STOP_ES.has(w)));

const ES_SUFFIX = ['cion', 'mente', 'ado', 'ido', 'ando', 'iendo'] as const;
const EN_SUFFIX = ['ing', 'tion', "n't", "'m", "'ll", "'re", "'ve"] as const;
const EN_INSIDE = ['th', 'ough'] as const;

export function guessLang(
  word: string,
  known?: Readonly<Record<'es' | 'en', ReadonlySet<string>>>,
  fallback = 'es',
): string {
  const w = normalizeWord(word);
  if (!w) return fallback;
  if (known) {
    const hits: ('es' | 'en')[] = [];
    for (const lang of ['es', 'en'] as const) {
      const set = known[lang];
      if (lemmaCandidates(w, lang).some((c) => set.has(c))) hits.push(lang);
    }
    if (hits.length === 1 && hits[0]) return hits[0];
  }
  const raw = word.toLowerCase();
  if (raw.includes('ñ') || raw.includes('¿') || raw.includes('¡')) return 'es';
  if (
    w.length >= 5 &&
    ES_SUFFIX.some((s) => w.endsWith(s)) &&
    !EN_SUFFIX.some((s) => w.endsWith(s))
  ) {
    return 'es';
  }
  if (
    EN_INSIDE.some((s) => w.includes(s)) ||
    (w.length >= 5 && EN_SUFFIX.some((s) => w.endsWith(s))) ||
    EN_SUFFIX.slice(2).some((s) => w.endsWith(s))
  ) {
    return 'en';
  }
  for (const ch of raw.normalize('NFD')) {
    if (COMBINING_RE.test(ch)) return 'es';
  }
  if (ONLY_ES.has(w)) return 'es';
  if (ONLY_EN.has(w)) return 'en';
  return fallback;
}

export function lineLang(
  words: readonly string[],
  known?: Readonly<Record<'es' | 'en', ReadonlySet<string>>>,
): 'es' | 'en' {
  let esCount = 0;
  let enCount = 0;
  for (const w of words) {
    const g = guessLang(w, known, '');
    if (g === 'es') esCount += 1;
    else if (g === 'en') enCount += 1;
  }
  return enCount > esCount ? 'en' : 'es';
}
