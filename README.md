# flashLang

Système de flashcards auto-alimenté par Hermes, avec révision espacée (FSRS) via une PWA mobile.
Self-hosted, pensé pour tourner en Docker sur TrueNAS SCALE et être exposé via Tailscale.

Voir [CLAUDE.md](CLAUDE.md) pour l'architecture détaillée.

## 1. Prérequis

- Docker + Docker Compose (`docker compose version`)
- Un token d'accès pour Hermes et un pour la PWA (deux secrets distincts)

## 2. Configuration

```sh
cp .env.example .env
```

Éditer `.env` et renseigner :

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | mot de passe Postgres, choisir une valeur forte |
| `HERMES_TOKEN` | token bearer utilisé par le skill Hermes pour créer des cartes |
| `PWA_TOKEN` | token bearer utilisé par la PWA pour lire/réviser |
| `API_PORT` | port publié sur l'hôte (8000 par défaut) |

Générer des tokens forts :
```sh
openssl rand -hex 32
```

`HERMES_TOKEN` et `PWA_TOKEN` doivent être **différents** — c'est ce qui empêche la PWA de créer
des cartes (elle est volontairement lecture/révision seule).

## 3. Démarrer le serveur

```sh
docker compose up -d --build
```

Ceci construit l'image de l'API, applique les migrations Alembic automatiquement au démarrage,
puis lance trois conteneurs :
- `db` — Postgres
- `api` — API REST + sert la PWA (fichiers statiques) sur le même port
- `backup` — dump Postgres quotidien (rétention 30 jours)

Vérifier que tout tourne :
```sh
docker compose ps
docker compose logs -f api
```

## 4. Vérifier que l'API répond

```sh
curl -X POST localhost:8000/cards \
  -H "Authorization: Bearer $HERMES_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"basic","front":"test","back":"test","language":"en"}'
```

Doit renvoyer `201` avec la carte créée. Un deuxième appel avec le même `front` renvoie `409`
(déduplication).

## 5. Utiliser la PWA

1. Ouvrir **`http://localhost:8000`** (ou l'adresse Tailscale de l'hôte en prod) dans un
   **vrai navigateur** — pas `curl` ni "afficher la source". La page est une SPA : le HTML brut
   ne contient qu'un `<main id="app">` vide, tout le contenu est injecté par `app.js` au chargement.
2. Au premier lancement, une invite demande le token — entrer la valeur de `PWA_TOKEN`. Il est
   stocké dans le `localStorage` du navigateur, pas besoin de le ressaisir ensuite.
3. Écran d'accueil : compteur de cartes dues par langue, bouton "Réviser".
4. Écran de révision : tap pour révéler la réponse, puis noter avec Again / Hard / Good / Easy —
   FSRS recalcule automatiquement la prochaine échéance.
5. Sur iPhone : Safari → partager → "Sur l'écran d'accueil" pour l'installer comme app.

**Hors ligne** : les dernières cartes dues chargées restent disponibles en lecture ; les reviews
faites hors connexion sont mises en file et synchronisées au retour du réseau.

## 6. Connecter Hermes

Le skill (tools + règles de création) est dans [hermes-skill/SKILL.md](hermes-skill/SKILL.md).
À donner à Hermes avec :
- `API_BASE_URL` : URL de l'API (IP LAN si Hermes est sur le même réseau, sinon l'adresse Tailscale)
- `HERMES_TOKEN` : le même token que dans `.env`

## 7. Déploiement sur TrueNAS SCALE

Il y a deux façons de déployer : **image pré-construite** (recommandé — pas besoin de cloner le
repo ni de builder sur le NAS) ou **build depuis le source**.

### Option A — image pré-construite (recommandé)

Un workflow GitHub Actions ([.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml))
build et publie l'image `api` sur `ghcr.io/jeremiemarotte/flashlang-api` à chaque push sur `main`
qui touche `api/`. [docker-compose.prod.yml](docker-compose.prod.yml) référence cette image au lieu
de builder — il suffit donc d'avoir **ce seul fichier + un `.env`** sur l'hôte, pas tout le repo.

**Étape préalable, une seule fois** : sur GitHub, après le premier push, rendre le package public
(Profil → Packages → `flashlang-api` → Package settings → Change visibility → Public), sinon le
NAS aura besoin d'un `docker login ghcr.io` pour pull une image privée.

