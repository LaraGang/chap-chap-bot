#!/bin/bash

# Créer le dossier auth_info_baileys s'il n'existe pas
mkdir -p auth_info_baileys

# Si BAILEYS_AUTH_INFO_ZIP existe, extrait l'archive
if [ -n "$BAILEYS_AUTH_INFO_ZIP" ]; then
  echo "Extraction des données d'authentification WhatsApp..."
  echo "$BAILEYS_AUTH_INFO_ZIP" | base64 -d > ./auth_info_baileys.zip
  unzip -o ./auth_info_baileys.zip -d ./auth_info_baileys/
  rm ./auth_info_baileys.zip
fi

# Lance l'application
node app.js
