// Inline-SVG ornaments for the DOM interface: gears, the title emblem, medallions, medals,
// laurels and gauges. Pure string builders (no DOM) so they're cheap and testable.

let uid = 0;
const nid = (p) => `${p}-${(++uid).toString(36)}`;
const f = (n) => Math.round(n * 100) / 100;

/**
 * SVG path data for a toothed gear.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r outer radius
 * @param {number} teeth
 * @param {number} [depth] tooth depth
 * @param {number} [hole] center hole radius (0 = none)
 */
export function gearPath(cx, cy, r, teeth, depth = r * 0.16, hole = 0) {
  const ri = r - depth;
  const step = (Math.PI * 2) / teeth;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push([ri, a], [ri, a + step * 0.2], [r, a + step * 0.3], [r, a + step * 0.7], [ri, a + step * 0.8]);
  }
  let d = pts
    .map(([rr, a], i) => `${i ? 'L' : 'M'}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`)
    .join('');
  d += 'Z';
  if (hole > 0) {
    d += `M${f(cx + hole)} ${cy}A${hole} ${hole} 0 1 0 ${f(cx - hole)} ${cy}A${hole} ${hole} 0 1 0 ${f(cx + hole)} ${cy}Z`;
  }
  return d;
}

function brassGrad(id, angle = 90) {
  return `<linearGradient id="${id}" gradientTransform="rotate(${angle} .5 .5)">
    <stop offset="0" stop-color="#fff1c2"/><stop offset=".22" stop-color="#e8c06a"/>
    <stop offset=".5" stop-color="#c9973f"/><stop offset=".78" stop-color="#8a6024"/>
    <stop offset="1" stop-color="#5a3c15"/></linearGradient>`;
}

/** Small brass cog (currency glyph). */
export function cogSVG() {
  const g = nid('cg');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs>${brassGrad(g, 60)}</defs>
    <path d="${gearPath(12, 12, 11.2, 10, 2.8, 3.4)}" fill="url(#${g})" fill-rule="evenodd"
      stroke="#3a2610" stroke-width="1.1"/>
    <circle cx="12" cy="12" r="6.2" fill="none" stroke="#7a5420" stroke-width="1.2" opacity=".8"/></svg>`;
}

/** Decorative gear (for corners & loaders). */
export function gearSVG(teeth = 12, cls = '', hole = 0.32) {
  const g = nid('gg');
  return `<svg class="deco-gear ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <defs>${brassGrad(g, 50)}</defs>
    <path d="${gearPath(50, 50, 48, teeth, 9, 48 * hole)}" fill="url(#${g})" fill-rule="evenodd"
      stroke="#2b1a08" stroke-width="2"/>
    <circle cx="50" cy="50" r="${f(48 * hole + 7)}" fill="none" stroke="#5a3c15" stroke-width="3"/>
    ${[0, 1, 2, 3, 4, 5]
      .map((i) => {
        const a = (i / 6) * Math.PI * 2;
        const rr = 29;
        return `<circle cx="${f(50 + Math.cos(a) * rr)}" cy="${f(50 + Math.sin(a) * rr)}" r="2.6"
          fill="#fbe7a9" stroke="#4a3112" stroke-width="1"/>`;
      })
      .join('')}</svg>`;
}

/** Brass medallion with a letter (fallback icon). */
export function medallionSVG(letter = '?') {
  const g = nid('md');
  const r = nid('mr');
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs>${brassGrad(g, 45)}
    <radialGradient id="${r}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#4a3a2a"/>
    <stop offset="1" stop-color="#1a120a"/></radialGradient></defs>
    <circle cx="32" cy="32" r="29" fill="url(#${g})" stroke="#2b1a08" stroke-width="2"/>
    <circle cx="32" cy="32" r="21" fill="url(#${r})" stroke="#7a5420" stroke-width="2"/>
    <text x="32" y="39.5" text-anchor="middle" font-size="21" font-family="Georgia, serif"
      font-weight="bold" fill="#f2d48a">${escapeXML(letter)}</text></svg>`;
}