```sh
mkdir flashlang && cd flashlang
curl -O https://raw.githubusercontent.com/jeremiemarotte/flashLang/main/docker-compose.prod.yml
cp .env.example .env   # ou le créer à la main avec les mêmes clés, voir section 2
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Pour l'override ZFS (TrueNAS), utiliser
[deploy/docker-compose.prod.truenas.yml](deploy/docker-compose.prod.truenas.yml) (chemins
`/mnt/<pool>/flashlang/...` à éditer d'abord) :
```sh
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.prod.truenas.yml up -d
```

Mise à jour vers une nouvelle version : `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`.

### Option B — build depuis le source

Cloner le repo entier, puis utiliser `docker-compose.yml` (celui avec `build: ./api`) plus
l'override [deploy/docker-compose.truenas.yml](deploy/docker-compose.truenas.yml) :

```sh
docker compose -f docker-compose.yml -f deploy/docker-compose.truenas.yml up -d --build
```

Éditer au préalable les chemins `/mnt/<pool>/flashlang/...` dans ce fichier pour pointer vers le
bon pool ZFS.

Dans les deux cas, l'accès distant se fait via Tailscale (déjà installé sur l'hôte) — pas de
conteneur tunnel/proxy dans cette stack, il suffit de joindre l'IP/MagicDNS Tailscale de l'hôte
sur le port publié.

### Via Dockge

Dockge exécute simplement `docker compose` sur un dossier de stack.

**Avec l'image pré-construite (Option A, recommandé)** : pas besoin de cloner le repo.
1. Créer un dossier de stack dans Dockge (ex. `flashlang`) et n'y déposer que
   `docker-compose.prod.yml` (copier son contenu dans l'éditeur de compose de Dockge, ou le
   télécharger dans le dossier de la stack).
2. Onglet `.env` de la stack : reprendre `.env.example` avec de vraies valeurs.
3. Pour l'override ZFS, ajouter dans ce `.env` :
   ```
   COMPOSE_FILE=docker-compose.prod.yml:deploy/docker-compose.prod.truenas.yml
   ```
   (nécessite alors que `deploy/docker-compose.prod.truenas.yml` soit aussi présent dans le
   dossier de la stack, édité avec le bon pool ZFS.)
4. Bouton "Deploy" — Dockge fait `docker compose pull` + `up -d`, pas de build.
5. Mise à jour : re-cliquer "Deploy" (Dockge re-pull l'image `:latest`), ou changer `IMAGE_TAG`
   dans le `.env` pour épingler une version précise (le tag `:sha-du-commit` est aussi publié).

**Avec le build depuis le source (Option B)** : cloner tout le repo dans le dossier de stacks de
Dockge (le build de `api` a besoin du Dockerfile et du code source à côté du compose file) :
```sh
cd /opt/stacks && git clone https://github.com/jeremiemarotte/flashLang.git flashlang
```
Puis suivre les mêmes étapes 2-5 en remplaçant `docker-compose.prod.yml` par `docker-compose.yml`
et `deploy/docker-compose.prod.truenas.yml` par `deploy/docker-compose.truenas.yml`. Mise à jour :
`git pull` dans le dossier de la stack, puis re-déployer.

## 8. Arrêter / réinitialiser

```sh
docker compose down        # arrête les conteneurs, garde les données
docker compose down -v     # arrête et supprime les volumes (perte de données — dev uniquement)
```

## Dépannage

- **La page semble vide en `curl` ou "afficher la source"** : normal, voir section 5 — c'est une
  SPA, il faut l'ouvrir dans un navigateur pour que `app.js` s'exécute.
- **Page réellement blanche dans un navigateur** : ouvrir les outils de développement (Cmd+Option+I)
  → onglet Console, et vérifier l'erreur JS affichée.
- **401 sur `/cards`** : vérifier que le token envoyé correspond à `HERMES_TOKEN` (la PWA n'a pas
  le droit de créer des cartes, c'est volontaire).
- **409 sur `POST /cards`** : la carte existe déjà (même `front` normalisé, même langue) — ce n'est
  pas une erreur à corriger côté Hermes, juste ignorer.
