const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const config = require('./config');

// Configuration
const ADMIN_NUMBER = config.ADMIN.jid;
const BOT_NUMBER = config.BOT_PRINCIPAL.jid;

// Fonction pour formater le numéro en JID
function formaterJID(numero) {
  if (numero.includes('@s.whatsapp.net')) return numero;
  return `${numero}@s.whatsapp.net`;
}

// Fonction pour envoyer un message formaté
async function envoyerMessage(sock, jid, message) {
  try {
    const formattedJid = formaterJID(jid);
    console.log(`📤 Tentative d'envoi à ${jid}: ${message.substring(0, 30)}...`);
    await sock.sendMessage(formattedJid, { text: message });
    console.log(`✅ Message envoyé avec succès à ${jid}`);
    return true;
  } catch (error) {
    console.error(`❌ ERREUR D'ENVOI à ${jid}:`, error);
    return false;
  }
}

// Fonction pour confirmer une transaction
async function confirmerTransaction(sock, numero) {
  try {
    console.log(`🔄 Tentative de confirmation pour le numéro: ${numero}`);
    
    // Vérifier si le numéro est valide
    if (!numero || numero.length < 8) {
      console.error(`❌ Numéro invalide: ${numero}`);
      await envoyerMessage(sock, ADMIN_NUMBER, `❌ Numéro invalide: ${numero}`);
      return false;
    }
    
    // Envoyer la confirmation à l'admin
    await envoyerMessage(sock, ADMIN_NUMBER, `✅ Transaction confirmée pour le numéro ${numero}`);
    
    // Envoyer la confirmation au bot principal
    await envoyerMessage(sock, BOT_NUMBER, `CMD:CONFIRMER:${numero}`);
    
    console.log(`✅ Confirmation envoyée pour le numéro ${numero}`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors de la confirmation pour ${numero}:`, error);
    await envoyerMessage(sock, ADMIN_NUMBER, `❌ Erreur lors de la confirmation pour ${numero}: ${error.message}`);
    return false;
  }
}

// Fonction principale pour démarrer le bot
async function demarrerBot() {
  console.log('🚀 Démarrage du bot de confirmation...');
  
  try {
    // Charger l'état d'authentification avec un nouveau dossier
    const { state, saveCreds } = await useMultiFileAuthState('auth_state_confirmation');
    console.log('✅ État d\'authentification chargé');

    // Logger pour les messages WhatsApp avec moins de messages pour réduire la charge
    const logger = pino({ level: 'error' });

    // Créer la connexion WhatsApp avec des paramètres anti-conflit
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger,
      markOnlineOnConnect: false,  // Ne pas marquer comme en ligne automatiquement
      version: [2, 2323, 4],       // Utiliser une version spécifique pour éviter les conflits
      browser: ['CHAP-CHAP Confirmation', 'Chrome', '10.0'],  // Identifiant unique pour ce bot
      connectTimeoutMs: 60000,     // Augmenter le délai avant timeout
      keepAliveIntervalMs: 30000,  // Keep-alive plus fréquent
      retryRequestDelayMs: 500     // Délai plus court pour les nouvelles tentatives
    });
    console.log('✅ Socket WhatsApp créé');

    // Gérer les événements de la connexion
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      console.log('💻 État de la connexion:', update);

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log('❌ Connexion fermée, code:', statusCode, 'reconnexion:', shouldReconnect);

        if (shouldReconnect) {
          // Attendre 10 secondes avant de se reconnecter pour éviter les cycles de reconnexion rapides
          console.log('🕔 Attente de 10 secondes avant de réessayer...');
          setTimeout(() => demarrerBot(), 10000);
        }
      } else if (connection === 'open') {
        console.log('✅ Bot de confirmation connecté avec succès!');
      }
    });

    // Écouter les changements d'état d'authentification
    sock.ev.on('creds.update', saveCreds);

    // Écouter les messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        // Ne traiter que les messages entrants
        if (!message.key.fromMe) {
          try {
            // Récupérer les détails du message
            const remoteJid = message.key.remoteJid;
            const messageContent = message.message?.conversation || 
                                  message.message?.extendedTextMessage?.text || 
                                  '';
            
            // S'il n'y a pas de contenu ou si c'est un message de statut, ignorer
            if (!messageContent || remoteJid === 'status@broadcast') {
              continue;
            }
            
            // Ignorer les messages de groupe
            if (remoteJid.includes('@g.us')) {
              console.log(`⚠️ Message ignoré - Message de groupe (${remoteJid})`);
              continue;
            }
            
            // Extraire le numéro d'expéditeur
            const sender = remoteJid.split('@')[0];
            const adminNumero = ADMIN_NUMBER.split('@')[0];
            
            // Afficher le message reçu
            console.log(`📥 Message reçu de ${sender}: ${messageContent}`);
            
            // Vérifier si le message vient de l'administrateur
            if (sender === adminNumero) {
              // Format: CONFIRMER:0142828966
              if (messageContent.startsWith('CONFIRMER:')) {
                const numero = messageContent.split(':')[1].trim();
                await confirmerTransaction(sock, numero);
              }
              // Format: confirmer 0142828966
              else if (messageContent.toLowerCase().startsWith('confirmer ')) {
                const numero = messageContent.split(' ')[1].trim();
                await confirmerTransaction(sock, numero);
              }
              else {
                await envoyerMessage(sock, ADMIN_NUMBER, 
                  `📋 *Commandes disponibles:*\n\n` +
                  `- CONFIRMER:0142828966\n` +
                  `- confirmer 0142828966`
                );
              }
            } 
            // Si ce n'est pas l'admin, ignorer
            else {
              console.log(`⚠️ Message ignoré - Utilisateur non autorisé (${sender})`);
            }
          } catch (err) {
            console.error('❌ Erreur lors du traitement du message:', err);
          }
        }
      }
    });

    return sock;
  } catch (err) {
    console.error('❌ Erreur lors du démarrage du bot:', err);
    console.log('🕔 Nouvelle tentative dans 20 secondes...');
    // Attendre 20 secondes avant de réessayer
    setTimeout(() => demarrerBot(), 20000);
    return null;
  }
}

// Démarrer le bot
console.log('📱 Initialisation du bot de confirmation...');
demarrerBot();
