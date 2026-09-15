import { defineConfig } from "vite";

// Accès LAN pour tester depuis l'iPhone : `npm run dev` sert déjà sur
// l'IP locale (pas besoin du flag --host, il est activé par défaut ici).
//
// HTTPS local (gyroscope + Web Share exigent un contexte sécurisé) :
// une fois mkcert installé (`brew install mkcert && mkcert -install`),
// décommenter les 3 lignes ci-dessous après avoir ajouté la dépendance
// `vite-plugin-mkcert` (`npm i -D vite-plugin-mkcert`).
//
// import mkcert from "vite-plugin-mkcert";
// ...
// plugins: [mkcert()],
// server: { host: true, https: true },

export default defineConfig({
  server: {
    host: true,
    // Autorise l'accès via un tunnel (cloudflared tunnel --url) : Vite
    // bloque par défaut les requêtes dont le header Host ne correspond pas
    // à localhost/l'IP locale (anti DNS-rebinding). Le sous-domaine
    // trycloudflare.com change à chaque lancement du tunnel, d'où le
    // wildcard plutôt qu'un nom figé — HTTPS public temporaire, utile pour
    // tester le gyroscope (voir plus haut) sans installer de certificat.
    allowedHosts: [".trycloudflare.com"],
  },
});
