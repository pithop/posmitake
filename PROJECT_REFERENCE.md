# Mitake POS - Référence Complète du Projet

Ce document sert de référence technique complète pour le projet Mitake POS. Il résume tout ce qui a été accompli, l'architecture technique, et les instructions pour la maintenance et le déploiement.

## 1. Vue d'Ensemble
**Mitake POS** est une application de Point de Vente (POS) moderne, rapide et "Zero-Backend" (initialement), optimisée pour les tablettes. Elle permet la prise de commande, la gestion du panier avec modificateurs complexes, et la synchronisation des données via Supabase.

### Stack Technique
- **Framework** : Next.js 15+ (App Router)
- **Langage** : TypeScript
- **Style** : Tailwind CSS v4 (Design System "Suge" / Premium)
- **État Global** : Zustand (avec persistance `localStorage`)
- **Backend / DB** : Supabase (PostgreSQL)
- **Déploiement** : Vercel

## 2. Fonctionnalités Clés

### A. Interface Client (Prise de Commande)
- **MenuGrid** : Affichage responsive des produits par catégorie.
- **ProductCard** : Cartes produits avec design premium, images, et prix.
- **ModifierModal** : Système complexe de personnalisation (ex: "Sans oignons", "Supplément œuf"). Gère les prix additionnels.
- **CartSidebar** : Panier latéral persistant, calcul du total en temps réel.

### B. Panneau d'Administration (Admin Panel)
Accessible via un bouton discret (pillule "ADMIN") en bas à gauche.
- **Dashboard** : Vue en temps réel du Chiffre d'Affaires, nombre de commandes, panier moyen.
- **Historique** : Liste des commandes passées. **Nouveau** : Clic pour voir le détail (articles, modificateurs).
- **Gestion Produits** :
    - Recherche de produits.
    - Modification rapide (Nom, Prix).
    - **Synchronisation DB** : Bouton pour pousser les modifications locales vers Supabase.

### C. Synchronisation & Données (Supabase)
- **Temps Réel** : Les modifications de produits sur un appareil sont instantanément répercutées sur les autres via `supabase.channel`.
- **Persistance** : Les commandes sont sauvegardées dans `pos_orders` et `pos_order_items`.
- **Mode Hybride** : L'application fonctionne en local (Zustand) et synchronise en arrière-plan.

## 3. Structure du Code

### Dossiers Principaux
- `src/app` : Pages et Layouts Next.js.
- `src/components` : Composants UI (MenuGrid, CartSidebar, AdminPanel, etc.).
- `src/store` : Gestion de l'état (Zustand).
- `src/lib` : Utilitaires (Supabase client, formatage prix).
- `src/types` : Définitions TypeScript (Product, Order, CartItem).

### Fichiers Critiques
- **`src/store/useStore.ts`** : Le cœur de l'application. Contient :
    - `useCartStore` : Logique du panier.
    - `useSystemStore` : Logique métier (Commandes, CA, Sync Supabase).
    - `initializeSync` : Fonction lancée au démarrage pour charger l'historique et écouter les changements.
    - `seedProducts` : Fonction pour sauvegarder les produits locaux vers la DB.
- **`src/components/AdminPanel.tsx`** : Toute l'interface d'administration.
- **`src/lib/supabase.ts`** : Initialisation du client Supabase.

## 4. Base de Données (Supabase)

### Schéma SQL
Les tables suivantes sont utilisées :

```sql
-- Produits
CREATE TABLE pos_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category TEXT,
  description TEXT,
  image TEXT,
  available BOOLEAN DEFAULT true,
  modifier_groups JSONB
);

-- Commandes
CREATE TABLE pos_orders (
  id TEXT PRIMARY KEY,
  total DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'completed',
  payment_method TEXT DEFAULT 'card', -- Primary method
  payment_details JSONB, -- Detailed split payments
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Articles de Commande
CREATE TABLE pos_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT REFERENCES pos_orders(id),
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  selected_modifiers JSONB
);
```

### Commande de Reset
Pour remettre la base à zéro avant la mise en production :
```sql
TRUNCATE TABLE pos_order_items, pos_orders, pos_products RESTART IDENTITY CASCADE;
```

## 5. Installation & Déploiement

### Variables d'Environnement (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_cle_anon
```

### Commandes Utiles
- `npm run dev` : Lancer en local.
- `npm run build` : Construire pour la production.

### Déploiement Vercel
1. Pousser le code sur GitHub.
2. Importer le projet dans Vercel.
3. Ajouter les variables d'environnement Supabase dans les réglages Vercel.
4. Déployer.

## 6. Prochaines Étapes Possibles
- Ajouter l'authentification pour l'Admin Panel.
- Ajouter la gestion des stocks.
- Imprimer les tickets de caisse (intégration imprimante thermique).
