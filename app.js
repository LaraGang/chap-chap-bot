const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const http = require('http');
const config = require('./config');

// Créer un simple serveur HTTP pour le ping UptimeRobot (pour éviter la mise en veille sur Render)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Chap-Chap Bot en ligne');
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Serveur HTTP démarré sur le port ${process.env.PORT || 3000}`);
});

// Configuration
const ADMIN_NUMBER = config.ADMIN.jid;
const CONFIRMATION_NUMBER = config.BOT_CONFIRMATION.jid;
const WAVE_PAYMENT_LINK = 'https://pay.wave.com/m/M_ci_3uPY5tahPf8f/c/ci/';

// États des utilisateurs
const userStates = new Map();

// Lire les données des forfaits
const forfaits = JSON.parse(fs.readFileSync('forfaits.json', 'utf8'));

// Ajout d'une file d'attente pour les rechargements
const fileAttente = new Map();

// Fonction pour ajouter à la file d'attente
function ajouterFileAttente(jid, state) {
  if (!state || !state.numero) {
    console.error('❌ État invalide lors de l\'ajout à la file d\'attente:', state);
    return false;
  }
  
  fileAttente.set(state.numero, {
    jid: jid,
    ...state,
    dateDemande: new Date()
  });
  
  console.log(`✅ Ajout de ${state.numero} à la file d'attente (total: ${fileAttente.size} en attente)`);
  return true;
}

// Fonction pour retirer de la file d'attente
function retirerFileAttente(numero) {
  fileAttente.delete(numero);
}

// Fonction pour formater le numéro en JID
function formaterJID(numero) {
  if (numero.includes('@s.whatsapp.net')) return numero;
  return `${numero}@s.whatsapp.net`;
}

