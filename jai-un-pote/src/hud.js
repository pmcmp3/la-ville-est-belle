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
// Police réduite jusqu'à tenir dans maxW (responsive : « ça dépasse de partout »).
function fitFont(ctx, weight, size, text, maxW, min = 9) {
  let t = size;
  ctx.font = `${weight} ${t}px ${POLICE}`;
  while (ctx.measureText(text).width > maxW && t > min) { t -= 1; ctx.font = `${weight} ${t}px ${POLICE}`; }
  return t;
}

// `hud` = { metres, potes, potesMax, gaugeT, mult, restant, elan, restantS, turbo, safeTop }
// Disposition (7 septembre 2026, « en haut tout se marche dessus ») :
//   gauche  : pause (DOM), et SOUS lui la barre SALTO ;
//   centre  : les mètres (taille adaptée au nombre de chiffres), le chrono ;
//   droite  : les 8 cases, « N POTES », la jauge du prochain.
// La pastille ×N vit SOUS le chrono, et le bandeau d'événement plus bas
// encore (renderBanner) : trois étages qui ne se chevauchent jamais.
export function renderHud(ctx, width, height, hud) {
  ctx.save();
  const top = hud.safeTop || 0;
  const bandH = 128 + top;
  const band = ctx.createLinearGradient(0, 0, 0, bandH);
  band.addColorStop(0, "rgba(13,13,16,0.8)");
  band.addColorStop(0.72, "rgba(13,13,16,0.55)");
  band.addColorStop(1, "rgba(13,13,16,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, width, bandH);
  ctx.textBaseline = "top";

  // Colonnes : gauche = 14..(14+96), droite = 8 cases de 10 px.
  const cell = 10, gap = 3, total = hud.potesMax;
  const rowW = total * cell + (total - 1) * gap;
  const rx = width - PAD - rowW;
  const leftEnd = 14 + 96 + 10, rightStart = rx - 10;
  const centerW = rightStart - leftEnd;
  const cx = (leftEnd + rightStart) / 2;

  // Mètres : serif, taille réduite si ça ne tient pas entre les colonnes.
  const num = formatMetres(hud.metres);
  let taille = 40;
  ctx.font = `900 ${taille}px ${POLICE_TITRE}`;
  while (ctx.measureText(num).width + 22 > centerW && taille > 22) { taille -= 2; ctx.font = `900 ${taille}px ${POLICE_TITRE}`; }
  const wNum = ctx.measureText(num).width;
  ctx.font = `700 14px ${POLICE}`;
  const wUnit = ctx.measureText(" m").width;
  const x0 = cx - (wNum + wUnit) / 2;
  ctx.fillStyle = BLANC;
  ctx.textAlign = "left";
  ctx.font = `900 ${taille}px ${POLICE_TITRE}`;
  ctx.fillText(num, x0, top + PAD - 6);
  ctx.font = `700 14px ${POLICE}`;
  ctx.fillText(" m", x0 + wNum, top + PAD + taille * 0.5 - 4);

  // Chrono sous les mètres.
  if (hud.restantS !== undefined) {
    const s = Math.max(0, hud.restantS);
    ctx.font = `700 12px ${POLICE}`;
    ctx.textAlign = "center";
    ctx.fillStyle = s <= 10 ? ROUGE : "rgba(255,255,255,0.75)";
    ctx.fillText(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`, cx, top + PAD + taille * 0.9 + 2);
  }
  // Pastille ×N sous le chrono.
  if (hud.mult > 1.001) {
    const txt = `×${String(hud.mult).replace(".", ",")}${hud.turbo ? " TURBO" : ""}`;
    ctx.font = `900 12px ${POLICE}`;
    const w = ctx.measureText(txt).width + 16;
    ctx.fillStyle = JAUNE;
    roundRect(ctx, cx - w / 2, top + PAD + taille * 0.9 + 18, w, 20, 3);
    ctx.fill();
    ctx.fillStyle = "#4a3305";
    ctx.textAlign = "center";
    ctx.fillText(txt, cx, top + PAD + taille * 0.9 + 22);
  }

  // Droite : cases, compte, jauge.
  const ry = top + PAD + 2;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < hud.potes ? BLANC : "rgba(255,255,255,0.28)";
    roundRect(ctx, rx + i * (cell + gap), ry, cell, cell, 2);
    ctx.fill();
  }
  ctx.font = `700 11px ${POLICE}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(hud.potes === 0 ? "TOUT SEUL" : hud.potes === 1 ? "1 POTE" : `${hud.potes} POTES`, width - PAD, ry + cell + 5);
  if (hud.potes < total) {
    const gy = ry + cell + 22;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(ctx, rx, gy, rowW, 4, 2);
    ctx.fill();
    ctx.fillStyle = JAUNE;
    roundRect(ctx, rx, gy, Math.max(4, rowW * Math.min(1, hud.gaugeT)), 4, 2);
    ctx.fill();
    fitFont(ctx, "700", 10, `PROCHAIN POTE : ${hud.restant}`, rowW + 30, 8);
    ctx.fillStyle = JAUNE;
    ctx.fillText(`PROCHAIN POTE : ${hud.restant} PIÈCE${hud.restant > 1 ? "S" : ""}`, width - PAD, gy + 9);
  }

  // Gauche : barre SALTO sous le bouton pause (44 px de haut à 14 + safeTop).
  const ex = 14, ey = top + 14 + 44 + 18, ew = 96;
  ctx.font = `700 9px ${POLICE}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(hud.elan >= 1 ? "SALTO PRÊT" : "SALTO", ex, ey - 12);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  roundRect(ctx, ex, ey, ew, 5, 2);
  ctx.fill();
  ctx.fillStyle = hud.elan >= 1 ? JAUNE : "rgba(255,255,255,0.6)";
  roundRect(ctx, ex, ey, Math.max(3, ew * Math.min(1, hud.elan)), 5, 2);
  ctx.fill();
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
  const txt = "SWIPE = VOIE  ·  TAP = SAUT  ·  RE-TAP EN L'AIR = SALTO";
  ctx.save();
  ctx.globalAlpha = alpha;
  fitFont(ctx, "700", 12, txt, width - 60, 8);
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
export function renderBanner(ctx, width, height, banner, safeTop = 0) {
  if (!banner || banner.timer <= 0) return;
  const age = banner.duree - banner.timer;
  ctx.save();
  ctx.globalAlpha = Math.min(1, banner.timer * 2, age * 6);
  const maxW = Math.min(width - 48, 340);
  fitFont(ctx, "900", 18, banner.titre, maxW - 40, 12);
  const w = Math.max(180, Math.min(maxW, ctx.measureText(banner.titre).width + 44));
  const h = banner.sous ? 58 : 42;
  const y = safeTop + 150; // sous les trois étages du HUD
  const tPop = Math.min(1, age / 0.3);
  const scale = 0.85 + 0.15 * tPop + 0.05 * Math.sin(tPop * Math.PI);
  ctx.translate(width / 2, y + h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -(y + h / 2));
  const x = (width - w) / 2;
  ctx.fillStyle = PANNEAU;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = banner.couleur;
  roundRect(ctx, x, y, w, 3, 1);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = banner.couleur;
  ctx.fillText(banner.titre, width / 2, y + 11);
  if (banner.sous) {
    fitFont(ctx, "500", 12, banner.sous, w - 20, 9);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(banner.sous, width / 2, y + 35);
  }
  ctx.restore();
}

// Effets du TURBO LAIT : flou de vitesse sur les côtés (bandes translucides
// qui filent). Les couleurs saturées viennent du CSS (canvas.turbo).
export function renderTurbo(ctx, width, height, t, force) {
  if (force <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = force;
  for (const side of [0, 1]) {
    const g = ctx.createLinearGradient(side ? width : 0, 0, side ? width - width * 0.28 : width * 0.28, 0);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(side ? width * 0.72 : 0, 0, width * 0.28, height);
  }
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 14; i++) {
    const side = i % 2;
    const x = side ? width - 6 - (i * 13) % 90 : 6 + (i * 13) % 90;
    const len = 60 + (i * 37) % 120;
    const y = ((t * (900 + i * 90) + i * 173) % (height + len)) - len;
    ctx.fillRect(x, y, 2, len);
  }
  ctx.restore();
}

// Tutoriel du tout début : une consigne à la fois, en gros, jusqu'au geste.
export function renderTuto(ctx, width, height, tuto) {
  if (!tuto) return;
  ctx.save();
  const w = Math.min(width - 32, 340), h = tuto.sous ? 96 : 74;
  const x = width / 2 - w / 2, y = height * 0.3;
  ctx.globalAlpha = tuto.alpha;
  ctx.fillStyle = PANNEAU;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = tuto.ok ? JAUNE : BLANC;
  roundRect(ctx, x, y, w, 3, 1);
  ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.font = `700 10px ${POLICE}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(tuto.ok ? "BIEN !" : `TUTO ${tuto.index}/${tuto.total}`, width / 2, y + 12);
  fitFont(ctx, "900", 21, tuto.titre, w - 24, 12);
  ctx.fillStyle = tuto.ok ? JAUNE : BLANC;
  ctx.fillText(tuto.titre, width / 2, y + 28);
  if (tuto.sous) {
    fitFont(ctx, "500", 13, tuto.sous, w - 24, 9);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(tuto.sous, width / 2, y + 60);
  }
  ctx.restore();
}

// Fin du morceau = fin de la course : « TERMINÉ ! » en énorme, en serif.
export function renderFin(ctx, width, height, age) {
  const tPop = Math.min(1, age / 0.25);
  ctx.save();
  ctx.globalAlpha = Math.min(1, age * 4);
  ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.8 - age * 1.2)})`;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height * 0.34);
  ctx.scale(1.4 - 0.4 * tPop, 1.4 - 0.4 * tPop);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `900 58px ${POLICE_TITRE}`;
  ctx.fillStyle = NOIR;
  ctx.fillText("TERMINÉ !", 3, 3);
  ctx.fillStyle = JAUNE;
  ctx.fillText("TERMINÉ !", 0, 0);
  ctx.font = `700 13px ${POLICE}`;
  ctx.fillStyle = BLANC;
  ctx.fillText("LE MORCEAU EST FINI", 0, 44);
  ctx.restore();
}
