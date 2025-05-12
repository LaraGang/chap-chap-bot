# CHAP-CHAP - Bot WhatsApp de Rechargement Mobile

Bot WhatsApp pour le rechargement mobile en Côte d'Ivoire (Moov, MTN, Orange) avec paiement via Wave.

## 🚀 Installation

1. Assurez-vous d'avoir Node.js installé (version 14 ou supérieure)
2. Clonez ce dépôt
3. Installez les dépendances :
```bash
npm install
```

## ⚙️ Configuration

1. Ouvrez le fichier `app.js`
2. Remplacez `ADMIN_NUMBER` par votre numéro WhatsApp (format international, ex: '225XXXXXXXXX')

## 🏃‍♂️ Démarrage

```bash
npm start
```

À la première exécution, un QR code s'affichera dans le terminal. Scannez-le avec WhatsApp pour connecter le bot.

## 📱 Utilisation

### Pour les utilisateurs

1. Envoyez un message au numéro WhatsApp du bot
2. Suivez les instructions à l'écran :
   - Choisissez le type de rechargement (unités ou forfaits)
   - Sélectionnez l'opérateur
   - Entrez le numéro à recharger
   - Confirmez le numéro
   - Entrez le montant
   - Confirmez le montant
   - Effectuez le paiement via Wave
   - Attendez la confirmation

### Pour l'administrateur

1. Recevez les demandes de rechargement
2. Effectuez le rechargement manuellement
3. Confirmez le rechargement en envoyant la commande :
   ```
   !confirmer [numéro_utilisateur]
   ```

## 🔒 Sécurité

- Les informations de connexion WhatsApp sont stockées localement
- Les transactions sont validées par l'administrateur
- Les frais de service sont de 10%

## 📝 Licence

Ce projet est sous licence MIT. 