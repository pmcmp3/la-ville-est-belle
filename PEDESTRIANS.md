# Les piétons — Personnalisations et outfits

Les piétons qui marchent dans le jeu sont animés avec des jambes qui alternent et des outfits (couleurs) personnalisables.

## Comment ajouter des outfits

### 1. Dans `src/pedestrians.js` — `PEDESTRIAN_ICONS`

Chaque outfit est défini par un objet avec 4 couleurs :
- `head` : couleur de la tête
- `shirt` : couleur du haut du corps (chemise/t-shirt)
- `pants` : couleur du bas (pantalon)
- `shoes` : couleur des chaussures

**Exemple** : Ajouter un outfit "vert" :
```javascript
export const PEDESTRIAN_ICONS = {
  default: { head: "#c9a87a", shirt: "#4a90e2", pants: "#2a2a2a", shoes: "#1a1a1a" },
  red: { head: "#d4a574", shirt: "#e13e26", pants: "#1a1a1a", shoes: "#0a0a0a" },
  blue: { head: "#c9a87a", shirt: "#1e90ff", pants: "#003d7a", shoes: "#0a0a0a" },
  yellow: { head: "#d4a574", shirt: "#ffcc00", pants: "#2a2a2a", shoes: "#1a1a1a" },
  green: { head: "#d4a574", shirt: "#22aa33", pants: "#1a3d1a", shoes: "#0a1a0a" }, // ← Nouveau
};
```

### 2. Les outfits sont affectés aléatoirement (en déterministe) aux piétons

Chaque piéton reçoit un outfit en fonction de son slot de spawn. Aucun ajout de code nécessaire — tant que vous avez mis l'outfit dans `PEDESTRIAN_ICONS`, les piétons vont l'utiliser.

## Animation

Les piétons marchent avec :
- **Jambes qui alternent** : la jambe gauche et la jambe droite bougent en opposition
- **Bras qui balancent** : en sync avec les jambes
- **Cadence** : ~3× la vitesse du temps réel (réglable via `walkPhase` dans `makePedestrianIcon`)

## Tailles et proportions

Définies en haut de `pedestrians.js` (en unités-monde) :
- `PEDESTRIAN_WIDTH` = 0.4
- `PEDESTRIAN_HEIGHT` = 1.0
- `HEAD_SIZE` = 0.15
- etc.

À ajuster selon le style artistique souhaité.

## Intégration

- Les piétons sont déjà spawned comme entités du jeu (type d'obstacle)
- Ils sont animés à chaque frame
- Le rendu se fait dans `entities.js::render()`, détection du type `pieton` + appel à `pedestrians.makePedestrianIcon()`

## TODO

- Rendu pré-compilé des piétons en canvas interne (pour perf, au lieu de redessiner à la volée chaque frame)
- Support des poses spéciales (assis, gestualité, etc.)
- Animation de la marche plus naturaliste (accélération/décélération basée sur la vélocité du piéton)
