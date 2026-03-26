export const updatesLog = [
    {
        version: 'v3.6.0',
        date: '26 mars 2026',
        changes: [
            "### Gestion de l'Équipe",
            "🗄️ **Archivage des employés (Nouveau)** : Vous pouvez désormais archiver un ancien employé au lieu de le supprimer brutalement. Cela permet de conserver son historique de pointages pour la comptabilité (pendant 1 an, 3 ans ou 5 ans), tout en le retirant de l'application.",
            "🗑️ **Suppression totale** : L'option de suppression définitive et irréversible d'un compte ET de la totalité de ses pointages associés reste disponible lors de l'archivage.",
            "### Améliorations du Planning",
            "⚙️ **Affichage de l'équipe sur mesure** : Un nouveau bouton ⚙️ (engrenage) fait son apparition à côté de la liste d'équipe. Il vous permet de masquer ou d'afficher temporairement certains collègues de la liste latérale (très pratique pour les arrêts maladie ou les longs congés) sans avoir à toucher à leur compte."
        ]
    },
    {
        version: 'v3.5.9',
        date: '27 février 2026',
        changes: [
            "### Améliorations du Planning",
            "🕒 **Heure de rendez-vous** : L'heure de début planifiée par l'administrateur est désormais visible directement sur votre tableau de bord. Un badge affiche l'heure précise (ex: 08:00) à côté du nom de chaque chantier.",
            "🔒 **Sécurité Firestore** : Mise à jour globale des règles de sécurité de la base de données pour garantir un chargement instantané du planning tout en protégeant vos conversations privées."
        ]
    },
    {
        version: 'v3.5.8',
        date: '3 février 2026',
        changes: [
            "### Gestion des Chantiers",
            "📄 **Export PDF de la liste** : Un nouveau bouton permet de télécharger la liste complète de tous les chantiers (actifs et archivés) en PDF, incluant adresses, heures prévues et codes d'accès.",
            "💶 **Statut TVA** : Vous pouvez désormais indiquer si un chantier est 'Assujetti TVA' lors de sa création ou modification. Un badge visuel 'TVA' apparaît dans les listes pour une identification immédiate.",
            "🗑️ **Suppression définitive** : L'administrateur peut maintenant supprimer définitivement un chantier (avec une fenêtre de confirmation de sécurité), en plus de l'option d'archivage existante.",
            "### Améliorations du Planning",
            "🕒 **Date de publication** : Le planning affiche désormais la date et l'heure exactes de la dernière publication envoyée à l'équipe, permettant de savoir si le planning est à jour."
        ]
    },
    {
        version: 'v3.5.7',
        date: '22 décembre 2025',
        changes: [
            "### Améliorations du Tableau de Bord",
            "🔔 **Notifications de Messages** : Une nouvelle carte de notification s'affiche désormais directement sur votre tableau de bord (au-dessus du planning) lorsque vous avez des messages non lus.",
            "👀 **Aperçu Rapide** : Visualisez en un coup d'œil l'expéditeur et un extrait du dernier message reçu sans avoir à changer de page.",
            "🚀 **Accès Direct** : Cliquez simplement sur la notification pour être redirigé instantanément vers la messagerie."
        ]
    },
    {
        version: 'v3.5.6',
        date: '6 décembre 2025',
        changes: [
            "### Améliorations de la Messagerie",
            "🔴 **Messages Non Lus** : Ne manquez plus rien ! Une pastille rouge s'affiche désormais sur les conversations contenant des nouveaux messages, et le texte apparaît en gras.",
            "🗑️ **Suppression de Messages** : Vous pouvez maintenant supprimer vos propres messages (en cas d'erreur). Le message sera remplacé par une mention de suppression pour tous les participants.",
            "🗂️ **Gestion des Conversations** : Il est désormais possible de supprimer (masquer) une conversation de votre liste pour faire du tri. Elle réapparaîtra automatiquement si vous recevez un nouveau message dedans.",
            "✨ **Interface Modernisée** : Les fenêtres de confirmation (suppression, etc.) sont maintenant parfaitement intégrées au design de l'application (et au mode sombre), remplaçant les alertes classiques du navigateur."
        ]
    },
    {
        version: 'v3.5.5',
        date: '6 décembre 2025',
        changes: [
            "### Nouvelle Fonctionnalité : Messagerie 💬",
            "✨ **Messagerie Privée** : Un nouvel onglet 'Messagerie' est désormais disponible ! Vous pouvez discuter en direct avec vos collègues directement depuis l'application.",
            "🔒 **Confidentialité Garantie** : Vos conversations sont strictement privées. Seuls les participants à la discussion peuvent lire les messages (même les administrateurs n'y ont pas accès).",
            "📱 **Interface Intuitive** : Cliquez simplement sur le bouton `+` pour lancer une nouvelle conversation. L'interface est optimisée pour fonctionner aussi bien sur votre téléphone que sur ordinateur."
        ]
    },
    {
        version: 'v3.5.4',
        date: '12 novembre 2025',
        changes: [
            "### Améliorations du Tableau de Bord",
            "✨ **Accès rapide aux détails du chantier en cours** : Sur le tableau de bord, le nom du chantier sur lequel vous pointez actuellement est désormais **cliquable**. Cela ouvre la fenêtre de détails (adresse, codes, infos) sans avoir à chercher le chantier dans la liste.",
            "### Pour l'Administrateur",
            "✨ **Visualisation des pauses en temps réel** : La page \"Pointages en Temps Réel\" (📡) affiche désormais un indicateur visuel **\"EN PAUSE\"** lorsqu'un employé suspend son pointage. La carte de l'employé est mise en surbrillance et son chronomètre est figé, donnant une vision plus juste de l'activité sur le terrain."
        ]
    },
    {
        version: 'v3.5.3',
        date: '9 novembre 2025',
        changes: [
            "### Améliorations de la Page \"Paramètres\"",
            "✨ **Export PDF Professionnel** : Téléchargez l'intégralité de votre historique de pointages dans un fichier PDF clair et professionnel. L'export regroupe vos prestations jour par jour et inclut un total d'heures pour chaque journée.",
            "✨ **Changement de Mot de Passe** : Vous pouvez désormais demander un e-mail de réinitialisation de votre mot de passe directement depuis la page des paramètres.",
            "✨ **Donner un Feedback** : Une nouvelle section vous permet d'écrire une idée ou un rapport de bug et de l'envoyer directement par e-mail au développeur."
        ]
    },
    {
        version: 'v3.5.2',
        date: '9 novembre 2025',
        changes: [
            "### Nouvelle Page : 📊 Mes Statistiques",
            "✨ **Toute nouvelle page \"Mes Stats\"** : Une nouvelle section (disponible dans le menu) vous permet de consulter vos statistiques de prestation.",
            "✨ **Navigation par mois** : Consultez vos performances mois par mois à l'aide des flèches de navigation.",
            "✨ **Calcul du Solde Mensuel** : L'application calcule automatiquement votre solde d'heures. En se basant sur votre **contrat hebdomadaire** (défini par l'admin), elle affiche si vous avez des **heures supplémentaires** (en vert) ou des **heures manquantes** (en orange) pour le mois sélectionné.",
            "✨ **Top 5 Chantiers** : Visualisez instantanément les 5 chantiers sur lesquels vous avez passé le plus de temps durant le mois sélectionné, avec une barre de progression visuelle."
        ]
    },
    {
        version: 'v3.5.1',
        date: '6 novembre 2025',
        changes: [
            "### Améliorations du Planning Employé",
            "✨ **Détails du chantier accessibles** : Dans \"Mon Planning\", cliquer sur une tâche ouvre désormais une fenêtre de détails (similaire à celle de la page \"Chantiers\") affichant l'adresse, les codes d'accès et les infos supplémentaires.",
            "✨ **Format des heures amélioré** : L'affichage des heures planifiées (total de la semaine et par tâche) est maintenant au format \"HHh MMm\" (ex: `26h 48m`) au lieu du format décimal (ex: `26.8h`) pour une meilleure lisibilité."
        ]
    },
    {
        version: 'v3.5.0',
        date: '4 novembre 2025',
        changes: [
            "### Améliorations du Planning",
            "✨ **Total d'heures planifiées (Employé)** : Le planning utilisateur affiche désormais un \"Total semaine prevues\" en haut de la page. Ce total additionne les durées de toutes les tâches assignées à l'utilisateur pour la semaine.",
            "✨ **Durée des tâches (Admin)** : Lors de la création ou modification d'une tâche dans le planning, un nouveau champ \"Durée (h)\" permet de définir le temps alloué pour cette intervention. C'est ce champ qui est utilisé pour le calcul du total semaine de l'employé.",
            "✨ **Calcul des heures par personne (Employé)** : Sur une tâche du planning, le budget \"Heures prévues\" (défini dans Admin Chantiers) est maintenant automatiquement divisé par le nombre de personnes assignées à la tâche, affichant un budget \"par personne\"."
        ]
    },
    {
    version: 'v3.4.9',
    date: '3 novembre 2025',
    changes: [
        "### Gestion des Congés & Planning",
        "✨ **Lien direct entre Congés et Planning** : L'approbation d'une demande de congé (depuis 'Mes Congés' ou 'Admin Congés') crée désormais **automatiquement** un bloc \"Congé (Raison)\" dans le planning de l'administrateur pour les jours concernés. Le refus ou l'annulation d'un congé le retire automatiquement du planning.",
        "🐛 **Correction du décalage horaire des congés** : Un bug critique qui pouvait afficher une demande de congé un jour avant la date demandée (ex: 10 nov. au lieu du 11 nov.) a été corrigé. Les dates de congé sont désormais toujours affichées et enregistrées correctement.",
        "✨ **Priorisation des demandes (Admin)** : Dans la page 'Admin Congés', les demandes 'En attente' s'affichent désormais en premier dans la liste pour une action plus rapide, tout en gardant un tri par date de début."
    ]
},
    {
    version: 'v3.4.8',
    date: '29 octobre 2025',
    changes: [
        "### Améliorations Générales",
        "✨ **Navigation simplifiée** : Cliquer sur le logo \"Pointeuse Lpf\" en haut à gauche vous ramène désormais toujours à votre planning (Vue Employé). Si vous étiez en \"Vue Admin\", l'interface bascule automatiquement.",
        "🐛 **Correction des noms de collègues** : Un bug qui affichait `[object Object]` ou `undefined` au lieu des noms de vos collègues dans la fenêtre \"Démarrer un pointage\" a été corrigé.",
        "### Pour l'Administrateur",
        "✨ **Stats Globales Navigables** : Sur le Tableau de Bord, les cartes principales \"Heures (Semaine)\" et \"Heures (Mois)\" ont maintenant des flèches pour voir les totaux des périodes précédentes.",
        "✨ **Gestion des Congés (Admin)** : Les administrateurs peuvent désormais voir, accepter ou refuser les demandes de congé en attente directement depuis la page \"Mes Congés\" (la même que les utilisateurs).",
        "✨ **Recherche complète en Suivi des Heures** : La page \"Suivi des Heures\" (Facturation) affiche et permet désormais de rechercher **tous** les chantiers, y compris ceux n'ayant aucune heure enregistrée ce mois-ci (annule la restriction de la v3.4.7)."
    ]
},
    {
    version: 'v3.4.7',
    date: '15 octobre 2025',
    changes: [
        "### Pour l'Administrateur",
        "✨ **Vue épurée du Suivi des Heures** : La page de suivi n'affiche désormais par défaut que les chantiers sur lesquels des heures ont été prestées durant le mois en cours, offrant une vue plus pertinente de l'activité récente."
    ]
},
    {
    version: 'v3.4.6',
    date: '7 octobre 2025',
    changes: [
        "### Améliorations Générales",
        "✨ **Ajout manuel facilité** : Dans l'historique, les jours de la semaine s'affichent maintenant en permanence, même sans pointage existant, ce qui permet d'ajouter facilement une nouvelle entrée pour un jour oublié.",
        "### Pour l'Administrateur",
        "🐛 **Correction d'affichage** : La page 'Détails pour le chantier' s'adapte désormais correctement à tous les thèmes de l'application (y compris les thèmes sombres)."
    ]
},
    {
    version: 'v3.4.5',
    date: '3 octobre 2025',
    changes: [
        "### Pour l'Administrateur",
        "🐛 **Correction de la Duplication de Pointage** : La duplication d'un pointage pour un collègue (bouton `📋`) crée maintenant une copie 100% indépendante. La suppression de cette copie n'affecte plus le pointage original de l'employé qui l'a partagé."
    ]
},
    {
        version: 'v3.4.4',
        date: '2 octobre 2025',
        changes: [
            "### Pour l'Administrateur",
            "✨ **Réattribution des Pointages** : Dans l'historique d'un employé, un nouveau bouton `🔄` permet aux administrateurs de réattribuer un pointage à un autre utilisateur. Une fenêtre de sélection et une confirmation sécurisent l'opération."
        ]
    },
    {
        version: 'v3.4.3',
        date: '1 octobre 2025',
        changes: [
            "✨ Interface des filtres épurée : Dans l'historique, les options de recherche sont maintenant regroupées sous un unique bouton 'Affiner la recherche' pour une présentation plus claire.",
        ]
    },
    {
        version: 'v3.4.2',
        date: '1 octobre 2025',
        changes: [
            "### Améliorations Générales",
            "✨ **Vue Calendrier dans l'Historique** : Un nouveau bouton permet de basculer entre la liste et une vue calendrier mensuel. Les journées sont colorées en fonction des heures prestées pour une vision globale et rapide de l'activité.",
            "🔍 **Filtres Avancés dans l'Historique** : Filtrez les pointages par plage de dates personnalisée et/ou par chantier. Il est désormais possible de rechercher toutes les prestations d'un chantier spécifique sur l'ensemble de l'historique, sans limite de date."
        ]
    },
    {
        version: 'v3.4.1',
        date: '29 septembre 2025',
        changes: [
            "### Améliorations Générales",
            "✨ **Historique des Mises à Jour :** Un nouveau bouton dans la page **Paramètres** vous permet désormais de consulter l'historique complet de toutes les notes de version de l'application.",
            "### Pour l'Administrateur",
            "✨ **PDF de Planning en Grille** : La génération de PDF pour la planification a été entièrement revue. Elle produit maintenant une grille claire avec les employés en lignes et les jours en colonnes, optimisée pour tenir sur une seule page.",
            "🐛 **Correction des thèmes :** L'affichage des détails d'un chantier (depuis le tableau de bord) est maintenant compatible avec tous les thèmes. Les textes ne deviendront plus invisibles sur les thèmes sombres.",
            "🐛 **Modale d'historique corrigée sur mobile :** La fenêtre de modification des pointages dans l'historique est maintenant entièrement visible et défilable sur les écrans de téléphone, rendant les boutons de validation à nouveau accessibles.",
        ]
    },
    {
        version: 'v3.4.0',
        date: '28 septembre 2025',
        changes: [
            "### Pour l'Administrateur",
            "✨ **Sélection d'équipe persistante** : Dans la planification, vous pouvez maintenant sélectionner une équipe et l'assigner à plusieurs chantiers sans devoir la resélectionner à chaque fois.",
            "🔔 **Notifications d'annulation** : La suppression d'un chantier planifié envoie désormais une notification personnelle à tous les employés qui y étaient assignés.",
            "### Améliorations Générales",
            "🎨 **Thèmes plus vifs** : L'application inclut de toutes nouvelles palettes de couleurs plus vives et prononcées.",
            "🚀 **Démarrage plus fluide** : Le temps de chargement a été optimisé pour une expérience plus rapide.",
            "📱 **Stabilité des modales** : La structure des fenêtres (modales) a été revue pour un positionnement parfait sur mobile."
        ]
    },
    {
        version: 'v3.3.0',
        date: '28 septembre 2025',
        changes: [
            "### Pour les Employés",
            "✨ **Notifications de planning détaillées** : Recevez un résumé précis des changements (ajouts, retraits, annulations) pour chaque jour concerné.",
            "### Pour l'Administrateur",
            "👤 **L'admin sur le terrain** : L'administrateur peut maintenant s'assigner lui-même aux chantiers.",
            "🚀 **Planification plus fluide** : L'ajout ou la modification d'un chantier met à jour la grille instantanément, sans recharger toute la page.",
            "📱 **Interface 100% responsive** : La page de planification a été entièrement revue pour être parfaitement utilisable sur mobile."
        ]
    },
     {
        version: 'v3.2.0',
        date: '28 septembre 2025',
        changes: [
            "### Améliorations Générales",
            "✨ **Fenêtre de Nouveautés** : Une fenêtre (celle-ci !) s'affiche après une mise à jour pour informer des changements. La confirmation est maintenant liée à votre compte.",
            "🛠️ **Service Worker Corrigé** : Le système de mise à jour de l'application est maintenant beaucoup plus fiable.",
            "🐞 **Stabilité Accrue** : Résolution de nombreuses erreurs internes et bugs d'affichage."
        ]
    },
    {
        version: 'v3.1.0',
        date: '27 septembre 2025',
        changes: [
            "### Pour l'Administrateur",
            "📇 **Page 'Équipe' (Anciennement 'Contrats')** : Une interface moderne par 'cartes d'identité' pour gérer les informations des employés (GSM, adresse, N° national).",
            "📱 **Interactions GSM & GPS** : Cliquez sur un numéro pour appeler/envoyer un SMS, ou sur une adresse pour choisir entre Google Maps et Waze."
        ]
    }
];