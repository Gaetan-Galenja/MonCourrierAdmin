# Mon Courrier Admin — prototype (Concept A)

Copilote qui **explique un courrier administratif français**, en extrait les **échéances**,
**rédige un brouillon de réponse** et **détecte les arnaques** (hameçonnage).

Cible : particuliers, et surtout les **proches qui gèrent le courrier de parents âgés**.
Modèle : freemium (X analyses/mois → abonnement), + angle **B2B2C** (banques, mutuelles, assureurs).

## Lancer en local
L'appli Node n'a **aucune dépendance** à installer (Node.js >= 18).

```
cd "courrier-admin-ia"
node server.js
```
Puis ouvrir http://localhost:5173

Pour l'analyse par **IA locale**, il faut aussi Ollama + un modèle (voir plus bas).
Sans Ollama, l'appli fonctionne quand même : elle bascule automatiquement sur le moteur heuristique.

## Comment ça marche (architecture hybride)
- `analyzer.js` — moteur **heuristique** déterministe spécialisé admin FR : détection du type
  d'expéditeur (Impôts, CAF, URSSAF, Ameli, huissier, énergie, banque, assurance…), extraction
  des dates/délais et montants, **score anti-arnaque**, résumé, actions et brouillon.
- `server.js` — serveur HTTP zéro-dépendance qui orchestre **IA locale + filet heuristique** :
  pour chaque courrier, il exécute les deux moteurs puis les **fusionne**. La détection d'arnaque
  et les consignes de sécurité ne dépendent **jamais** du seul modèle (trop faillible) : on prend
  le pire cas des deux, et en cas d'arnaque on impose des actions/réponses sûres.
- `public/index.html` — interface : saisie/exemples, cartes de résultat, **export agenda (.ics)**,
  copie du brouillon, indicateur d'arnaque.

## IA locale via Ollama (gratuit, privé)
Le prototype utilise **Ollama** en local — aucune donnée ne sort de la machine.

Prérequis (déjà installés sur ce poste) :
```
winget install Ollama.Ollama
ollama pull qwen2.5:7b     # qualité (défaut, analyse texte)
ollama pull qwen2.5:3b     # rapide (optionnel, analyse texte)
ollama pull minicpm-v      # OCR photo (modèle de vision)
```

Variables d'environnement (optionnelles) :
- `OLLAMA_MODEL` — modèle d'analyse texte. Défaut `qwen2.5:7b` (qualité). Mettre `qwen2.5:3b` pour le **mode rapide**.
- `OLLAMA_VISION_MODEL` — modèle d'OCR photo. Défaut `minicpm-v`.
- `OLLAMA_URL` — défaut `http://localhost:11434`.
- `USE_OLLAMA=0` — désactive l'IA et n'utilise que le moteur heuristique.

Exemple (mode rapide) :
```
$env:OLLAMA_MODEL="qwen2.5:3b"; node server.js
```

Latence (CPU, sans GPU) : ~35 s par analyse en 7B (1er appel plus long, chargement du modèle),
~15–20 s en 3B. Avec un GPU, c'est quasi instantané. Le filet heuristique, lui, est immédiat.

## Import photo (OCR local)
Le bouton **« Importer une photo »** envoie l'image à `POST /api/ocr` : un modèle de vision
(`minicpm-v`) **transcrit le texte en local**, remplit la zone de saisie (l'utilisateur peut
corriger), puis l'analyse hybride se lance automatiquement. Aucune image n'est envoyée sur Internet.
L'OCR sur CPU prend ~40–70 s (1er appel plus long) ; c'est le poste le plus lourd.

## Monétisation — régie « maison » (sans pistage)
Le fichier `ads.js` contient un catalogue d'**offres partenaires** sélectionnées **par le serveur**
selon le type de courrier détecté (énergie → comparateur d'énergie, huissier → protection juridique,
Ameli → mutuelle, etc.). **Aucun script tiers, aucune donnée envoyée à un annonceur** : c'est ton
serveur qui choisit l'encart. Points clés :
- **Jamais d'encart sur une arnaque** (protection de l'utilisateur + crédibilité).
- Clics comptabilisés **localement** via `GET /api/go/:id` (redirection 302 → lien d'affiliation),
  compteur dans `data/clicks.json`.
- Encart clairement **étiqueté « Partenaire »** + phrase de transparence (obligations légales FR).
- ⚠️ **Remplace les URLs `https://exemple-affiliation.fr/...` par tes vrais liens d'affiliation.**

Ce choix respecte le positionnement « vie privée » du produit, contrairement à une régie type
AdSense (scripts tiers + pistage) déconseillée sur des pages traitant de données sensibles.

## Prochaines étapes (roadmap)
1. ✅ **Import photo + OCR / vision** (fait — transcription locale via `minicpm-v` + correction OCR par le LLM).
2. ✅ **App mobile (PWA installable)** (fait — manifest + service worker + icônes, installable sur écran d'accueil).
3. ✅ **Historique + échéances + export agenda (.ics)** (fait — onglet « Mes dossiers », rappels globaux `.ics`). Reste : comptes multi-utilisateur + coffre de documents.
4. **Rappels e-mail / push** avant échéance (in-app + `.ics` faits ; e-mail/push = étape production).
5. **Hébergement France/UE** + conformité RGPD (argument de vente clé).
6. **Offre B2B2C** en marque blanche.

## Déployer en ligne
L'analyse locale dépend d'Ollama. Pour une mise en ligne, l'app est **prête** (Dockerfile + adaptateur LLM cloud) ; trois options :

**A. Petit hébergeur + IA cloud** (le plus simple)
- Config : `LLM_PROVIDER=openai`, `OPENAI_API_KEY=...`, `OPENAI_MODEL=gpt-4o-mini`. Compatible avec tout endpoint OpenAI-compatible (Mistral, Groq, OpenRouter…) via `OPENAI_BASE_URL`.
- L'analyse texte passe par le cloud ; le **filet heuristique reste actif**. (L'OCR photo reste à brancher côté cloud.)
```
docker build -t courrier-admin .
docker run -p 8080:8080 -e LLM_PROVIDER=openai -e OPENAI_API_KEY=sk-... courrier-admin
```

**B. VPS avec GPU + Ollama** (100 % privé, comme en local)
- Installer Ollama, `ollama pull qwen2.5:7b minicpm-v`, lancer l'app avec `OLLAMA_URL` vers le serveur Ollama. Recommandé si la confidentialité est un argument commercial.

**C. Sans IA** : `USE_OLLAMA=0` → moteur heuristique seul (rapide, gratuit, hors-ligne).

⚠️ La mise en ligne **réelle** nécessite ton **hébergeur + identifiants** (compte, domaine). L'image Docker est prête à pousser.

## Avertissement
Prototype à titre indicatif — ne constitue pas un conseil juridique ou fiscal.
Le moteur heuristique est une démo ; la version IA améliorera nettement la finesse d'analyse.
