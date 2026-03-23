#!/bin/bash

# Script de débogage et push Git - Casper Dental
cd "$(dirname "$0")"

echo "🔧 Diagnostic et réparation Git..."
echo ""

# Nettoyage complet des verrous et de l'index
echo "1️⃣ Suppression des verrous et index corrompus..."
rm -f .git/index.lock
rm -f .git/index
rm -f .git/COMMIT_EDITMSG

# Configuration
echo "2️⃣ Configuration Git..."
git config user.email "robinmasini@users.noreply.github.com"
git config user.name "Robin Masini"

# Recréation de l'index
echo "3️⃣ Recréation de l'index Git..."
git reset

# Staging des fichiers
echo "4️⃣ Ajout des fichiers (peut prendre 30-60 secondes, soyez patient)..."
echo "   - Fichiers de configuration..."
git add .gitignore README.md package.json package-lock.json 2>/dev/null
echo "   - Fichiers TypeScript/Vite..."
git add *.config.js *.config.ts tsconfig*.json vite.config.ts index.html 2>/dev/null
echo "   - Dossier src/..."
git add src/ 2>/dev/null
echo "   - Dossier public/..."
git add public/ 2>/dev/null

# Vérification
echo ""
echo "5️⃣ Vérification des fichiers stagés..."
git status --short | head -10
echo "   (... et plus)"

# Commit
echo ""
echo "6️⃣ Création du commit..."
git commit -m "Initial commit - Casper Dental"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Commit créé avec succès!"
    echo ""
    echo "7️⃣ Push vers GitHub..."
    echo "⚠️  Vous allez devoir entrer votre token GitHub comme mot de passe"
    echo ""
    git push -u origin main
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "🎉 SUCCESS! Le code est sur GitHub!"
        echo "👉 Vérifiez: https://github.com/robinmasini/Casper Dental"
    else
        echo ""
        echo "❌ Erreur lors du push. Vérifiez votre token GitHub."
    fi
else
    echo ""
    echo "❌ Erreur lors du commit. Détails ci-dessus."
fi
