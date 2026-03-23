#!/bin/bash

# Script de Push GitHub pour Casper Dental
cd "$(dirname "$0")"

echo "🧹 Nettoyage du lock Git..."
rm -f .git/index.lock

echo "📝 Configuration de Git..."
git config user.email "robinmasini@users.noreply.github.com"
git config user.name "Robin Masini"

echo "➕ Ajout des fichiers..."
git add .gitignore
git add README.md
git add package.json package-lock.json
git add index.html
git add *.config.js *.config.ts
git add tsconfig*.json
git add vite.config.ts
git add src/
git add public/

echo "💾 Création du commit..."
git commit -m "Initial commit - Casper Dental"

echo "📤 Push vers GitHub..."
git push -u origin main

echo "✅ Terminé !"
