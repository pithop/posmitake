# Documentation Technique - Mitake POS v2

Ce document décrit l'architecture technique, le schéma de base de données, et les méthodes d'intégration du système de caisse (POS) de Mitake Ramen. Il est destiné aux développeurs souhaitant comprendre le système ou y connecter des applications tierces (comme le site web de commande en ligne).

## 1. Architecture Globale

Le POS Mitake est une application Web Moderne "Local-First" conçue pour fonctionner même lors de coupures internet temporaires, tout en garantissant une synchronisation cloud en temps réel pour le multi-écrans (Caisse, Tablette Cuisine, Dashboard distant).

**Stack Technologique :**
- **Frontend** : [Next.js](https://nextjs.org/) (React 19) avec Tailwind CSS.
- **State Management** : Zustand (`src/store/useStore.ts`) pour la gestion du panier et de l'état local.
- **Base de Données Locale** : SQLite (`@journeyapps/wa-sqlite`) fonctionnant directement dans le navigateur.
- **Synchronisation & Offline-First** : [PowerSync](https://powersync.com) assure la synchronisation bidirectionnelle entre le SQLite local et le cloud.
- **Backend & Temps Réel** : [Supabase](https://supabase.com/) (PostgreSQL) sert de vérité absolue dans le cloud et gère les événements temps réel (WebSockets).

---

## 2. Schéma de la Base de Données

Les données sont stockées de façon identique dans Supabase (Cloud) et SQLite (Local via PowerSync).

### Table `pos_orders` (Les Commandes)
C'est la table centrale du système.
- `id` (UUID) : Identifiant unique de la commande.
- `created_at` (TIMESTAMPTZ) : Date et heure de création.
- `total` (NUMERIC) : Montant total TTC de la commande.
- `status` (TEXT) : Statut de la commande (`pending` = en attente/impayé, `completed` = payé/terminé, `cancelled` = annulé).
- `payment_method` (TEXT) : Méthode de paiement principale (legacy).
- `payment_details` (JSONB) : Détail des paiements (permet les paiements multiples, ex: moitié CB, moitié Espèces).
- `order_type` (TEXT) : Type de commande (`sur_place` ou `emporte`).
- `source_device` (TEXT) : Nom de l'appareil ayant créé la commande (ex: `caisse_1`, `tablette_cuisine`, ou `website`).
- `customer_name` (TEXT) : Nom du client (utile pour "à emporter").
- `pickup_time` (TEXT) : Heure de retrait prévue.
- `items_json` (JSONB) : Copie dénormalisée du panier (pour un affichage rapide dans l'historique sans faire de JOIN).
- `rappel_at` (TIMESTAMPTZ) : Timestamp utilisé pour déclencher l'alerte "Rappel Cuisine" sur la tablette.

### Table `pos_order_items` (Les Lignes de Commande)
Détail de chaque article dans une commande.
- `id` (UUID) : Identifiant unique de la ligne.
- `order_id` (UUID) : Clé étrangère vers `pos_orders.id`.
- `product_id` (TEXT) : Identifiant du produit catalogue.
- `quantity` (INTEGER) : Quantité commandée.
- `price_at_time` (NUMERIC) : Prix unitaire au moment de l'achat.
- `modifiers_json` (JSONB) : Suppléments choisis (ex: "+ Oeuf", "Sans oignons").
- `note` (TEXT) : Note personnalisée (ex: "Allergie arachide").

### Table `pos_products` (Le Catalogue Produit)
- `id` (TEXT) : Identifiant du produit (ex: `ramen_shoyu`).
- `name` (TEXT) : Nom d'affichage.
- `price` (NUMERIC) : Prix TTC.
- `category` (TEXT) : Catégorie (ex: `ramen`, `boissons`, `entrees`).
- `image` (TEXT) : URL de l'image.
- `available` (BOOLEAN) : Gestion des ruptures de stock (`true` = en stock, `false` = rupture).
- `modifier_groups` (JSONB) : Définition des options et suppléments possibles pour ce produit.

### Table `pos_logs` (Télémétrie)
- `id` (UUID) : Identifiant du log.
- `server_timestamp` (TIMESTAMPTZ) : Heure de réception par le serveur.
- `level` (TEXT) : Gravité (`INFO`, `WARN`, `ERROR`, `FATAL`, `AUDIT`).
- `category` (TEXT) : Type (`ORDER`, `NETWORK`, `PRINT`, `SYSTEM`).
- `event_name` (TEXT) : Nom de l'action (ex: `ORDER_COMPLETED`).
- `device_id` (TEXT) : Appareil ayant généré le log.
- `payload` (JSONB) : Détails techniques facultatifs.

---

## 3. Intégration avec le Site Web (Comment lier le web à la Caisse)

L'objectif est que lorsqu'un client passe une commande sur votre site Web (par exemple "mitake-ramen.fr"), la commande apparaisse **instantanément** sur la caisse du restaurant et fasse sonner la tablette en cuisine.

### Étape 1 : Insérer la commande dans Supabase
Votre site web doit se connecter directement à l'API Supabase de votre projet et insérer une nouvelle ligne dans la table `pos_orders`, ainsi que ses lignes dans `pos_order_items`.

**Exemple de payload JSON à envoyer à Supabase pour `pos_orders`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000", // Générer un UUID v4 unique
  "total": 31.50,
  "status": "pending", // CRITIQUE : "pending" signifie que la caisse doit l'encaisser/valider
  "order_type": "emporte", // ou "livraison"
  "source_device": "website", // Permet à la caisse d'identifier que ça vient du web
  "customer_name": "Jean Dupont",
  "pickup_time": "19:30",
  "items_json": [ ... array des articles ... ],
  "payment_method": "unpaid", // ou "card" si payé en ligne via Stripe
  "payment_details": []
}
```

### Étape 2 : Le système temps réel prend le relais
Vous n'avez **rien d'autre à faire** ! L'architecture est déjà prévue pour réagir à cette insertion :

1. **Tablette Cuisine** : La tablette écoute le canal `postgres_changes` sur Supabase. Dès que la ligne est insérée, la cloche va sonner en cuisine, l'écran va devenir rouge, et le ticket numérique va s'afficher avec la mention "À Emporter - Jean Dupont".
2. **Caisse Principale (Admin Panel)** : PowerSync, qui tourne en tâche de fond sur la Caisse, va automatiquement télécharger cette nouvelle commande dans sa base de données SQLite locale. La commande apparaîtra directement dans l'onglet **"En Attente"** du panneau Admin. Le caissier n'aura plus qu'à cliquer sur "Encaisser" quand le client viendra la chercher.
3. **Imprimante Thermique** : (Optionnel) Si configuré, la caisse peut détecter la nouvelle commande entrante et envoyer automatiquement une requête réseau à l'imprimante EPSON via QZ Tray pour sortir le "Bon de préparation".

---

## 4. Astuces de Développement
- **Ne jamais supprimer une commande "completed"** : Privilégiez l'annulation (statut `cancelled`) pour garder une trace comptable. Les suppressions physiques (DELETE) ne doivent être utilisées que pour les commandes `pending` abandonnées.
- **Ruptures de stock** : Votre site web peut écouter la table `pos_products` via Supabase Realtime de la même façon. Ainsi, si la Caisse appuie sur le bouton "Rupture" pour le "Ramen Shoyu", le Ramen Shoyu deviendra automatiquement grisé et indisponible sur votre site web 1 seconde plus tard.
