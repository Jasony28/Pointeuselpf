export const updatesLog = [
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
            "✨ **Historique des Mises à Jour :** Un nouveau bouton dans la page **Paramètres**  vous permet désormais de consulter l'historique complet de toutes les notes de version de l'application.",
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