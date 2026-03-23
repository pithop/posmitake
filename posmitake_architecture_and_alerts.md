# Mitake POS - Architecture & Alert System (Knowledge Transfer)

Ce document contient l'architecture critique du système POS Mitake pour garantir 100% de disponibilité et de fiabilité, spécialement sur le flux d'alertes en cuisine.
**À fournir à toute IA avant une modification majeure.**

## 1. Architecture Générale et Offline-First
*   **Stack:** Next.js, React, TailwindCSS, Zustand.
*   **Base de données:** Approche "Local-First" avec **PowerSync** (SQLite local `mitake.db`) synchronisé avec **Supabase** (PostgreSQL distant).
*   **State Management:** `src/store/useStore.ts` contient `CartState` (gestion du panier, des modifications, du stash) et `SystemState` (paramètres, compteurs).

## 2. Le Flux d'Encaissement (Checkout & Mises en attente)
Pour garantir la rapidité hors-ligne ET la notification instantanée en cuisine, le système utilise la technique de **Double Écriture (Dual Write)** dans `useStore.ts` :
1.  **Write 1 (Local):** Écriture immédiate dans le SQLite local via `db.writeTransaction`. Cela garantit que la caisse peut continuer à encaisser sans réseau.
2.  **Write 2 (Direct Supabase):** Un `upsert` direct vers la table distante `pos_orders` de Supabase. Cela déclenche les événements "Realtime" que la cuisine écoute, sans attendre la synchronisation PowerSync.

## 3. Système d'Alertes Cuisine (`OrderAlertManager.tsx`)
C'est le composant le plus sensible du système. Il gère l'affichage et la sonnerie en cuisine.
*   **Emplacement Critique:** Il est placé dans `layout.tsx` **en dehors** du `<PowerSyncProvider>` et gère lui-même son splash-screen, afin que la connexion WebSocket Supabase s'ouvre dès la seconde 0, même si la BDD locale met du temps à se charger.
*   **Mécanismes de réception :**
    1.  **Postgres Changes (INSERT):** Pour les nouvelles commandes standard.
    2.  **Postgres Changes (UPDATE):** Écouté activement pour deux cas vitaux :
        *   Le *Rappel* manuel envoyé par la caisse (`rappel_at` modifié).
        *   Les *Nouvelles commandes avec ID recyclé* : L'ordinateur stocke son `orderIdCounter` localement. S'il n'a pas été réinitialisé et qu'il réutilise `#012`, Supabase fera un `UPDATE` au lieu d'un `INSERT`. L'alerte est acceptée car `payload.new.created_at !== payload.old.created_at`.
    3.  **Broadcast (ORDER_MODIFIED):** Événement personnalisé envoyé lors de l'édition d'une commande (ajout/retrait d'articles). Envoie un objet `diff` pour afficher le visuel Vert (+) et Rouge barré (-).
    4.  **Polling Fallback:** Une boucle `setInterval` toutes les 2 secondes récupère les commandes récentes au cas où le WebSocket raterait un événement réseau.

## 4. Déduplication et Pièges à éviter (NE PAS CASSER)
*   **Clef de déduplication (`orderKey`):** L'alerte rejette les doublons en utilisant `order.id + '_' + order.created_at` (et non juste `order.id`). Ne jamais utiliser juste l'ID, sinon les modifications (qui ont le même ID) ou les ID recyclés seront bloqués silencieusement.
*   **Modification Alerts Exception:** Les alertes avec le flag `is_modification` contournent volontairement la déduplication pour mettre à jour la file d'attente (queue) en direct.
*   **Clear Cart Timing:** Dans `useStore.ts`, les snapshots du panier (`itemsSnapshot` et `originalItemsSnapshot`) DOIVENT être capturés au tout début de la fonction d'encaissement. `cartState.clearCart()` ne doit s'exécuter qu'une fois les snapshots verrouillés en mémoire, sinon le module de `diff` calculera une différence entre deux paniers vides (Zéro modification).
*   **Envoi de Broadcast:** Un Supabase broadcast (`channel.send()`) DOIT impérativement être encapsulé dans un `channel.subscribe(status => { if (status === 'SUBSCRIBED') ... })`. Un envoi avant la souscription est silencieusement ignoré par le SDK Supabase JS v2.

---
## Objectif du prochain Agent
*   Maintenir cette architecture asynchrone à haute résilience.
*   Effectuer un audit ligne par ligne pour repérer les "Race Conditions", les fuites de mémoire (memory leaks sur les WebSockets), ou les erreurs de typage silencieuses.
*   Garantir une disponibilité ("Uptime" d'alertes) de 100%. Rien ne doit empêcher une alerte de sonner en cuisine.

## 🚨 RÈGLES STRICTES DE TEST (POUR L'AGENT)
*   **INTERDICTION D'UTILISER LE NAVIGATEUR :** Tu ne dois en aucun cas ouvrir de navigateur interne (`open_browser`, `browser_subagent`, etc.) pour tester l'application toi-même.
*   **DÉLÉGATION AU USER :** Si tu as besoin de tester une interaction, un rendu visuel ou un flux métier, **demande explicitement au User** de le faire. Le User se chargera du test manuel et te fournira des descriptions détaillées ou des captures d'écran (screenshots) du résultat.