/** Achievement medal (fallback when icon sprites are missing). tier: bronze|silver|gold. */
export function medalSVG(tier = 'bronze') {
  const c = {
    bronze: ['#f0b98a', '#b4643c', '#5a2e14'],
    silver: ['#ffffff', '#b8c0c8', '#4a525a'],
    gold: ['#fff3b0', '#e8b33a', '#6a4510'],
  }[tier] || ['#fff3b0', '#e8b33a', '#6a4510'];
  const g = nid('mg');
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/>
    <stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs>
    <path d="M20 2h10l4 22h-10z" fill="#8c2f2b" stroke="#2b1208" stroke-width="1.5"/>
    <path d="M44 2H34l-4 22h10z" fill="#2e4a6b" stroke="#0f1a28" stroke-width="1.5"/>
    <circle cx="32" cy="40" r="19" fill="url(#${g})" stroke="#2b1a08" stroke-width="2"/>
    <circle cx="32" cy="40" r="14" fill="none" stroke="${c[2]}" stroke-width="1.5" opacity=".7"/>
    <path d="M32 29l3.2 7 7.6.7-5.8 5 1.8 7.4L32 45.3l-6.6 3.8 1.8-7.4-5.8-5 7.6-.7z"
      fill="${c[0]}" stroke="${c[2]}" stroke-width="1.2"/></svg>`;
}

/** Laurel wreath halves around content (victory banner). */
export function laurelSVG(side = 'left') {
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const a = Math.PI * (0.6 + t * 0.75);
    const x = 50 + Math.cos(a) * 38;
    const y = 50 - Math.sin(a) * 38;
    const rot = (a * 180) / Math.PI + 90;
    leaves.push(
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="5" ry="11" transform="rotate(${f(-rot)} ${f(x)} ${f(y)})"/>`,
    );
  }
  const flip = side === 'right' ? 'transform="scale(-1 1) translate(-100 0)"' : '';
  return `<svg class="laurel laurel-${side}" viewBox="0 0 100 100" aria-hidden="true">
    <g ${flip} fill="#e8c06a" stroke="#4a3112" stroke-width="1.5">
    <path d="M40 92 Q8 60 30 14" fill="none" stroke="#c9973f" stroke-width="3"/>${leaves.join('')}</g></svg>`;
}

/** Semi-circular gauge with a needle; value 0..1. */
export function gaugeSVG(value = 0.5, label = '') {
  const g = nid('ga');
  const a = Math.PI * (1 + Math.max(0, Math.min(1, value)));
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const t = Math.PI * (1 + i / 10);
    const r0 = i % 5 ? 33 : 30;
    ticks.push(`<line x1="${f(50 + Math.cos(t) * r0)}" y1="${f(54 + Math.sin(t) * r0)}"
      x2="${f(50 + Math.cos(t) * 38)}" y2="${f(54 + Math.sin(t) * 38)}"/>`);
  }
  return `<svg class="gauge" viewBox="0 0 100 64" aria-hidden="true"><defs>${brassGrad(g, 80)}</defs>
    <path d="M6 58 A44 44 0 0 1 94 58 Z" fill="url(#${g})" stroke="#2b1a08" stroke-width="2"/>
    <path d="M12 56 A38 38 0 0 1 88 56 Z" fill="#f3e8c9" stroke="#7a5420" stroke-width="1.5"/>
    <path d="M72 30 A28 28 0 0 1 82 50" fill="none" stroke="#8c2f2b" stroke-width="5" opacity=".75"/>
    <g stroke="#3a2610" stroke-width="1.6">${ticks.join('')}</g>
    <line class="gauge-needle" x1="50" y1="54" x2="${f(50 + Math.cos(a) * 34)}" y2="${f(54 + Math.sin(a) * 34)}"
      stroke="#8c2f2b" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="50" cy="54" r="4.5" fill="#c9973f" stroke="#2b1a08" stroke-width="1.5"/>
    ${label ? `<text x="50" y="44" text-anchor="middle" font-size="9" fill="#4a3112" font-family="Georgia,serif">${escapeXML(label)}</text>` : ''}
    </svg>`;
}

/**
 * The title emblem: a great brass gear with crossed cannons behind it and an airship sailing
 * across a starry porthole. Animated purely with CSS classes (emb-gear, emb-ship, emb-smoke…).
 */
