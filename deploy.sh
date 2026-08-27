#!/usr/bin/env bash
# Déploiement du jeu sur GitHub Pages (https://la-ville-est-belle-pmc.fr).
# Automatise la recette manuelle d'ARCHITECTURE.md §9 : snapshot `main` sans
# historique + snapshot `gh-pages` du build, tous deux en force-push.
# Usage :  ./deploy.sh "message de commit"
#          DEPLOY_DRY=1 ./deploy.sh "test"   → tout sauf les deux push
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-Mise a jour du jeu}"
BRANCHE_DEV="$(git rev-parse --abbrev-ref HEAD)"
push() { if [ "${DEPLOY_DRY:-0}" = "1" ]; then echo "[dry] git push $*"; else git push "$@"; fi; }

# Prochain numéro libre pour les branches jetables gh-clean-N / gh-pages-clean-N
N=1; while git show-ref --verify --quiet "refs/heads/gh-clean-$N" || git show-ref --verify --quiet "refs/heads/gh-pages-clean-$N"; do N=$((N+1)); done
echo "→ Branches jetables : gh-clean-$N / gh-pages-clean-$N (branche de dev : $BRANCHE_DEV)"

# 0. La branche de dev garde l'historique complet.
git add -A
git commit -m "$MSG" || echo "→ rien à committer sur $BRANCHE_DEV"
push origin "$BRANCHE_DEV"

# 1. Build GitHub Pages (base relative, dossier séparé de dist/)
rm -rf dist-pages
npx vite build --base=./ --outDir=dist-pages
find dist-pages -name '.DS_Store' -delete
touch dist-pages/.nojekyll

# 2. Snapshot `main` (source, un seul commit racine)
git checkout --orphan "gh-clean-$N" >/dev/null
git add -A
git commit -q -m "$MSG"
push origin "gh-clean-$N:main" --force
git checkout -q "$BRANCHE_DEV"

# 3. Snapshot `gh-pages` (build) — DANS UN WORKTREE SÉPARÉ (§9 : jamais dans
#    l'arbre principal, un --orphan à la racine désindexe tout le dépôt).
TMP="$(mktemp -d)/gh-pages"
git worktree add -q -b "gh-pages-clean-$N" "$TMP" "$BRANCHE_DEV"
(
  cd "$TMP"
  git checkout -q --orphan "gh-pages-live-$N"
  git rm -rq --cached .
  git clean -fdxq
  cp -R "$OLDPWD/dist-pages/." .
  git add -A
  git commit -q -m "$MSG"
)
( cd "$TMP" && push origin "HEAD:gh-pages" --force )
git worktree remove --force "$TMP"
git branch -D "gh-pages-clean-$N" "gh-pages-live-$N" >/dev/null 2>&1 || true

echo "✅ Déployé. Le site se rafraîchit en 1 à 2 minutes : https://la-ville-est-belle-pmc.fr"
