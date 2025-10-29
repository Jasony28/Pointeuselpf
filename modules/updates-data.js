export const updatesLog = [
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