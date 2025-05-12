#!/bin/bash

# Détermine le répertoire temporaire utilisé par l'application sur Render
AUTH_DIR="/tmp/auth_info_baileys"

# Crée le répertoire d'authentification s'il n'existe pas
mkdir -p "$AUTH_DIR"

# Copie d'abord les fichiers d'authentification du dépôt vers le répertoire temporaire
echo "Copie des fichiers d'authentification du dépôt vers $AUTH_DIR..."
if [ -d "./auth_info_baileys" ]; then
  cp -rf ./auth_info_baileys/* "$AUTH_DIR/" 2>/dev/null || :
  echo "Fichiers d'authentification copiés depuis le dépôt."
fi

# Si BAILEYS_AUTH_INFO_ZIP existe, extrait l'archive
if [ -n "$BAILEYS_AUTH_INFO_ZIP" ]; then
  echo "Extraction des données d'authentification WhatsApp depuis la variable d'environnement..."
  echo "$BAILEYS_AUTH_INFO_ZIP" | base64 -d > ./auth_info_baileys.zip
  unzip -o ./auth_info_baileys.zip -d "$AUTH_DIR/"
  rm ./auth_info_baileys.zip
  echo "Extraction terminée."
fi

# Affiche les fichiers présents dans le répertoire d'authentification
echo "Contenu du répertoire d'authentification $AUTH_DIR :"
ls -la "$AUTH_DIR"

# Lance l'application
node app.js
