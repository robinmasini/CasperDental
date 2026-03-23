#!/bin/bash

# Approche GitHub Desktop alternative - créer un bundle
cd "$(dirname "$0")"

echo "🧹 Nettoyage complet..."
rm -rf .git/index* .git/COMMIT_EDITMSG 2>/dev/null

echo "📝 Configuration..."
git config user.email "robinmasini@users.noreply.github.com"
git config user.name "Robin Masini"

echo "🎯 Méthode alternative: staging par lot..."

# Stage par catégorie pour éviter les timeouts
echo "  → Config files..."
find . -maxdepth 1 -type f \( -name "*.json" -o -name "*.js" -o -name "*.ts" -o -name "*.html" -o -name ".gitignore" -o -name "README.md" \) -exec git add {} +

echo "  → Source files..."
find src -type f -name "*.tsx" -exec git add {} + 2>/dev/null
find src -type f -name "*.ts" -exec git add {} + 2>/dev/null
find src -type f -name "*.css" -exec git add {} + 2>/dev/null

echo "  → Public files..."
git add public/ 2>/dev/null

echo ""
echo "💾 Création du commit..."
git commit -m "Initial commit - Casper Dental"

if [ $? -eq 0 ]; then
    echo "✅ Commit réussi!"
    echo ""
    echo "📤 Push vers GitHub..."
    git push -u origin main
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "🎉🎉🎉 SUCCESS! Tout est sur GitHub! 🎉🎉🎉"
        echo "Vérifiez: https://github.com/robinmasini/Casper Dental"
    fi
else
    echo "❌ Échec du commit"
fi