export function emblemSVG() {
  const brass = nid('eb');
  const brass2 = nid('eb2');
  const sky = nid('es');
  const env = nid('ee');
  const iron = nid('ei');
  const clip = nid('ec');
  const stars = [
    [118, 92], [140, 76], [196, 84], [212, 110], [126, 160], [205, 150], [170, 70], [110, 128],
  ]
    .map(([x, y], i) => `<circle class="emb-star" style="--d:${i * 0.37}s" cx="${x}" cy="${y}" r="${i % 3 ? 1.1 : 1.7}"/>`)
    .join('');
  const rivets = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rivets.push(`<circle cx="${f(160 + Math.cos(a) * 82)}" cy="${f(124 + Math.sin(a) * 82)}" r="2.6"/>`);
  }
  const ticks = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 4 ? 70 : 66;
    ticks.push(`<line x1="${f(160 + Math.cos(a) * r0)}" y1="${f(124 + Math.sin(a) * r0)}" x2="${f(160 + Math.cos(a) * 73)}" y2="${f(124 + Math.sin(a) * 73)}"/>`);
  }
  const cannon = (flip) => `<g transform="${flip ? 'translate(320 0) scale(-1 1)' : ''}">
      <g transform="rotate(-38 160 124)">
        <rect x="40" y="114" width="250" height="20" rx="6" fill="url(#${iron})" stroke="#0e0f12" stroke-width="2"/>
        <rect x="270" y="110" width="22" height="28" rx="4" fill="url(#${brass2})" stroke="#2b1a08" stroke-width="2"/>
        <rect x="200" y="112" width="10" height="24" rx="2" fill="url(#${brass2})" stroke="#2b1a08" stroke-width="1.5"/>
        <rect x="120" y="111" width="10" height="26" rx="2" fill="url(#${brass2})" stroke="#2b1a08" stroke-width="1.5"/>
        <circle cx="40" cy="124" r="14" fill="url(#${brass2})" stroke="#2b1a08" stroke-width="2"/>
        <circle cx="40" cy="124" r="5" fill="#4a3112"/>
        <ellipse class="emb-muzzle" cx="292" cy="124" rx="4" ry="9" fill="#1a120a"/>
      </g></g>`;
  return `<svg class="emblem" viewBox="0 0 320 250" role="img" aria-label="Brass and Ballast emblem">
  <defs>
    ${brassGrad(brass, 60)}${brassGrad(brass2, 100)}
    <radialGradient id="${sky}" cx=".42" cy=".3" r=".85"><stop offset="0" stop-color="#3d5f86"/>
      <stop offset=".55" stop-color="#1f3350"/><stop offset="1" stop-color="#0d1524"/></radialGradient>
    <linearGradient id="${env}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/>
      <stop offset=".45" stop-color="#f3e8c9"/><stop offset="1" stop-color="#b9a575"/></linearGradient>
    <linearGradient id="${iron}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3ad"/>
      <stop offset=".35" stop-color="#5b626b"/><stop offset="1" stop-color="#1f2328"/></linearGradient>
    <clipPath id="${clip}"><circle cx="160" cy="124" r="64"/></clipPath>
  </defs>
  <g class="emb-cannons">${cannon(false)}${cannon(true)}</g>
  <g class="emb-smoke" fill="#f4f1ea">
    <circle class="puff p1" cx="290" cy="18" r="9"/><circle class="puff p2" cx="30" cy="18" r="9"/>
    <circle class="puff p3" cx="298" cy="8" r="6"/><circle class="puff p4" cx="22" cy="8" r="6"/>
  </g>
  <g class="emb-gear-wrap"><g class="emb-gear">
    <path d="${gearPath(160, 124, 104, 30, 14)}" fill="url(#${brass})" stroke="#2b1a08" stroke-width="2.5"/>
    <circle cx="160" cy="124" r="88" fill="none" stroke="#7a5420" stroke-width="3"/>
    <g fill="#fbe7a9" stroke="#4a3112" stroke-width="1">${rivets.join('')}</g>
  </g></g>
  <circle cx="160" cy="124" r="76" fill="#2b1d10" stroke="#4a3112" stroke-width="3"/>
  <circle cx="160" cy="124" r="66" fill="url(#${sky})"/>
  <g stroke="#c9973f" stroke-width="1.4" opacity=".9">${ticks.join('')}</g>
  <g clip-path="url(#${clip})">
    <g fill="#fff3c4">${stars}</g>
    <g class="emb-clouds" fill="#f4f1ea" opacity=".22">
      <ellipse cx="120" cy="170" rx="40" ry="9"/><ellipse cx="200" cy="176" rx="46" ry="10"/>
      <ellipse cx="160" cy="186" rx="60" ry="10"/>
    </g>
    <g class="emb-ship">
      <path d="M104 118 l-16 -14 l6 16 l-6 16 l16 -14z" fill="#8c2f2b" stroke="#1a120a" stroke-width="1.5"/>
      <ellipse cx="156" cy="118" rx="52" ry="21" fill="url(#${env})" stroke="#1a120a" stroke-width="2"/>
      <g fill="none" stroke="#9e8a5e" stroke-width="1.2">
        <path d="M128 99 Q122 118 128 137"/><path d="M146 97.5 Q141 118 146 138.5"/>
        <path d="M166 97.5 Q171 118 166 138.5"/><path d="M186 100 Q192 118 186 136"/>
        <path d="M106 118 H206" stroke="#c9973f" stroke-width="1.6"/>
      </g>
      <path d="M118 104 Q150 92 196 104" fill="none" stroke="#fff" stroke-width="2.4" opacity=".7"/>
      <g stroke="#3f2812" stroke-width="1.2"><line x1="140" y1="137" x2="146" y2="148"/>
        <line x1="172" y1="137" x2="166" y2="148"/></g>
      <rect x="138" y="146" width="38" height="12" rx="4" fill="url(#${brass2})" stroke="#1a120a" stroke-width="1.5"/>
      <circle cx="148" cy="152" r="2.4" fill="#ffe08a" stroke="#4a3112"/><circle cx="157" cy="152" r="2.4" fill="#ffe08a" stroke="#4a3112"/>
      <circle cx="166" cy="152" r="2.4" fill="#ffe08a" stroke="#4a3112"/>
      <rect x="175" y="149" width="14" height="5" rx="2" fill="#353a41" stroke="#1a120a"/>
      <g class="emb-prop"><ellipse cx="134" cy="152" rx="2" ry="9" fill="#a0703e" stroke="#3f2812"/></g>
      <path d="M86 110 q-10 -2 -18 2" class="emb-trail" fill="none" stroke="#f4f1ea" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    </g>
  </g>
  <circle cx="160" cy="124" r="66" fill="none" stroke="#1a120a" stroke-width="3"/>
  <path d="M110 74 A66 66 0 0 1 200 70" fill="none" stroke="#fff" stroke-width="3" opacity=".18"/>
</svg>`;
}

export function escapeXML(s) {
  return String(s).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
