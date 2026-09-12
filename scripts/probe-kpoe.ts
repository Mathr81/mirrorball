/**
 * Script d'exploration jetable — sonde les instances KPoe / LyricsPlus réelles.
 *
 *   node scripts/probe-kpoe.ts [PHASES]      # ex. « node scripts/probe-kpoe.ts BC »
 *
 * Phases : A disponibilité · B échantillon · C sémantique de `source`
 *          D tolérance `duration` · E introuvable · F en-têtes / rate limiting
 *
 * Produit un rapport sur stdout, les réponses brutes dans apps/api/test/fixtures/
 * et un récapitulatif machine dans apps/api/test/fixtures/_probe-<phase>.json
 *
 * Ne fait partie d'aucun build : sert à corriger la spec avant d'écrire le service.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URLS = [
  'https://lyricsplus.binimum.org',
  'https://lyricsplus.atomix.one',
  'https://lyricsplus-seven.vercel.app',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyrics-plus-backend.vercel.app',
];

/** Instance retenue par la phase A, réutilisée par les phases suivantes. */
const BASE = process.env.KPOE_BASE ?? 'https://lyricsplus.binimum.org';

const FULL_SOURCE = 'apple,musixmatch-word,lyricsplus,musixmatch,spotify';
const TIMEOUT_MS = 12_000;

/**
 * CONSTATÉ : l'instance applique 2 requêtes / 10 s au niveau applicatif
 * (« 2 requests per 10 seconds allowed »), puis un WAF Cloudflare (erreur 1015)
 * qui bannit l'IP plusieurs minutes si on insiste. D'où l'espacement à 6 s.
 */
const THROTTLE_MS = 6000;
const MAX_429_RETRIES = 3;

const FIXTURE_DIR = join(import.meta.dirname, '..', 'apps', 'api', 'test', 'fixtures');

interface Track {
  slug: string;
  label: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  isrc?: string;
}

