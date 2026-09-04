// hud.js — Interface peinte dans le canvas pendant la course : les mètres en
// gros (serif de l'e-card), le multiplicateur, la rangée de potes et la
// jauge vers le prochain, le décompte 3-2-1-GO, le rappel des commandes.
// Le canvas ne lit pas les variables CSS : mêmes valeurs qu'index.html.

const BLANC = "#ffffff";
const NOIR = "#0d0d10";
const JAUNE = "#ffcf2e";
const ROUGE = "#e13e26";
const PANNEAU = "rgba(13,13,16,0.72)";
const POLICE = '"Stage Grotesk", system-ui, sans-serif';
const POLICE_TITRE = '"Source Serif 2", Georgia, serif';
const PAD = 16;

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function formatMetres(m) {
  return `${Math.floor(m).toLocaleString("fr-FR")}`;
}

// `hud` = { metres, potes, potesMax, gaugeT (0..1 vers le prochain pote),
//           mult (multiplicateur des mètres), nextIn (points manquants) }
export function renderHud(ctx, width, height, hud) {
  ctx.save();
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;

  // Mètres, centrés en haut. Chiffre en serif, unité en grotesk.
  const num = formatMetres(hud.metres);
  ctx.font = `900 42px ${POLICE_TITRE}`;
  const wNum = ctx.measureText(num).width;
  ctx.font = `700 15px ${POLICE}`;
  const wUnit = ctx.measureText(" m").width;
  const x0 = width / 2 - (wNum + wUnit) / 2;
  ctx.fillStyle = BLANC;
  ctx.textAlign = "left";
  ctx.font = `900 42px ${POLICE_TITRE}`;
  ctx.fillText(num, x0, PAD - 4);
  ctx.font = `700 15px ${POLICE}`;
  ctx.fillText(" m", x0 + wNum, PAD + 20);

  // Multiplicateur (mètres × potes) : pastille crème sous les mètres.
  if (hud.mult > 1.001) {
    ctx.shadowBlur = 0;
    const txt = `×${String(hud.mult).replace(".", ",")}`;
    ctx.font = `900 13px ${POLICE}`;
    const w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = JAUNE;
    roundRect(ctx, width / 2 - w / 2, PAD + 44, w, 22, 3);
    ctx.fill();
    ctx.fillStyle = "#4a3305";
    ctx.textAlign = "center";
    ctx.fillText(txt, width / 2, PAD + 48);
    ctx.shadowBlur = 8;
  }

  // Potes : rangée de 8 cases en haut à droite, pleines = présents.
  const cell = 11, gap = 4;
  const total = hud.potesMax;
  const rowW = total * cell + (total - 1) * gap;
  const rx = width - PAD - rowW, ry = PAD + 2;
  for (let i = 0; i < total; i++) {
    const x = rx + i * (cell + gap);
    ctx.fillStyle = i < hud.potes ? BLANC : "rgba(255,255,255,0.28)";
    roundRect(ctx, x, ry, cell, cell, 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.font = `700 11px ${POLICE}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(hud.potes === 0 ? "TOUT SEUL" : hud.potes === 1 ? "1 POTE" : `${hud.potes} POTES`, width - PAD, ry + cell + 5);
  // Jauge vers le prochain pote (masquée quand le peloton est plein).
  if (hud.potes < total) {
    const gy = ry + cell + 22;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(ctx, rx, gy, rowW, 4, 2);
    ctx.fill();
    ctx.fillStyle = JAUNE;
    roundRect(ctx, rx, gy, Math.max(4, rowW * Math.min(1, hud.gaugeT)), 4, 2);
    ctx.fill();
  }
  ctx.restore();
}

// Décompte « 3, 2, 1, GO » calé sur les temps (voir main.js).
export function renderCountIn(ctx, width, height, t, beatPeriod, beats, linger) {
  let texte, age;
  if (t < 0) {
    const restant = -t / beatPeriod;
    const n = Math.ceil(restant);
    if (n > beats) return;
    texte = `${n}`;
    age = (n - restant) * beatPeriod;
  } else {
    if (t >= linger) return;
    texte = "GO !";
    age = t;
  }
  const tPop = Math.min(1, age / 0.22);
  const scale = 1.45 - 0.45 * tPop;
  const alpha = t < 0 ? 1 : Math.max(0, 1 - (t / linger) ** 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(width / 2, Math.max(height * 0.3, 190));
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 18;
  ctx.font = `900 ${t < 0 ? 78 : 64}px ${POLICE_TITRE}`;
  ctx.fillStyle = t < 0 ? BLANC : JAUNE;
  ctx.fillText(texte, 0, 0);
  ctx.restore();
}

// Rappel des commandes, en bas, pendant les premières secondes de course.
export function renderHint(ctx, width, height, alpha) {
  if (alpha <= 0.01) return;
  const txt = "SWIPE = CHANGER DE VOIE   ·   TAP = SAUTER";
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 12px ${POLICE}`;
  const w = ctx.measureText(txt).width + 28;
  const h = 30;
  const x = width / 2 - w / 2, y = height * 0.82;
  ctx.fillStyle = PANNEAU;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = BLANC;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, width / 2, y + h / 2);
  ctx.restore();
}

// Bandeau ponctuel (« +1 POTE », « −2 POTES », « SOBERLAND EST LÀ ! ») :
// même vocabulaire que le bandeau de palier du premier jeu.
export function renderBanner(ctx, width, height, banner) {
  if (!banner || banner.timer <= 0) return;
  const age = banner.duree - banner.timer;
  ctx.save();
  ctx.globalAlpha = Math.min(1, banner.timer * 2, age * 6);
  ctx.font = `900 19px ${POLICE}`;
  const w = Math.max(190, ctx.measureText(banner.titre).width + 44);
  const h = banner.sous ? 62 : 44;
  const y = height * 0.72;
  const tPop = Math.min(1, age / 0.3);
  const scale = 0.8 + 0.2 * tPop + 0.06 * Math.sin(tPop * Math.PI);
  ctx.translate(width / 2, y + h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -(y + h / 2));
  const x = (width - w) / 2;
  ctx.shadowColor = banner.couleur === ROUGE ? "rgba(225,62,38,0.5)" : "rgba(255,207,46,0.5)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = PANNEAU;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = banner.couleur;
  roundRect(ctx, x, y, w, 3, 1);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = banner.couleur;
  ctx.fillText(banner.titre, width / 2, y + 11);
  if (banner.sous) {
    ctx.font = `500 13px ${POLICE}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(banner.sous, width / 2, y + 37);
  }
  ctx.restore();
}
