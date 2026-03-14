# 🖨️ Guide Installation Imprimante — Mitake POS

## Ce dont tu as besoin

- **L'ordinateur de la caisse** (celui qui tourne le POS)
- **L'imprimante thermique** (avec son câble USB)
- **Un rouleau de papier thermique 80mm** (déjà dedans normalement)

---

## Étape 1 : Brancher l'imprimante

1. Branche le câble USB de l'imprimante sur l'ordinateur de la caisse
2. Branche l'imprimante sur le courant (prise secteur)
3. Allume l'imprimante (bouton ON/OFF sur le côté)
4. L'ordinateur devrait la reconnaître automatiquement (Windows installe le driver tout seul)

---

## Étape 2 : Vérifier que Windows la voit

1. Va dans **Paramètres Windows** → **Imprimantes & scanners**
2. Tu devrais voir le nom de l'imprimante dans la liste (ex: `EPSON TM-T20III` ou `POS-80C`)
3. **Note le nom exact** tel qu'il apparaît — tu en auras besoin

---

## Étape 3 : Méthode Simple — Impression Navigateur

C'est la méthode la plus facile, **aucune installation supplémentaire**.

### Comment ça marche :
1. Fais une commande normalement
2. Après le paiement, un écran apparaît avec **"Imprimer (Navigateur)"**
3. Clique sur ce bouton
4. Le dialogue d'impression Chrome s'ouvre
5. **Choisis ton imprimante** dans la liste déroulante
6. Clique **Imprimer**

### Pour enlever le dialogue (impression automatique) :
Si tu veux que ça imprime sans demander à chaque fois :
1. Ferme Chrome
2. Fais clic-droit sur l'icône Chrome → **Propriétés**
3. Dans le champ **"Cible"**, ajoute à la fin : ` --kiosk-printing`
4. Ça donne quelque chose comme : `"C:\...\chrome.exe" --kiosk-printing`
5. Relance Chrome

---

## Étape 4 (OPTIONNEL) : QZ Tray — Impression directe + coupe papier + tiroir-caisse

⚠️ **Fais ça SEULEMENT si la Méthode Simple ne suffit pas** (par exemple si tu veux la coupe automatique du papier ou l'ouverture du tiroir-caisse).

### Installation :
1. Va sur **https://qz.io/download/**
2. Télécharge la version **Windows**
3. Installe-le (Suivant, Suivant, Terminer)
4. QZ Tray se lance en arrière-plan (petite icône dans la barre des tâches en bas à droite)

### Configuration dans le POS :
1. Ouvre le POS sur Chrome
2. Clique sur le bouton **ADMIN** (en bas à gauche)
3. Va dans l'onglet **Paramètres**
4. Descends jusqu'à **"Paramètres Caisse (Impression)"**
5. Dans le champ **"Nom de l'imprimante"**, tape le **nom exact** que tu as noté à l'Étape 2
6. C'est bon ! Le bouton **"Imprimer (QZ Tray)"** est prêt

### Utilisation :
- Après chaque commande, clique sur **"Imprimer (QZ Tray)"** au lieu de "Navigateur"
- Le ticket s'imprime directement, le papier se coupe, le tiroir s'ouvre

---

## Résumé rapide

| | Navigateur | QZ Tray |
|---|---|---|
| **Facilité** | ⭐⭐⭐ Super simple | ⭐⭐ Faut installer |
| **Coupe papier** | ❌ Tu coupes à la main | ✅ Automatique |
| **Tiroir-caisse** | ❌ | ✅ S'ouvre tout seul |
| **Recommandé** | Commence par ça | Si tu veux le premium |

**👉 Commence TOUJOURS par la Méthode Navigateur.** Si ça fonctionne bien, tu n'as pas besoin de QZ Tray.
