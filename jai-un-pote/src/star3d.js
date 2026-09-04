// star3d.js — L'étoile Mario en vrai volume, extraite telle quelle
// d'entities-render.js (premier jeu, refonte du 21 août 2026) : faces
// bombées à 10 facettes en cel-shading 3 tons, tranche qui suit le contour,
// yeux sur les deux faces. Centrée sur l'origine du contexte.

const STAR_LINE = "#2b1a06";
const STAR_EYE_WHITE = "#ffffff";
const STAR_FACE_TONES = ["#f0a81c", "#ffcf2e", "#ffe45e"];
const STAR_SIDE_TONES = ["#a86a08", "#c07f0c", "#e8a012"];
const GOLD_FACE_TONES = ["#efd280", "#fff3c2", "#fffbe8"];
const GOLD_SIDE_TONES = ["#a5822a", "#caa233", "#e8c76a"];
const STAR_INNER = 0.5;
const STAR_THICK = 0.36;
const STAR_BUMP = 0.16;
const STAR_SHADE_BUMP = 0.55;
const STAR_LIGHT = [-0.42, -0.57, 0.7];

const STAR_CONTOUR = [];
for (let i = 0; i < 10; i++) {
  const rad = i % 2 === 0 ? 1 : STAR_INNER;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  STAR_CONTOUR.push([Math.cos(a) * rad, Math.sin(a) * rad]);
}

function celTone(tones, lambert) {
  return lambert > 0.62 ? tones[2] : lambert > 0.18 ? tones[1] : tones[0];
}

export function drawStar3D(ctx, R, spin, gold = false) {
  const faceTones = gold ? GOLD_FACE_TONES : STAR_FACE_TONES;
  const sideTones = gold ? GOLD_SIDE_TONES : STAR_SIDE_TONES;
  const cosT = Math.cos(spin), sinT = Math.sin(spin);
  const [LX, LY, LZ] = STAR_LIGHT;
  const halfT = R * STAR_THICK / 2;
  const nearZ = cosT >= 0 ? halfT : -halfT;
  const farZ = -nearZ;
  const px = (x, z) => x * cosT - z * sinT;

  const facePolys = (zBase) => {
    const dir = Math.sign(zBase);
    const apexZ = zBase + dir * R * STAR_BUMP;
    const apexX = px(0, apexZ);
    const out = [];
    for (let i = 0; i < 10; i++) {
      const [ax, ay] = STAR_CONTOUR[i];
      const [bx, by] = STAR_CONTOUR[(i + 1) % 10];
      const shadeUz = -dir * R * STAR_SHADE_BUMP;
      const ux = ax * R, uy = ay * R, uz = shadeUz;
      const vx = bx * R, vy = by * R, vz = shadeUz;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      if (nz * dir < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const len = Math.hypot(nx, ny, nz) || 1;
      const rnx = (nx * cosT - nz * sinT) / len;
      const rnz = (nx * sinT + nz * cosT) / len;
      const lambert = rnx * LX + (ny / len) * LY + rnz * LZ;
      out.push({
        pts: [[apexX, 0], [px(ax * R, zBase), ay * R], [px(bx * R, zBase), by * R]],
        color: celTone(faceTones, lambert),
      });
    }
    return out;
  };

  const sideQuads = [];
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = STAR_CONTOUR[i];
    const [bx, by] = STAR_CONTOUR[(i + 1) % 10];
    let nx = (by - ay), ny = -(bx - ax);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const len = Math.hypot(nx, ny) || 1;
    const rnx = (nx / len) * cosT;
    const rnz = (nx / len) * sinT;
    const lambert = rnx * LX + (ny / len) * LY + rnz * LZ;
    sideQuads.push({
      depth: mx * sinT,
      pts: [
        [px(ax * R, halfT), ay * R], [px(bx * R, halfT), by * R],
        [px(bx * R, -halfT), by * R], [px(ax * R, -halfT), ay * R],
      ],
      color: celTone(sideTones, lambert),
    });
  }
  sideQuads.sort((a, b) => a.depth - b.depth);

  const nearFace = facePolys(nearZ);
  const farFace = facePolys(farZ);
  const tracePoly = (pts) => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  const fillPolys = (polys) => {
    for (const poly of polys) {
      ctx.fillStyle = poly.color;
      ctx.beginPath();
      tracePoly(poly.pts);
      ctx.fill();
    }
  };

  ctx.beginPath();
  for (const poly of farFace) tracePoly(poly.pts);
  for (const quad of sideQuads) tracePoly(quad.pts);
  for (const poly of nearFace) tracePoly(poly.pts);
  ctx.fillStyle = STAR_LINE;
  ctx.strokeStyle = STAR_LINE;
  ctx.lineWidth = Math.max(1, R * 0.18);
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();

  fillPolys(farFace);
  fillPolys(sideQuads);
  fillPolys(nearFace);

  const faceVis = Math.abs(cosT);
  if (faceVis > 0.12) {
    const dir = Math.sign(nearZ);
    const eyeZ = nearZ + dir * R * STAR_BUMP * 0.45;
    const eyeY = -R * 0.02;
    const eyeRx = R * 0.15 * faceVis, eyeRy = R * 0.26;
    for (const s of [-1, 1]) {
      const ex = px(s * R * 0.26, eyeZ);
      ctx.fillStyle = STAR_EYE_WHITE;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeRx * 1.35, eyeRy * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = STAR_LINE;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