/** Échantillon : hit anglophone, français, featuring, accents, live/remix, CJK, obscur. */
const TRACKS: Track[] = [
  { slug: 'queen-bohemian-rhapsody', label: 'Gros hit anglophone', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', duration: 354 },
  { slug: 'weeknd-blinding-lights', label: 'Hit pop récent', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', duration: 200 },
  { slug: 'eminem-without-me', label: 'Rap, débit rapide', title: 'Without Me', artist: 'Eminem', album: 'The Eminem Show', duration: 290 },
  { slug: 'stromae-alors-on-danse', label: 'Français', title: 'Alors on danse', artist: 'Stromae', album: 'Cheese', duration: 205 },
  { slug: 'angele-balance-ton-quoi', label: 'Français, accent dans le nom d artiste', title: 'Balance ton quoi', artist: 'Angèle', album: 'Brol', duration: 176 },
  { slug: 'piaf-non-je-ne-regrette-rien', label: 'Français, accents + virgule dans le titre', title: 'Non, je ne regrette rien', artist: 'Édith Piaf', duration: 142 },
  { slug: 'daftpunk-get-lucky', label: 'Featuring dans le titre', title: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)', artist: 'Daft Punk', album: 'Random Access Memories', duration: 369 },
  { slug: 'nirvana-smells-live', label: 'Version live', title: 'Smells Like Teen Spirit - Live', artist: 'Nirvana', album: 'MTV Unplugged In New York', duration: 301 },
  { slug: 'avicii-levels-radio-edit', label: 'Radio edit / remix', title: 'Levels - Radio Edit', artist: 'Avicii', duration: 199 },
  { slug: 'yoasobi-yoru-ni-kakeru', label: 'Japonais (candidat transliteration)', title: '夜に駆ける', artist: 'YOASOBI', album: 'THE BOOK', duration: 261 },
  { slug: 'iu-through-the-night', label: 'Coréen (candidat transliteration)', title: '밤편지', artist: 'IU', album: 'Palette', duration: 254 },
  { slug: 'obscure-nonexistent', label: 'Morceau inexistant (contrôle négatif)', title: 'Zzqxv Nonexistent Track 91847', artist: 'Nobody At All Whatsoever', duration: 123 },
];

interface ProbeResult {
  ok: boolean;
  status: number;
  ms: number;
  headers: Record<string, string>;
  bodyText: string;
  json: unknown;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildUrl(base: string, t: Partial<Track> & { source?: string; platformId?: string }): string {
  const u = new URL('/v2/lyrics/get', base);
  if (t.title !== undefined) u.searchParams.set('title', t.title);
  if (t.artist !== undefined) u.searchParams.set('artist', t.artist);
  if (t.album !== undefined) u.searchParams.set('album', t.album);
  if (t.duration !== undefined) u.searchParams.set('duration', String(t.duration));
  if (t.source !== undefined) u.searchParams.set('source', t.source);
  if (t.isrc !== undefined) u.searchParams.set('isrc', t.isrc);
  if (t.platformId !== undefined) u.searchParams.set('platformId', t.platformId);
  return u.toString();
}

async function probeOnce(url: string): Promise<ProbeResult> {
  const started = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const bodyText = await res.text();
    const ms = Math.round(performance.now() - started);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    let json: unknown = null;
    try { json = JSON.parse(bodyText); } catch { /* corps non-JSON */ }
    return { ok: res.ok, status: res.status, ms, headers, bodyText, json };
  } catch (err) {
    return {
      ok: false, status: 0, ms: Math.round(performance.now() - started),
      headers: {}, bodyText: '', json: null,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Espacement global + respect de `retry-after` sur 429. */
let lastRequestAt = 0;
async function probe(url: string): Promise<ProbeResult> {
  for (let attempt = 0; ; attempt++) {
    const since = Date.now() - lastRequestAt;
    if (since < THROTTLE_MS) await sleep(THROTTLE_MS - since);
    lastRequestAt = Date.now();
    const r = await probeOnce(url);
    if (r.status !== 429 || attempt >= MAX_429_RETRIES) return r;
    const isWaf = r.bodyText.includes('error-1015');
    const retryAfter = Number(r.headers['retry-after']);
    const waitMs = isWaf
      ? 60_000 * (attempt + 1)
      : (Number.isFinite(retryAfter) ? retryAfter * 1000 : 10_000) + 2000;
    console.log(`      [429${isWaf ? ' / WAF-1015' : ''}] pause ${Math.round(waitMs / 1000)}s, retry ${attempt + 1}/${MAX_429_RETRIES}`);
    await sleep(waitMs);
  }
}

/** Résumé structurel d'une réponse, sans dumper 30 Ko. */
function summarize(json: unknown): Record<string, unknown> {
  if (json === null || typeof json !== 'object') return { shape: 'non-object' };
  const o = json as Record<string, any>;
  const lines: any[] = Array.isArray(o.lyrics) ? o.lyrics : [];
  const withSyl = lines.filter((l) => Array.isArray(l?.syllabus) && l.syllabus.length > 0);
  const singers = new Set<string>();
  const songParts = new Set<string>();
  let translit = 0;
  for (const l of lines) {
    if (l?.element?.singer) singers.add(String(l.element.singer));
    if (l?.element?.songPart) songParts.add(String(l.element.songPart));
    if (l?.transliteration) translit++;
  }
  return {
    topLevelKeys: Object.keys(o),
    type: o.type ?? null,
    metadataKeys: o.metadata ? Object.keys(o.metadata) : null,
    metadataSource: o.metadata?.source ?? null,
    songPartsCount: Array.isArray(o.metadata?.songParts) ? o.metadata.songParts.length : null,
    songPartsSample: Array.isArray(o.metadata?.songParts) ? o.metadata.songParts.slice(0, 2) : null,
    lineCount: lines.length,
    linesWithSyllabus: withSyl.length,
    lineKeys: lines[0] ? Object.keys(lines[0]) : null,
    elementKeys: lines[0]?.element ? Object.keys(lines[0].element) : null,
    syllabusKeys: withSyl[0]?.syllabus?.[0] ? Object.keys(withSyl[0].syllabus[0]) : null,
    firstLine: lines[0] ? { time: lines[0].time, duration: lines[0].duration, text: String(lines[0].text ?? '').slice(0, 48) } : null,
    lastLine: lines.at(-1) ? { time: lines.at(-1).time, duration: lines.at(-1).duration } : null,
    firstSyllabus: withSyl[0]?.syllabus?.slice(0, 4) ?? null,
    singers: [...singers],
    songPartValues: [...songParts].slice(0, 6),
    linesWithTransliteration: translit,
    transliterationSample: lines.find((l) => l?.transliteration)?.transliteration ?? null,
    processingTime: o.processingTime ?? null,
  };
}

function saveFixture(name: string, result: ProbeResult): void {
  const payload = result.json ?? { __raw: result.bodyText, __status: result.status, __error: result.error };
  writeFileSync(join(FIXTURE_DIR, `${name}.json`), JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function saveReport(phase: string, data: unknown): void {
  writeFileSync(join(FIXTURE_DIR, `_probe-${phase}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`\n→ apps/api/test/fixtures/_probe-${phase}.json`);
}

const pick = (h: Record<string, string>, re: RegExp) =>
  Object.fromEntries(Object.entries(h).filter(([k]) => re.test(k)));

// ── A. Disponibilité des cinq base URLs ──────────────────────────────────────
async function phaseA(): Promise<void> {
  console.log('\n═══ A. DISPONIBILITÉ DES BASE URLS ═══\n');
  const out: Record<string, unknown>[] = [];
  for (const base of BASE_URLS) {
    const r = await probeOnce(buildUrl(base, { ...TRACKS[0]!, source: undefined }));
    const verdict = r.ok && r.json ? 'VIVANTE' : r.error ? 'ERREUR RÉSEAU/TLS' : `HS (HTTP ${r.status})`;
    console.log(`${verdict.padEnd(18)} ${base}  —  ${r.ms} ms`);
    if (r.error) console.log(`    ${r.error}`);
    else if (!r.ok) console.log(`    ${r.bodyText.replace(/\s+/g, ' ').slice(0, 120)}`);
    out.push({ base, verdict, ms: r.ms, status: r.status, error: r.error, server: r.headers['server'], cors: pick(r.headers, /^access-control/) });
    await sleep(1200);
  }
  console.log(`\n→ ${out.filter((o) => o.verdict === 'VIVANTE').length}/${BASE_URLS.length} vivantes`);
  saveReport('A-availability', out);
}

// ── B. Échantillon de morceaux ───────────────────────────────────────────────
async function phaseB(): Promise<void> {
  console.log('\n═══ B. ÉCHANTILLON DE MORCEAUX (sans `source`, ordre par défaut) ═══\n');
  const out: Record<string, unknown>[] = [];
  for (const t of TRACKS) {
    const r = await probe(buildUrl(BASE, { title: t.title, artist: t.artist, album: t.album, duration: t.duration }));
    const s = summarize(r.json);
    saveFixture(t.slug, r);
    console.log(`── ${t.label}\n   « ${t.title} » — ${t.artist}`);
    console.log(`   http=${r.status} ${r.ms}ms  type=${s.type}  source=${s.metadataSource}  lignes=${s.lineCount}  syllabus=${s.linesWithSyllabus}`);
    if (s.linesWithTransliteration) console.log(`   transliteration: ${s.linesWithTransliteration} lignes — ${JSON.stringify(s.transliterationSample).slice(0, 120)}`);
    if ((s.singers as string[]).length) console.log(`   singers=${JSON.stringify(s.singers)}  songParts=${JSON.stringify(s.songPartValues)}`);
    if (!r.ok) console.log(`   erreur: ${r.bodyText.replace(/\s+/g, ' ').slice(0, 220)}`);
    console.log('');
    out.push({ track: t, status: r.status, ms: r.ms, summary: s, errorBody: r.ok ? undefined : r.bodyText.slice(0, 500) });
  }
  saveReport('B-catalog', out);
}

// ── C. Sémantique du paramètre `source` ──────────────────────────────────────
async function phaseC(): Promise<void> {
  console.log('\n═══ C. SÉMANTIQUE DE `source` ═══\n');
  console.log('Rappel phase 1 : `source=apple,musixmatch-word,lyricsplus,musixmatch,spotify`');
  console.log('a renvoyé 404 « not found in sources: musixmatch-word, musixmatch » —');
  console.log('« apple », « lyricsplus » et « spotify » ont été SILENCIEUSEMENT IGNORÉS.');
  console.log('On teste donc les noms alternatifs.\n');
  const cases: (string | undefined)[] = [
    undefined, FULL_SOURCE,
    'apple', 'qapple', 'applemusic', 'apple-music',
    'musixmatch-word', 'musixmatch', 'lyricsplus', 'spotify',
    'qapple,musixmatch-word', 'musixmatch-word,qapple',
    'spotify,qapple', 'inexistant',
  ];
  const out: Record<string, unknown>[] = [];
  for (const source of cases) {
    const r = await probe(buildUrl(BASE, { ...TRACKS[0]!, source }));
    const s = summarize(r.json);
    const searched = (r.json as any)?.error?.details?.searchedSources ?? null;
    console.log(`source=${String(source ?? '(absent)').padEnd(46)} http=${r.status} type=${String(s.type ?? '—').padEnd(5)} renvoyé=${String(s.metadataSource ?? '—').padEnd(12)} lignes=${s.lineCount} syl=${s.linesWithSyllabus}`);
    if (searched) console.log(`   → sources réellement interrogées : ${JSON.stringify(searched)}`);
    out.push({ requested: source ?? null, status: r.status, type: s.type, returned: s.metadataSource, lines: s.lineCount, withSyllabus: s.linesWithSyllabus, searchedSources: searched });
    if (source && r.ok) saveFixture(`source-${source.replace(/[^a-z0-9-]/gi, '_')}`, r);
  }
  saveReport('C-source-semantics', out);
}

// ── D. Tolérance sur `duration` ──────────────────────────────────────────────
async function phaseD(): Promise<void> {
  console.log('\n═══ D. TOLÉRANCE SUR `duration` ═══\n');
  const ref = TRACKS[0]!;
  const exact = ref.duration!;
  const cases: Array<[string, number | undefined]> = [
    ['exacte', exact], ['+3 s', exact + 3], ['-8 s', exact - 8],
    ['+30 s', exact + 30], ['+120 s', exact + 120], ['absente', undefined],
  ];
  const out: Record<string, unknown>[] = [];
  for (const [label, duration] of cases) {
    const r = await probe(buildUrl(BASE, { title: ref.title, artist: ref.artist, album: ref.album, duration }));
    const s = summarize(r.json);
    console.log(`${label.padEnd(9)} (${String(duration ?? '—').padEnd(4)}) → http=${r.status} type=${String(s.type ?? '—').padEnd(5)} source=${String(s.metadataSource ?? '—').padEnd(10)} lignes=${s.lineCount}`);
    out.push({ label, duration: duration ?? null, status: r.status, type: s.type, returned: s.metadataSource, lines: s.lineCount });
  }
  saveReport('D-duration-tolerance', out);
}

// ── E. Comportement « introuvable » ──────────────────────────────────────────
async function phaseE(): Promise<void> {
  console.log('\n═══ E. COMPORTEMENT « INTROUVABLE » / PARAMÈTRES INVALIDES ═══\n');
  const cases: Array<[string, Partial<Track>]> = [
    ['morceau inexistant', { title: 'Zzqxv Nonexistent Track 91847', artist: 'Nobody At All Whatsoever', duration: 123 }],
    ['params vides', { title: '', artist: '' }],
    ['title seul, sans artist', { title: 'Bohemian Rhapsody' }],
    ['aucun paramètre', {}],
  ];
  const out: Record<string, unknown>[] = [];
  for (const [label, params] of cases) {
    const r = await probe(buildUrl(BASE, params));
    console.log(`${label.padEnd(24)} → http=${r.status}  ct=${r.headers['content-type'] ?? '?'}`);
    console.log(`   ${r.bodyText.replace(/\s+/g, ' ').slice(0, 260)}\n`);
    out.push({ label, status: r.status, contentType: r.headers['content-type'], body: r.bodyText.slice(0, 600) });
    saveFixture(`notfound-${label.replace(/[^a-z0-9]+/gi, '-')}`, r);
  }
  saveReport('E-not-found', out);
}

// ── F. En-têtes, CORS, rate limiting ─────────────────────────────────────────
async function phaseF(): Promise<void> {
  console.log('\n═══ F. EN-TÊTES, CORS, RATE LIMITING ═══\n');
  const r = await probe(buildUrl(BASE, TRACKS[0]!));
  console.log('En-têtes de réponse :');
  for (const [k, v] of Object.entries(r.headers)) console.log(`   ${k}: ${String(v).slice(0, 100)}`);
  console.log(`\nCORS        : ${JSON.stringify(pick(r.headers, /^access-control/))}`);
  console.log(`Rate limit  : ${JSON.stringify(pick(r.headers, /ratelimit|retry-after/i))}`);

  console.log('\nRafale de 4 requêtes sans pause (mesure du seuil) :');
  const burst: Record<string, unknown>[] = [];
  for (let i = 0; i < 4; i++) {
    const b = await probeOnce(buildUrl(BASE, TRACKS[i % TRACKS.length]!));
    const msg = (b.json as any)?.message ?? (b.json as any)?.title ?? '';
    console.log(`   #${i + 1} http=${b.status} ${String(b.ms).padStart(5)}ms retry-after=${b.headers['retry-after'] ?? '—'}  ${String(msg).slice(0, 80)}`);
    burst.push({ i, status: b.status, ms: b.ms, retryAfter: b.headers['retry-after'] ?? null, message: msg });
  }
  console.log('\nPause de 70 s pour laisser retomber le WAF…');
  await sleep(70_000);
  saveReport('F-headers-ratelimit', { headers: r.headers, cors: pick(r.headers, /^access-control/), burst });
}


// ── G. Sensibilité des paramètres + chasse à la translittération ─────────────
async function phaseG(): Promise<void> {
  console.log('\n═══ G. SENSIBILITÉ album/duration ET TRANSLITTÉRATION ═══\n');
  const out: Record<string, unknown>[] = [];

  const line = (label: string, r: ProbeResult, s: Record<string, unknown>) => {
    console.log(`${label.padEnd(52)} http=${r.status} type=${String(s.type ?? '—').padEnd(5)} src=${String(s.metadataSource ?? '—').padEnd(8)} lignes=${s.lineCount} syl=${s.linesWithSyllabus} translit=${s.linesWithTransliteration}`);
  };

  // G1 — un morceau en 404 avec album+duration : est-ce l'album ou la durée qui bloque ?
  console.log('— G1. Le 404 vient-il de l\'album ou de la durée ?\n');
  const failing = [
    { title: 'Alors on danse', artist: 'Stromae', album: 'Cheese', duration: 205 },
    { title: 'Without Me', artist: 'Eminem', album: 'The Eminem Show', duration: 290 },
  ];
  for (const t of failing) {
    for (const [label, params] of [
      ['album + duration', t],
      ['sans album', { title: t.title, artist: t.artist, duration: t.duration }],
      ['sans duration', { title: t.title, artist: t.artist, album: t.album }],
      ['titre + artiste seuls', { title: t.title, artist: t.artist }],
    ] as Array<[string, Partial<Track>]>) {
      const r = await probe(buildUrl(BASE, params));
      const s = summarize(r.json);
      line(`  ${t.title} — ${label}`, r, s);
      out.push({ group: 'G1', track: t.title, variant: label, status: r.status, type: s.type, lines: s.lineCount });
    }
    console.log('');
  }

  // G2 — chasse à un morceau portant `transliteration` (répertoire CJK)
  console.log('— G2. Recherche d\'un morceau avec `transliteration`\n');
  const cjk: Array<{ slug: string; title: string; artist: string }> = [
    { slug: 'translit-newjeans-ditto', title: 'Ditto', artist: 'NewJeans' },
    { slug: 'translit-yoasobi-idol', title: 'アイドル', artist: 'YOASOBI' },
    { slug: 'translit-lisa-gurenge', title: '紅蓮華', artist: 'LiSA' },
    { slug: 'translit-blackpink-hylt', title: 'How You Like That', artist: 'BLACKPINK' },
    { slug: 'translit-kenshi-lemon', title: 'Lemon', artist: '米津玄師' },
    { slug: 'translit-iu-lilac', title: 'LILAC', artist: 'IU' },
  ];
  for (const c of cjk) {
    const r = await probe(buildUrl(BASE, { title: c.title, artist: c.artist }));
    const s = summarize(r.json);
    line(`  ${c.artist} — ${c.title}`, r, s);
    if (r.ok) {
      saveFixture(c.slug, r);
      if (s.linesWithTransliteration) {
        console.log(`     ⮑ ÉCHANTILLON: ${JSON.stringify(s.transliterationSample).slice(0, 200)}`);
        console.log(`     ⮑ clés de ligne: ${JSON.stringify(s.lineKeys)}`);
      }
    }
    out.push({ group: 'G2', ...c, status: r.status, type: s.type, lines: s.lineCount, translit: s.linesWithTransliteration });
  }

  saveReport('G-sensitivity-translit', out);
}

// ── H. Recherche par `isrc` (finding #6 — non testée dans le sondage initial) ─
async function phaseH(): Promise<void> {
  console.log('\n═══ H. RECHERCHE PAR `isrc` ═══\n');
  const out: Record<string, unknown>[] = [];

  const line = (label: string, r: ProbeResult, s: Record<string, unknown>) => {
    console.log(`${label.padEnd(52)} http=${r.status} type=${String(s.type ?? '—').padEnd(5)} src=${String(s.metadataSource ?? '—').padEnd(8)} lignes=${s.lineCount} syl=${s.linesWithSyllabus}`);
    if (!r.ok) console.log(`   ${r.bodyText.replace(/\s+/g, ' ').slice(0, 200)}`);
  };

  // H1 — isrc seul, sans title/artist : suffit-il, comme le suggère le message d'erreur 400 ?
  console.log('— H1. isrc seul (sans title/artist)\n');
  const bohemian = { isrc: 'GBUM71029604' }; // Queen — Bohemian Rhapsody, lu dans metadata.isrc
  let r = await probe(buildUrl(BASE, bohemian));
  let s = summarize(r.json);
  line('  isrc=GBUM71029604 (Bohemian Rhapsody)', r, s);
  out.push({ case: 'isrc-only', params: bohemian, status: r.status, type: s.type, lines: s.lineCount });
  if (r.ok) saveFixture('isrc-only-bohemian-rhapsody', r);

  // H2 — isrc + title/artist délibérément faux : l'isrc prime-t-il sur le matching flou ?
  console.log('\n— H2. isrc correct + title/artist délibérément faux\n');
  const wrongMeta = { isrc: 'GBUM71029604', title: 'Zzqxv Nonexistent Track', artist: 'Nobody At All' };
  r = await probe(buildUrl(BASE, wrongMeta));
  s = summarize(r.json);
  line('  isrc valide + title/artist absurdes', r, s);
  out.push({ case: 'isrc-overrides-wrong-title-artist', params: wrongMeta, status: r.status, type: s.type, lines: s.lineCount, returnedTitle: (r.json as any)?.metadata?.title ?? null });

  // H3 — isrc + duration très éloignée : l'isrc bypass-t-il le filtre de durée (finding #5) ?
  console.log('\n— H3. isrc correct + duration très éloignée (contourne-t-il le filtre §5 ?)\n');
  const wrongDuration = { isrc: 'GBUM71029604', duration: 1 };
  r = await probe(buildUrl(BASE, wrongDuration));
  s = summarize(r.json);
  line('  isrc valide + duration=1 (réelle: 354)', r, s);
  out.push({ case: 'isrc-bypasses-duration-filter', params: wrongDuration, status: r.status, type: s.type, lines: s.lineCount });

  // H4 — isrc d'un morceau où retirer album/duration était nécessaire (Piaf, finding #5)
  console.log('\n— H4. isrc seul sur un morceau qui échouait avec album+duration\n');
  const piaf = { isrc: 'FRZ116000530' }; // Édith Piaf — Non, je ne regrette rien
  r = await probe(buildUrl(BASE, piaf));
  s = summarize(r.json);
  line('  isrc=FRZ116000530 (Piaf)', r, s);
  out.push({ case: 'isrc-piaf', params: piaf, status: r.status, type: s.type, lines: s.lineCount });
  if (r.ok) saveFixture('isrc-only-piaf', r);

  // H5 — isrc inexistant/invalide : 404 propre, ou 400 ?
  console.log('\n— H5. isrc syntaxiquement valide mais inexistant\n');
  const badIsrc = { isrc: 'ZZZZZ0000000' };
  r = await probe(buildUrl(BASE, badIsrc));
  s = summarize(r.json);
  line('  isrc=ZZZZZ0000000 (inexistant)', r, s);
  out.push({ case: 'isrc-nonexistent', params: badIsrc, status: r.status, type: s.type, lines: s.lineCount, body: r.ok ? undefined : r.bodyText.slice(0, 300) });

  saveReport('H-isrc', out);
}

const PHASES: Record<string, () => Promise<void>> = { A: phaseA, B: phaseB, C: phaseC, D: phaseD, E: phaseE, F: phaseF, G: phaseG, H: phaseH };

mkdirSync(FIXTURE_DIR, { recursive: true });
for (const key of (process.argv[2] ?? 'ABCDEF').toUpperCase().split('')) {
  const fn = PHASES[key];
  if (!fn) { console.error(`Phase inconnue : ${key}`); process.exit(1); }
  await fn();
}
