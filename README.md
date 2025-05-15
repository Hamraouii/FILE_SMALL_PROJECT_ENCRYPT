# Application de Chiffrement Sécurisé de Fichiers

Une application web permettant de chiffrer et déchiffrer des fichiers en toute sécurité en utilisant la cryptographie à clé publique.

## Fonctionnalités

- 🔐 Chiffrement et déchiffrement de fichiers sécurisés
- 🔑 Gestion des clés publiques et privées
- 👥 Système d'authentification des utilisateurs
- 📁 Support des fichiers CSV et Excel
- 🛡️ Stockage sécurisé des clés privées
- 🔄 Interface utilisateur intuitive en français

## Prérequis

- Node.js (version 14 ou supérieure)
- MongoDB
- npm ou yarn

## Installation

1. Clonez le dépôt :
```bash
git clone https://github.com/Hamraouii/MGPAP_ENCRYPT.git
```

2. Installez les dépendances :
```bash
npm install
```

3. Configurez les variables d'environnement :
Créez un fichier `.env` à la racine du projet avec les variables suivantes :
```env
MONGODB_URI=votre_uri_mongodb
SESSION_SECRET=votre_secret_session
PORT=3000
```

4. Lancez l'application :
```bash
npm start
```

## Structure du Projet

```
secure-file-encryption-app/
├── app.js                 # Point d'entrée de l'application
├── package.json           # Dépendances et scripts
├── .env                   # Variables d'environnement
├── .gitignore            # Fichiers ignorés par git
├── uploads/              # Dossier des fichiers téléchargés
├── views/                # Templates EJS
│   ├── partials/         # Partiels EJS
│   ├── dashboard.ejs     # Page tableau de bord
│   ├── encrypt.ejs       # Page de chiffrement
│   ├── decrypt.ejs       # Page de déchiffrement
│   └── ...
└── utils/                # Utilitaires
    └── cryptoUtils.js    # Fonctions de cryptographie
```

## Utilisation

1. **Inscription et Connexion**
   - Créez un compte utilisateur
   - Connectez-vous avec vos identifiants

2. **Génération des Clés**
   - Générez votre paire de clés (publique/privée)
   - Sauvegardez votre clé privée en lieu sûr

3. **Chiffrement de Fichiers**
   - Sélectionnez un fichier à chiffrer
   - Choisissez le destinataire
   - Téléchargez le fichier chiffré

4. **Déchiffrement de Fichiers**
   - Téléchargez le fichier chiffré
   - Entrez votre mot de passe
   - Téléchargez le fichier déchiffré

## Sécurité

- Les clés privées sont chiffrées avec le mot de passe de l'utilisateur
- Utilisation de l'algorithme AES-256-CBC pour le chiffrement des fichiers
- Gestion sécurisée des sessions
- Protection contre les attaques CSRF
- Validation des types de fichiers

## Dépendances Principales

- Express.js - Framework web
- MongoDB - Base de données
- Crypto - Cryptographie
- Multer - Gestion des uploads
- EJS - Moteur de template
- Bcrypt - Hachage des mots de passe

## Commandes utiles 
   **Backup**
   - docker run --rm -v uploads_data:/source -v $(pwd):/backup alpine tar -czf /backup/uploads_backup.tar.gz -C /source . 
   **restore**
   - docker run --rm -v uploads_data:/target -v $(pwd):/backup alpine sh -c "rm -rf /target/* && tar -xzf /backup/uploads_backup.tar.gz -C /target"


## Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## Support

Pour toute question ou problème, veuillez ouvrir une issue sur GitHub.

## Auteurs

- Ayoub EL HAMRAOUI - Développeur principal