// Fonction pour envoyer un message formaté
async function envoyerMessage(sock, jid, message) {
  try {
    const formattedJid = formaterJID(jid);
    console.log(`📤 Tentative d'envoi à ${formattedJid}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
    await sock.sendMessage(formattedJid, { text: message });
    console.log(`✅ Message envoyé avec succès à ${formattedJid}`);
    return true;
  } catch (error) {
    console.error(`❌ ERREUR D'ENVOI à ${jid}:`, error);
    return false;
  }
}

// Fonction pour envoyer un message avec boutons
async function envoyerMessageAvecBoutons(sock, jid, message, boutons) {
  try {
    const formattedJid = formaterJID(jid);
    console.log(`📤 Tentative d'envoi avec boutons à ${formattedJid}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
    
    // Ajouter la liste des options à la fin du message original pour s'assurer qu'elles sont visibles
    // même si les boutons ne s'affichent pas
    const optionsText = "\n\n" + boutons.map((btn, i) => `${i+1}. ${btn}`).join('\n');
    const completeMessage = message + optionsText;
    
    const buttons = boutons.map((texte, index) => ({
      buttonId: `btn_${index}`,
      buttonText: { displayText: texte },
      type: 1
    }));
    
    const buttonMessage = {
      text: completeMessage,
      footer: '⚡ CHAP-CHAP - Rechargements faciles et rapides ⚡',
      buttons: buttons,
      headerType: 1
    };
    
    await sock.sendMessage(formattedJid, buttonMessage);
    console.log(`✅ Message avec boutons envoyé avec succès à ${formattedJid}`);
    return true;
  } catch (error) {
    console.error(`❌ ERREUR D'ENVOI avec boutons à ${jid}:`, error);
    console.log('Tentative de repli sur un message texte simple');
    return await envoyerMessage(sock, jid, message + "\n\n" + boutons.map((btn, i) => `${i+1}. ${btn}`).join('\n'));
  }
}

// Fonction pour démarrer une nouvelle conversation
async function demarrerNouvelleConversation(sock, jid) {
  userStates.delete(jid);
  const message = `👋 *Bienvenue chez CHAP-CHAP!*

💳 Nous proposons des rechargements rapides et sécurisés.

✨ *Que souhaitez-vous ?*

Répondez par chiffre (1 ou 2) ou cliquez sur un bouton :`;
  const boutons = ['💵 Rechargement d\'unités', '📱 Rechargement de forfaits'];
  
  await envoyerMessageAvecBoutons(sock, jid, message, boutons);
  userStates.set(jid, { etape: 'MENU_PRINCIPAL' });
}

// Fonction pour afficher les opérateurs
async function afficherOperateurs(sock, jid, typeRechargement) {
  const message = `📶 *Choisissez votre opérateur :*`;
  // Utilisation d'émojis de couleurs correspondantes: Moov (bleu), MTN (jaune), Orange (orange)
  const boutons = [
    '🔵 Moov', // Émoji bleu pour Moov
    '🟡 MTN',  // Émoji jaune pour MTN
    '🟠 Orange' // Émoji orange pour Orange
  ];

  await envoyerMessageAvecBoutons(sock, jid, message, boutons);
  userStates.set(jid, { 
    etape: 'CHOIX_OPERATEUR',
    typeRechargement: typeRechargement 
  });
}

// Fonction pour afficher les forfaits
async function afficherForfaits(sock, jid, operateur) {
  const operateurKey = operateur.toLowerCase();
  const forfaitsDisponibles = forfaits[operateurKey];
  
  // Sélectionner l'émoji de couleur pour l'opérateur
  const operatorEmoji = operateur === 'Orange' ? '🟠' : 
                        operateur === 'MTN' ? '🟡' : 
                        '🔵';
  
  let message = `${operatorEmoji} *FORFAITS ${operateur.toUpperCase()}*\n\n`;
  let index = 1;
  
  for (const [type, listeForfaits] of Object.entries(forfaitsDisponibles)) {
    message += `📱 *${type.toUpperCase()}*\n`;
    message += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
    
    listeForfaits.forEach(forfait => {
      message += `*${index}.* ${forfait.description}\n`;
      message += `   ⏱️ Validité: *${forfait.validite}*\n`;
      message += `   💰 Prix: *${forfait.prix} FCFA*\n\n`;
      index++;
    });
  }

  message += `🔢 *Choisissez un forfait en tapant son numéro:*`;
  
  await envoyerMessage(sock, jid, message);
  userStates.set(jid, {
    etape: 'CHOIX_FORFAIT',
    operateur: operateur,
    forfaits: Object.values(forfaitsDisponibles).flat()
  });
}

// Fonction pour demander le numéro
async function demanderNumero(sock, jid) {
  const state = userStates.get(jid);
  const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                      state.operateur === 'MTN' ? '🟡' : 
                      '🔵';
  
  await envoyerMessageAvecBoutons(
    sock, 
    jid, 
    `${operatorEmoji} *${state.operateur}* - ${state.typeRechargement === 'UNITES' ? '💵 UNITÉS' : '📱 FORFAIT'}

📞 *Veuillez entrer le numéro à recharger:*

Format: 07XXXXXXXX ou 05XXXXXXXX

Envoyez le numéro ou cliquez sur "Retour" pour revenir au menu principal.`,
    ['🔙 Retour au menu']
  );
  
  userStates.set(jid, {
    ...state,
    etape: 'SAISIE_NUMERO'
  });
}

// Fonction pour confirmer le numéro
async function confirmerNumero(sock, jid, numero) {
  const state = userStates.get(jid);
  await envoyerMessageAvecBoutons(sock, jid, `📞 *Confirmation du numéro*

Vous avez saisi le numéro : *${numero}*

Est-ce correct ?`, ['✅ Oui, correct', '❌ Non, corriger']);
  userStates.set(jid, {
    ...state,
    etape: 'CONFIRMATION_NUMERO',
    numero: numero
  });
}

// Fonction pour demander le numéro de paiement
async function demanderNumeroPaiement(sock, jid) {
  const state = userStates.get(jid);
  const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                      state.operateur === 'MTN' ? '🟡' : 
                      '🔵';
  
  await envoyerMessageAvecBoutons(
    sock,
    jid,
    `💳 *PAIEMENT WAVE*

${operatorEmoji} *${state.operateur}* - ${state.typeRechargement === 'UNITES' ? '💵 UNITÉS' : '📱 FORFAIT'}

💰 *Montant à payer:* ${state.prixFinal} FCFA
❌ *Numéro à recharger:* ${state.numero}

📞 *Veuillez entrer votre numéro Wave:*

Format: 0757XXXXXX ou 0767XXXXXX

Vous recevrez un lien de paiement après cette étape.`,
    ['🔙 Retour au menu']
  );
  
  userStates.set(jid, {
    ...state,
    etape: 'SAISIE_NUMERO_PAIEMENT'
  });
}

// Fonction pour calculer le prix final avec exactement 10%
function calculerPrixFinal(prix) {
  // Calculer exactement 10% du prix (en utilisant un calcul entier pour éviter les erreurs d'arrondi)
  const prixInt = parseInt(prix);
  const supplement = Math.floor(prixInt * 0.1); // Arrondi inférieur pour montants comme 350 -> 35
  // Retourner le prix + exactement 10%
  return prixInt + supplement;
}

// Fonction pour afficher le résumé
async function afficherResume(sock, jid) {
  const state = userStates.get(jid);
  
  // Sélectionner l'émoji de couleur pour l'opérateur
  const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                        state.operateur === 'MTN' ? '🟡' : 
                        '🔵';
  
  let message = `╔═══════════════════════════╗
║  💳 RÉSUMÉ TRANSACTION  💳  ║
╚═══════════════════════════╝

${operatorEmoji} *Opérateur:* ${state.operateur}
📞 *Numéro:* ${state.numero}
💳 *Paiement via:* ${state.numeroPaiement}`;

  if (state.typeRechargement === 'UNITES') {
    const prixFinal = calculerPrixFinal(state.montant.montant);
    message += `

═══════ DÉTAILS ═══════

💵 *Type:* Rechargement d'unités
💸 *Montant:* ${state.montant.description}
💰 *Prix total:* *${prixFinal} FCFA*`;
    state.prixFinal = prixFinal;
  } else {
    const prixFinal = calculerPrixFinal(state.forfait.prix);
    message += `

═══════ DÉTAILS ═══════

📱 *Type:* Forfait Internet
📶 *Forfait:* ${state.forfait.description}
⏱️ *Validité:* ${state.forfait.validite}
💰 *Prix total:* *${prixFinal} FCFA*`;
    state.prixFinal = prixFinal;
  }

  message += `

➡️ Tapez *"confirmer"* pour valider ou *"annuler"* pour recommencer.`;
  
  await envoyerMessage(sock, jid, message);
  userStates.set(jid, {
    ...state,
    etape: 'CONFIRMATION_TRANSACTION'
  });
}

// Fonction pour afficher la file d'attente
async function afficherFileAttente(sock, jid) {
  if (fileAttente.size === 0) {
    await envoyerMessage(sock, jid, 'Aucune demande en attente.');
    return;
  }

  let message = '📋 Demandes en attente :\n\n';
  for (const [numero, data] of fileAttente.entries()) {
    message += `Numéro à recharger : ${numero}\n`;
    message += `Réseau : ${data.operateur}\n`;
    message += `Forfait : ${data.forfait.description}\n`;
    message += `Prix : ${data.prixFinal} F\n`;
    message += `Demande reçue : ${data.dateDemande.toLocaleTimeString()}\n\n`;
  }
  
  await envoyerMessage(sock, jid, message);
}

// Fonction pour envoyer le lien de paiement
async function envoyerLienPaiement(sock, jid) {
  const state = userStates.get(jid);
  const message = `💳 *PAIEMENT REQUIS*

💸 Montant à payer : *${state.prixFinal} FCFA*

🔗 Veuillez effectuer le paiement via ce lien Wave :

${WAVE_PAYMENT_LINK}

ℹ️ Une fois le paiement effectué, cliquez sur le bouton ci-dessous pour finaliser votre commande.`;
  
  // Ajouter à la file d'attente
  ajouterFileAttente(jid, state);
  console.log(`📝 Ajout à la file d'attente: numéro ${state.numero} pour l'opérateur ${state.operateur}`);
  
  // Générer un identifiant unique pour la demande
  const now = new Date();
  const date = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const heure = `${now.getHours().toString().padStart(2, '0')}h${now.getMinutes().toString().padStart(2, '0')}`;
  const typeAbrege = state.typeRechargement === 'UNITES' ? 'UNIT' : 'FORF';
  // Créer un compteur s'il n'existe pas
  if (!global.compteurRechargements) global.compteurRechargements = 0;
  global.compteurRechargements++;
  
  // Format d'ID plus clair adapté à la demande
  // Format: [Type Abrégé] [Date] No[Compteur] [Heure]
  const idRechargement = `${typeAbrege} ${date} No${global.compteurRechargements} ${heure}`;
  
  // Mettre à jour l'état avec TOUTES les informations nécessaires
  userStates.set(jid, {
    ...state,
    etape: 'ATTENTE_CONFIRMATION_PAIEMENT',
    idRechargement: idRechargement,
    date: date,
    heure: heure
  });
  
  // Envoyer le message avec boutons
  await envoyerMessageAvecBoutons(sock, jid, message, ['✅ Paiement validé']);
}

// Fonction pour finaliser la transaction
async function finaliserTransaction(sock, numero) {
  if (!fileAttente.has(numero)) {
    console.log(`❌ Transaction impossible: Numéro ${numero} non trouvé dans la file d'attente`);
    return false;
  }

  try {
    // Récupérer les informations
    const info = fileAttente.get(numero);
    const jid = info.jid;
    const state = userStates.get(jid) || {};
    const idRechargement = state.idRechargement || `REF-${Date.now().toString().substring(8)}`;
    
    // D'abord envoyer un message indiquant que la transaction est en cours
    await envoyerMessage(
      sock, 
      jid, 
      `⌛ *RECHARGEMENT EN COURS...* ⌛\n\nVotre demande est en cours de traitement. Cela peut prendre 1 à 2 minutes.\n\nVeuillez patienter, vous recevrez une confirmation dès que votre recharge sera effectuée.`
    );
    
    // Attendre 2 minutes (120000 ms) avant d'envoyer le message de confirmation
    console.log(`🕔 Attente de 2 minutes avant de confirmer la recharge pour ${numero}...`);
    
    // Créer une promesse qui se résout après 2 minutes
    await new Promise(resolve => setTimeout(resolve, 120000));
    
    // Envoyer le message de confirmation avec ID de référence après le délai
    await envoyerMessage(
      sock, 
      jid, 
      `✅ *RECHARGEMENT RÉUSSI* ✅\n\n🆔 *Référence: ${idRechargement}*\n\n📞 Numéro: ${numero}\n🔰 Opérateur: ${info.operateur || 'Non spécifié'}\n💰 Type: ${info.typeRechargement === 'UNITES' ? 'Unités' : 'Forfait'}\n\n👏 Merci d'avoir utilisé CHAP-CHAP !\n\n👇 *Pour tout nouveau rechargement, envoyez simplement "recharger"*`
    );
    
    // Supprimer de la file d'attente
    fileAttente.delete(numero);
    console.log(`✅ Transaction finalisée pour ${numero} (Ref: ${idRechargement})`);
    
    // Réinitialiser l'état utilisateur
    userStates.delete(jid);
    
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors de la finalisation de la transaction pour ${numero}:`, error);
    return false;
  }
}

// Fonction pour demander le montant
async function demanderMontant(sock, jid) {
  const state = userStates.get(jid);
  const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                      state.operateur === 'MTN' ? '🟡' : 
                      '🔵';
  
  // Suggérons quelques montants standards avec des boutons
  const boutonsMontants = [
    '500 FCFA', '1000 FCFA', '2000 FCFA', '5000 FCFA', '10000 FCFA'
  ];
  
  await envoyerMessageAvecBoutons(
    sock, 
    jid, 
    `${operatorEmoji} *${state.operateur}* - 💵 *RECHARGEMENT D'UNITÉS*

💰 *Veuillez entrer le montant du rechargement:*

⭐ *DEUX OPTIONS:*
1️⃣ *Cliquez* sur l'un des montants prédéfinis ci-dessous
2️⃣ *OU tapez* directement le montant souhaité (ex: 300, 750, 1500, etc.)

📢 *Montant libre accepté!* Saisissez n'importe quel montant personnalisé en FCFA.

_Cliquez sur un bouton ou envoyez votre montant:_`,
    [...boutonsMontants, '🔙 Retour au menu']
  );
  
  userStates.set(jid, {
    ...state,
    etape: 'SAISIE_MONTANT'
  });
}

// Fonction principale pour démarrer le bot
async function demarrerBot() {
  console.log('🚀 Démarrage du bot principal...');
  
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    console.log('✅ État d\'authentification chargé');
    
    const sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger: pino({ level: 'warn' }), // Changé de 'silent' à 'warn' pour voir les erreurs importantes
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 120000,
      retryRequestDelayMs: 5000,
      markOnlineOnConnect: true, // Changé de false à true pour s'assurer que le bot apparaît en ligne
      keepAliveIntervalMs: 30000,
      emitOwnEvents: true, // Changé de false à true pour améliorer la gestion des événements
      browser: ['CHAP-CHAP', 'Chrome', '1.0.0']
    });
    console.log('✅ Socket WhatsApp créé');

    // Gérer les événements de connexion
    sock.ev.on('connection.update', async (update) => {
      console.log('📡 État de la connexion:', update);
      const { connection, lastDisconnect } = update;
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('❌ Connexion fermée, tentative de reconnexion:', shouldReconnect);
        if (shouldReconnect) {
          console.log('🔄 Tentative de reconnexion dans 5 secondes...');
          setTimeout(demarrerBot, 5000);
        }
      } else if (connection === 'open') {
        console.log('✅ Bot principal connecté avec succès!');
        // Envoyer un message de test pour vérifier la connexion
        try {
          await envoyerMessage(sock, ADMIN_NUMBER, '🔄 Bot principal redémarré et connecté');
          // Envoyer également un message au bot de confirmation pour établir la communication
          await envoyerMessage(sock, CONFIRMATION_NUMBER, '🔄 Bot principal redémarré et prêt à recevoir des confirmations');
          console.log('✅ Messages de test envoyés avec succès');
        } catch (error) {
          console.error('❌ Erreur lors de l\'envoi du message de test:', error);
        }
      }
    });

    // Sauvegarder les credentials
    sock.ev.on('creds.update', saveCreds);

    // Gérer les messages entrants
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        // Ne traiter que les messages entrants
        if (!message.key.fromMe) {
          try {
            // Récupérer les détails du message
            const jid = message.key.remoteJid;
            const messageContent = message.message?.conversation || 
                                  message.message?.extendedTextMessage?.text || 
                                  message.message?.buttonsResponseMessage?.selectedDisplayText || 
                                  message.message?.listResponseMessage?.title || 
                                  '';
            
            // Ignorer les messages de statut
            if (jid === 'status@broadcast') {
              console.log('⚠️ Message ignoré - Message de statut');
              continue;
            }
            
            // Ignorer les messages de groupe
            if (jid.includes('@g.us')) {
              console.log(`⚠️ Message ignoré - Message de groupe (${jid})`);
              continue;
            }

            console.log(`📥 Message reçu de ${jid}: ${messageContent}`);
            
            // Gérer les commandes de l'administrateur
            const adminJid = config.ADMIN.jid;
            if (jid === adminJid) {
              console.log(`👤 Message de l'administrateur reçu: ${messageContent}`);
              
              // Commande pour lister la file d'attente
              if (messageContent.toLowerCase() === 'liste') {
                await afficherFileAttente(sock, adminJid);
                continue;
              } 
              // Commande pour confirmer une transaction
              else if (messageContent.toLowerCase().startsWith('confirmer') || messageContent.startsWith('CONFIRMER:')) {
                let numero;
                if (messageContent.startsWith('CONFIRMER:')) {
                  numero = messageContent.split(':')[1].trim();
                } else {
                  numero = messageContent.split(' ')[1];
                }
                
                if (numero && fileAttente.has(numero)) {
                  console.log(`🔔 Confirmation reçue pour le numéro: ${numero}`);
                  await finaliserTransaction(sock, numero);
                } else {
                  await envoyerMessage(sock, adminJid, `❌ Numéro ${numero} non trouvé dans la file d'attente ou format invalide`);
                }
                continue;
              }
            }
            
            // Traiter comme un utilisateur normal (y compris l'admin en mode normal)
            let currentState = userStates.get(jid) || { etape: 'DEBUT' };
            await traiterMessageUtilisateur(sock, jid, messageContent, currentState);
            
          } catch (error) {
            console.error('❌ Erreur lors du traitement du message:', error);
          }
        }
      }
    });

    // Fonction pour traiter les messages des utilisateurs
    async function traiterMessageUtilisateur(sock, jid, message, currentState) {
      try {
        console.log(`🔄 État actuel pour ${jid}:`, currentState.etape);

        switch (currentState.etape) {
          case 'DEBUT':
            await demarrerNouvelleConversation(sock, jid);
            break;

          case 'MENU_PRINCIPAL':
            if (message === '1' || message.toLowerCase().includes('rechargement d\'unités') || message.includes('💵')) {
              await afficherOperateurs(sock, jid, 'UNITES');
            } else if (message === '2' || message.toLowerCase().includes('rechargement de forfaits') || message.includes('📱')) {
              await afficherOperateurs(sock, jid, 'FORFAITS');
            } else {
              // Réafficher le menu avec les boutons
              await envoyerMessageAvecBoutons(sock, jid, '❌ *Choix invalide.* Veuillez choisir une option :', ['💵 Rechargement d\'unités', '📱 Rechargement de forfaits']);
            }
            break;

          case 'CHOIX_OPERATEUR':
            let operateur;
            if (message === '1' || message.includes('Moov') || message.includes('🔵')) {
              operateur = 'Moov';
            } else if (message === '2' || message.includes('MTN') || message.includes('🟡')) {
              operateur = 'MTN';
            } else if (message === '3' || message.includes('Orange') || message.includes('🟠')) {
              operateur = 'Orange';
            } else {
              await envoyerMessageAvecBoutons(sock, jid, `❌ *Opérateur invalide.* Veuillez choisir un opérateur :

Répondez avec 1 pour Moov, 2 pour MTN, ou 3 pour Orange`, [
                '🔵 Moov',  // Bleu
                '🟡 MTN',   // Jaune
                '🟠 Orange' // Orange
              ]);
              return;
            }

            if (currentState.typeRechargement === 'FORFAITS') {
              await afficherForfaits(sock, jid, operateur);
            } else {
              await envoyerMessage(sock, jid, 'Entrez le montant à recharger (en FCFA) :');
              userStates.set(jid, {
                ...currentState,
                etape: 'SAISIE_MONTANT',
                operateur: operateur
              });
            }
            break;

          case 'CHOIX_FORFAIT':
            const index = parseInt(message) - 1;
            if (isNaN(index) || index < 0 || index >= currentState.forfaits.length) {
              await envoyerMessage(sock, jid, '❌ Choix invalide. Veuillez réessayer.');
              return;
            }

            const forfait = currentState.forfaits[index];
            await envoyerMessage(sock, jid, `Entrez le numéro à recharger :`);
            // Appliquer la marge de 10% sur le prix du forfait
            const prixFinalForfait = calculerPrixFinal(forfait.prix);
            
            userStates.set(jid, {
              ...currentState,
              etape: 'SAISIE_NUMERO',
              forfait: forfait,
              prixFinal: prixFinalForfait
            });
            break;

          case 'SAISIE_MONTANT':
            // Gérer le bouton de retour au menu
            if (message.includes('🔙') || message.toLowerCase().includes('retour au menu')) {
              await demarrerNouvelleConversation(sock, jid);
              return;
            }
            
            // Extraire le montant du message (peut être sous forme "500 FCFA" ou juste "500")
            let montantText = message.replace(/[^0-9]/g, '');
            const montant = parseInt(montantText);
            
            if (isNaN(montant) || montant <= 0) {
              // Réafficher les options avec un message d'erreur
              const state = currentState;
              const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                                 state.operateur === 'MTN' ? '🟡' : 
                                 '🔵';
              
              const boutonsMontants = [
                '500 FCFA', '1000 FCFA', '2000 FCFA', '5000 FCFA', '10000 FCFA'
              ];
              
              await envoyerMessageAvecBoutons(
                sock,
                jid,
                `❌ *Montant invalide.*

${operatorEmoji} *${state.operateur}* - 💵 *RECHARGEMENT D'UNITÉS*

💰 *Veuillez entrer un montant valide en FCFA:*

Exemples: 500, 1000, 2000, etc.`,
                [...boutonsMontants, '🔙 Retour au menu']
              );
              return;
            }

            // Appliquer la marge de 10%
            const prixFinal = calculerPrixFinal(montant);
            
            // Demander le numéro à recharger avec options avancées
            await demanderNumero(sock, jid);
            
            userStates.set(jid, {
              ...currentState,
              etape: 'SAISIE_NUMERO',
              montant: { description: `${montant} FCFA`, montant: montant },
              prixFinal: prixFinal
            });
            break;

          case 'SAISIE_NUMERO':
            // Gérer le bouton de retour au menu
            if (message.includes('🔙') || message.toLowerCase().includes('retour au menu')) {
              await demarrerNouvelleConversation(sock, jid);
              return;
            }
            
            // Vérifier si le numéro est valide (implémentation simplifiée)
            if (!/^\d{10}$/.test(message)) {
              // Réafficher le message avec instructions plus claires
              const state = currentState;
              const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                                   state.operateur === 'MTN' ? '🟡' : 
                                   '🔵';
              
              await envoyerMessageAvecBoutons(
                sock, 
                jid, 
                `❌ *Format de numéro invalide.*

${operatorEmoji} *${state.operateur}* - ${state.typeRechargement === 'UNITES' ? '💵 UNITÉS' : '📱 FORFAIT'}

📞 *Veuillez entrer un numéro à 10 chiffres:*

Format correct: 07XXXXXXXX ou 05XXXXXXXX`,
                ['🔙 Retour au menu']
              );
              return;
            }
            
            // Confirmer le numéro
            await confirmerNumero(sock, jid, message);
            break;

          case 'CONFIRMATION_NUMERO':
            if (message.toLowerCase().includes('oui') || message.includes('✅') || message === '1') {
              await envoyerMessage(sock, jid, '💳 *Entrez votre numéro Wave pour le paiement :*');
              userStates.set(jid, {
                ...currentState,
                etape: 'SAISIE_NUMERO_PAIEMENT'
              });
            } else if (message.toLowerCase().includes('non') || message.includes('❌') || message === '2') {
              await envoyerMessage(sock, jid, '📱 Entrez le numéro à recharger :');
              userStates.set(jid, {
                ...currentState,
                etape: 'SAISIE_NUMERO'
              });
            } else {
              await envoyerMessageAvecBoutons(sock, jid, `❌ *Réponse invalide.*

Confirmez-vous le numéro *${currentState.numero}* ?
Répondez avec 1 (Oui) ou 2 (Non)`, ['✅ Oui, correct', '❌ Non, corriger']);
            }
            break;

          case 'SAISIE_NUMERO_PAIEMENT':
            // Gérer le bouton de retour au menu
            if (message.includes('🔙') || message.toLowerCase().includes('retour au menu')) {
              await demarrerNouvelleConversation(sock, jid);
              return;
            }
            
            const numeroPaiement = message.trim();
            // Format de validation plus souple: permet 07XXXXXXXX, 225XXXXXXXX ou XXXXXXXX
            if (!/^(\d{10}|225\d{8}|\d{8})$/.test(numeroPaiement)) {
              // Afficher un message d'erreur avec instructions et bouton de retour
              const state = currentState;
              const operatorEmoji = state.operateur === 'Orange' ? '🟠' : 
                                   state.operateur === 'MTN' ? '🟡' : 
                                   '🔵';
              
              await envoyerMessageAvecBoutons(
                sock,
                jid,
                `❌ *Format de numéro Wave invalide.*

💳 *PAIEMENT WAVE*

📞 *Veuillez entrer un numéro Wave valide:*

Formats acceptés: 07XXXXXXXX, 225XXXXXXXX ou XXXXXXXX`,
                ['🔙 Retour au menu']
              );
              return;
            }

            // Formater le numéro si nécessaire pour assurer la cohérence
            let formattedNumber = numeroPaiement;
            if (numeroPaiement.length === 8) {
              formattedNumber = `225${numeroPaiement}`;
            } else if (numeroPaiement.length === 10 && numeroPaiement.startsWith('07')) {
              formattedNumber = `225${numeroPaiement.substring(1)}`;
            }

            userStates.set(jid, {
              ...currentState,
              numeroPaiement: formattedNumber
            });

            await envoyerLienPaiement(sock, jid);
            break;
            
          case 'ATTENTE_CONFIRMATION_PAIEMENT':
            // Traitement plus robuste des messages pour détecter le chiffre 1
            const messageClean = message.trim();
            console.log(`💬 Message de confirmation reçu: '${messageClean}', longueur: ${messageClean.length}`);
            
            if (messageClean === '1' || messageClean === '1.' || 
                message.toLowerCase().includes('paiement validé') || 
                message.toLowerCase().includes('paiement valide') || 
                message.includes('✅')) {
              await envoyerMessage(sock, jid, `🚀 *Paiement reçu ! Traitement en cours...*

⌛ Veuillez patienter, vous recevrez votre recharge dans quelques instants.

👍 Merci de nous faire confiance !`);
              
              // Maintenant que le client a confirmé le paiement, envoyer la notification à l'administrateur
              const state = currentState;
              const date = state.date;
              const heure = state.heure;
              const idRechargement = state.idRechargement;

              // Créer la notification concise mais complète pour l'admin
              let messageConfirmation = `❗ *NOUVELLE TRANSACTION* ❗
${state.operateur === 'Orange' ? '🟠' : state.operateur === 'MTN' ? '🟡' : '🔵'} ${state.operateur} - ${state.typeRechargement === 'UNITES' ? 'UNITÉS' : 'FORFAIT'}

📱 *N°*: ${state.numero}
💳 *Pmt*: ${state.numeroPaiement}
💰 *Payé*: ${state.prixFinal} FCFA`;
              
              if (state.typeRechargement === 'UNITES') {
                // Détails pour le rechargement d'unités (format concis mais complet)
                const montantOriginal = state.montant?.montant || Math.floor(state.prixFinal / 1.1);
                messageConfirmation += `

💸 *À recharger*: ${montantOriginal} FCFA
♻️ *USSD*: *155*${state.numero}*${montantOriginal}#`;
              } else {
                // Détails pour le forfait internet (format concis mais complet)
                messageConfirmation += `

📶 *Forfait*: ${state.forfait.description}
📅 *Validité*: ${state.forfait.validite}`;
                
                // Code USSD selon l'opérateur (format concis mais complet)
                if (state.operateur === 'Orange') {
                  messageConfirmation += `
♻️ *USSD Orange*: #144*${state.forfait.code}#`;
                } else if (state.operateur === 'MTN') {
                  messageConfirmation += `
♻️ *USSD MTN*: *156*${state.forfait.code}#`;
                } else if (state.operateur === 'Moov') {
                  messageConfirmation += `
♻️ *USSD Moov*: *111*${state.forfait.code}#`;
                }
              }

              messageConfirmation += `\n\n✅ *Confirmer avec*: "confirmer ${state.numero}"\n⏰ *Reçu le*: ${date} à ${heure}`;
              
              // Envoyer la notification concise à l'administrateur
              await envoyerMessage(sock, ADMIN_NUMBER, messageConfirmation);
              console.log(`📺 Notification de paiement confirmé envoyée à l'administrateur`);
              
              // Finaliser directement la transaction 
              if (fileAttente.has(state.numero)) {
                await finaliserTransaction(sock, state.numero);
              } else {
                console.log(`⚠️ Problème: Numéro ${state.numero} non trouvé dans la file d'attente`);
                await demarrerNouvelleConversation(sock, jid);
              }
            } else {
              // Renvoyer le bouton de confirmation avec un message plus clair
              await envoyerMessageAvecBoutons(sock, jid, `⚠️ *Action requise*

💳 Pour finaliser votre commande, veuillez:
1. Effectuer le paiement via le lien Wave
2. Cliquer sur le bouton ci-dessous OU répondre avec le chiffre "1"

🔔 *Votre recharge ne sera traitée qu'après confirmation.*
Répondez simplement avec le chiffre "1" pour confirmer le paiement.`, ['✅ Paiement validé']);
            }
            break;

          default:
            await demarrerNouvelleConversation(sock, jid);
        }
      } catch (error) {
        console.error('❌ Erreur lors du traitement du message utilisateur:', error);
        await envoyerMessage(sock, jid, '❌ Une erreur est survenue. Veuillez réessayer.');
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du bot:', error);
    console.log('🔄 Tentative de redémarrage dans 5 secondes...');
    setTimeout(demarrerBot, 5000);
  }
}

// Démarrer le bot
console.log('📱 Initialisation du bot principal...');
demarrerBot();
