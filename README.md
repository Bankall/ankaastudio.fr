# Ankaa Studio

Site vitrine React JavaScript pour Ankaa Studio, photographe canine basée dans la Marne. Le projet est construit avec Vite et pensé pour un hébergement statique sur Amazon S3, avec une option CloudFront.

## Lancer le projet

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm run preview
```

Le build de production est généré dans `dist/`.

## Structure

- `src/components/` contient les blocs réutilisables.
- `src/pages/` contient les pages routées.
- `src/data/` contient les contenus éditables.
- `public/` contient les fichiers statiques SEO et la fallback page pour le routing côté client.

## Routing sur S3

Le site utilise React Router avec une route de secours statique. Pour que les liens profonds fonctionnent sur Amazon S3, configurez le bucket en site statique avec `index.html` comme document d’index et d’erreur, ou placez le site derrière CloudFront avec une règle d’erreur vers `index.html`.

Le fichier `public/404.html` redirige aussi les routes inconnues vers l’application avec la route d’origine conservée dans l’URL.

## SEO

Les pages incluent des titres, descriptions, balises canoniques, données structurées et une sitemap. Les pages futures `À propos` et `Blog` sont déjà présentes dans l’architecture et marquées `noindex` tant qu’elles restent en attente de contenu final.

## Déploiement

Un workflow GitHub Actions est fourni dans `.github/workflows/deploy.yml`. Il attend les secrets suivants:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID` si CloudFront est utilisé

## Logo

L’architecture comporte un emplacement de branding réutilisable. Si vous souhaitez brancher le logo officiel, remplacez le composant `BrandLogo` ou injectez votre fichier d’asset dans la couche de marque.# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
