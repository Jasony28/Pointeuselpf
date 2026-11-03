// Corrections d'adresses de chantiers proposées après relecture de la liste du 03/02/2026 (export PDF).
// Affichées dans Admin → Chantiers tant que le chantier porte encore exactement l'ancienne adresse :
// l'admin coche ce qu'il accepte et applique. Une correction déjà faite (ou modifiée à la main) disparaît seule.
//
// Seulement les cas sûrs : fautes de frappe, commune ou code postal manquant quand il est évident.
// Les adresses incomplètes (village seul, pas de numéro) restent à compléter à la main.

export const ADDRESS_FIXES = [
    { name: 'DETHIER', from: 'Rue du facteur 5 soy', to: 'Rue du Facteur 5, Soy, 6997 Erezée', why: 'Soy était placé à plus de 100 km' },
    { name: 'Pharmacie grande', from: 'Rue de rochefort 122 Beaureing', to: 'Rue de Rochefort 122, 5570 Beauraing', why: 'faute : Beauraing' },
    { name: 'Bardaff', from: 'Rue de Mulhousse 36 Liège', to: 'Rue de Mulhouse 36, 4020 Liège', why: 'faute : Mulhouse' },
    { name: 'POLIIMAGE', from: '35 RUE DE MULHOUSE LIEGE', to: 'Rue de Mulhouse 35, 4020 Liège', why: 'numéro à la fin, code postal' },
    { name: 'Écurie du château', from: 'Rue de porcheresse 6, Tony st ode', to: 'Rue de Porcheresse 6, Tonny, 6680 Sainte-Ode', why: 'faute : Tonny, Sainte-Ode' },
    { name: 'Bironix', from: 'Chelin des fontaines 29 Erezée', to: 'Chemin des Fontaines 29, 6997 Erezée', why: 'faute : Chemin' },
    { name: 'Airbnb', from: 'Rue des Religieuse 13A 6900 Marche', to: 'Rue des Religieuses 13A, 6900 Marche-en-Famenne', why: 'faute : Religieuses' },
    { name: 'Manda', from: 'Place aux foire 18 marche', to: 'Place aux Foires 18, 6900 Marche-en-Famenne', why: 'faute : Foires, code postal' },
    { name: 'Effet', from: 'Rue des chasseurs ardennais 5 Marche', to: 'Rue des Chasseurs Ardennais 5, 6900 Marche-en-Famenne', why: 'cette rue existe dans plusieurs communes' },
    { name: 'Ecureuil', from: 'Rue borchamps 4 Marche', to: 'Rue Borchamps 4, 6900 Marche-en-Famenne', why: 'code postal' },
    { name: 'EVERCAR', from: 'Rue borchamps 10 Marche', to: 'Rue Borchamps 10, 6900 Marche-en-Famenne', why: 'code postal' },
    { name: 'Hotton', from: "Rue de l'espinette 33 NY", to: "Rue de l'Espinette 33, Ny, 6990 Hotton", why: 'Ny fait partie de Hotton' },
    { name: 'Bourdon', from: 'Vielle route de marenne 10', to: 'Vieille Route de Marenne 10, Bourdon, 6990 Hotton', why: 'commune manquante, faute : Vieille' },
    { name: 'Amand', from: 'Rue gros bois 3 Hampteau', to: 'Rue Gros Bois 3, Hampteau, 6990 Hotton', why: 'commune' },
    { name: 'Heure', from: 'Rue Les Vennes 15', to: 'Rue Les Vennes 15, 5377 Heure', why: 'commune manquante' },
    { name: 'GITE BAILLONVILLE', from: 'RUE DE LA CHAPELLE 3', to: 'Rue de la Chapelle 3, 5377 Baillonville', why: 'commune manquante' },
    { name: 'ecohouse', from: 'Chem. du Tombeu 6', to: 'Rue du Tombeu 6a, 5377 Baillonville', why: 'commune manquante (comme « Eco house »)' },
    { name: 'tenneville', from: 'Rue Vieille Pavée 3', to: 'Rue Vieille Pavée 3, 6970 Tenneville', why: 'commune manquante' },
    { name: 'Bomal', from: 'Rue du canal 12 bomal', to: 'Rue du Canal 12, 6941 Bomal-sur-Ourthe', why: 'code postal' },
    { name: 'La parenthèse', from: 'Allée de pierreuses 9 Bomal', to: 'Allée de Pierreuses 9, 6941 Bomal-sur-Ourthe', why: 'code postal' },
    { name: 'Panel', from: 'Rue des boussines 46 Vaux chavannes', to: 'Rue des Boussines 46, Vaux-Chavanne, 6960 Manhay', why: 'Vaux-Chavanne fait partie de Manhay' },
    { name: 'Dimanche', from: "Rue d'erezée 41/2 Grandmenil", to: "Rue d'Erezée 41/2, Grandmenil, 6960 Manhay", why: 'commune' },
    { name: 'Dochamps', from: 'Rue de la gare 26 Dochamps', to: 'Rue de la Gare 26, Dochamps, 6960 Manhay', why: 'commune' },
    { name: 'BEFFE', from: 'RUE  DU BOULEAUX 8 BEFFE', to: 'Rue des Bouleaux 8, Beffe, 6987 Rendeux', why: 'faute : des Bouleaux, commune' },
    { name: 'Baron', from: 'Sur les tailles 6 beffe', to: 'Sur les Tailles 6, Beffe, 6987 Rendeux', why: 'commune' },
    { name: 'Meline', from: 'Rue de soy 2 Erezée', to: 'Rue de Soy 2, 6997 Erezée', why: 'code postal' },
    { name: 'tjallée', from: 'Rue du mazy 4 Erezée', to: 'Rue du Mazy 4, 6997 Erezée', why: 'code postal' },
    { name: 'Raty', from: 'Rue des polissou 6/13 achène', to: 'Rue du Polissou 6/13, Achêne, 5590 Ciney', why: 'comme « Solar » : Rue du Polissou' },
    { name: 'Solar', from: 'Rue du polissou 38 Ciney', to: 'Rue du Polissou 38, 5590 Ciney', why: 'code postal' },
    { name: 'Chimsco', from: 'Rue du parc industriel 2 Achêne', to: 'Rue du Parc Industriel 2, Achêne, 5590 Ciney', why: 'Achêne fait partie de Ciney' },
    { name: 'Pharmacie petite', from: 'Rue ariste caussin 83 Anseremme', to: 'Rue Ariste Caussin 83, Anseremme, 5500 Dinant', why: 'Anseremme fait partie de Dinant' },
    { name: 'Gite saint nicolas', from: 'Rue saint nicolas 5 Eprave', to: 'Rue Saint-Nicolas 5, Eprave, 5580 Rochefort', why: 'Eprave fait partie de Rochefort' },
    { name: 'Boulangerie', from: 'Grande rue 233 Champlon', to: 'Grande Rue 233, 6971 Champlon', why: 'code postal' },
    { name: 'Camping', from: 'Berguème 9 tenneville', to: 'Berguème 9, 6970 Tenneville', why: 'code postal' },
    { name: 'Louftémont', from: 'Rue du Pierroy 4 Loutémont', to: 'Rue du Pierroy 4, Louftémont', why: 'faute : Louftémont' },

    // Deuxième passage : résultats de « Vérifier les adresses » (novembre 2026)
    { name: 'Virton', from: 'Rue Dr Jeanty 4', to: 'Rue Docteur Jeanty 4, 6760 Virton', why: 'commune manquante (trouvée à Virton)' },
    { name: 'Docteur Benny', from: 'Dom. de Tchession 19, 6980 La Roche-en-Ardenne', to: 'Domaine de Tchession 19, 6980 La Roche-en-Ardenne', why: 'abréviation « Dom. » non reconnue' },
    { name: 'Gite Pascal', from: 'Chemin des sangliers 40 biron', to: 'Chemin des Sangliers 40, Biron, 6940 Durbuy', why: 'commune (trouvée à Durbuy)' },
    { name: 'Hustuf deer boar lynx', from: 'rue pont des gattes 16 20 6687 bertogne', to: 'Rue Pont des Gattes 16, 6687 Bertogne', why: 'deux numéros : la carte ne trouvait que Bertogne' },
    { name: 'Hustuf weasel badger racoon', from: 'rue pont des gattes 40 44 6687 bertogne', to: 'Rue Pont des Gattes 40, 6687 Bertogne', why: 'deux numéros : la carte ne trouvait que Bertogne' },
    { name: 'Wiesmes', from: '', to: "Rue de l'Abreuvoir 14, Wiesme, 5571 Beauraing", why: 'adresse vide, reprise de la liste du 03/02 (« wiemes »)' },
    { name: 'Polimage', from: '', to: 'Rue de Mulhouse 35, 4020 Liège', why: 'adresse vide, reprise de la liste du 03/02 (« POLIIMAGE »)' },
    { name: 'Rati', from: '', to: 'Rue du Polissou 6/13, Achêne, 5590 Ciney', why: 'adresse vide, reprise de la liste du 03/02 (« Raty »)' },
    // Troisième passage : feuilles écrites à la main (photos du 03/11/2026)
    { name: 'Wiesmes', from: "Rue de l'Abreuvoir 14, 5570 Beauraing", to: "Rue de l'Abreuvoir 14, Wiesme, 5571 Beauraing", why: 'feuille : code postal 5571 (Wiesme)' },
    { name: 'Durbuy', from: '', to: 'Bohon 15, Bohon, 6940 Durbuy', why: 'adresse vide, feuille : « Bohon 15 »' },
    { name: 'Huet hotton', from: '', to: 'Rue de Barvaux 1, 6990 Hotton', why: 'adresse vide, feuille' },
    { name: 'Huet manhay', from: '', to: 'Route de Bomal 21/1, 6960 Manhay', why: 'adresse vide, feuille' },
    { name: 'Hustuf', from: '', to: 'Rue Pont des Gattes 16, 6687 Bertogne', why: 'adresse vide, feuille' },
    { name: 'FORAGE', from: 'BOUGE', to: "Route d'Hannut 113, 5004 Bouge", why: 'feuille : rue et numéro' },
    { name: 'Galaire', from: 'Bouge', to: 'Chaussée de Marche 264, 5100 Namur', why: 'feuille : Chaussée de Marche (numéro de la liste du 03/02)' },
    { name: 'Hilde', from: 'BOMAL', to: 'Allée de Pierreuses, 6941 Bomal-sur-Ourthe', why: 'feuille : rue (sans numéro)' },
    { name: 'Anders', from: 'Barvaux', to: 'Route de Marche 106, Barvaux, 6940 Durbuy', why: 'feuille : rue et numéro' },
    { name: 'Generet', from: 'Bonsin', to: 'Rue Chardeneux 1, Bonsin, 5377 Somme-Leuze', why: 'feuille : rue et numéro' },
    { name: 'Ockenove', from: 'Chem. des Bouleaux 25', to: 'Chemin des Bouleaux 25, Barvaux, 6940 Durbuy', why: 'feuille : à Barvaux (la carte le mettait à Rochefort)' },
    { name: 'Bockenove', from: 'Chem. des Bouleaux 29', to: 'Chemin des Bouleaux 29, Barvaux, 6940 Durbuy', why: 'feuille : à Barvaux' },
    { name: 'COMMUN MARCHE', from: 'PLACE AUX FOIRE', to: 'Rue Victor Libert 5, 6900 Marche-en-Famenne', why: 'feuille : rue Victor Libert (numéro de la liste du 03/02)' },
    // Quatrième passage : export PDF du 03/11/2026 comparé aux feuilles écrites à la main
    { name: 'wiemes', from: "Rue de l'Abreuvoir 14, Beauraing", to: "Rue de l'Abreuvoir 14, Wiesme, 5571 Beauraing", why: 'feuille : code postal 5571 (Wiesme)' },
    { name: 'BAR A VIN', from: 'RUE PORTE HAUTE MARCHE', to: 'Rue Porte Haute 3, 6900 Marche-en-Famenne', why: 'feuille : numéro 3' },
    { name: 'Bleuet', from: 'rue rompre 2 6980 la roche en ardennes', to: 'Rue Rompré 2, 6980 La Roche-en-Ardenne', why: 'orthographe : Rompré' },
    { name: 'Camping bure', from: 'CHEMIN DE LA CLUSURE 30 BURE', to: 'Chemin de la Clusure 30, Bure, 6927 Tellin', why: 'feuille : code postal 6927 (Bure fait partie de Tellin)' },
    { name: 'Lux', from: "Avenue de la toison d'or 27 Marche", to: "Avenue de la Toison d'Or 27, 6900 Marche-en-Famenne", why: 'feuille : code postal' },
    { name: 'Netcom', from: 'Rte de Bastogne 13a tenneville', to: 'Route de Bastogne 13a, 6970 Tenneville', why: 'feuille : code postal' },
    { name: 'Rochefort gauche / droite', from: 'Rue de la croix 3 Rochefort', to: 'Rue de la Croix 3, 5580 Rochefort', why: 'feuille : code postal' },
    { name: 'Soyeur marche', from: 'Avenue du monument 3 Marche', to: 'Avenue du Monument 3, 6900 Marche-en-Famenne', why: 'feuille : code postal' },
    { name: 'River vieuw', from: "Lion de l'ourthe 40 beffe", to: "Lion de l'Ourthe 40, Beffe, 6987 Rendeux", why: 'feuille : code postal 6987 (Beffe fait partie de Rendeux)' },
    { name: 'BEFFE', from: 'Rue des Bouleaux 6987/1, 6987 Rendeux', to: 'Rue des Bouleaux 8, Beffe, 6987 Rendeux', why: 'feuille : numéro 8 (« 6987/1 » n\'est pas un numéro)' },
    { name: 'Evercare', from: 'Rue borchamps 10 Marche', to: 'Rue Borchamps 10, 6900 Marche-en-Famenne', why: 'code postal' },
    { name: 'Chimisco', from: 'Rue du parc industriel 2 Achêne', to: 'Rue du Parc Industriel 2, Achêne, 5590 Ciney', why: 'Achêne fait partie de Ciney' },
];const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Corrections encore à faire : le chantier existe et porte toujours l'ancienne adresse. */
export function pendingAddressFixes(chantiers) {
    return ADDRESS_FIXES.flatMap(fix => chantiers
        .filter(c => norm(c.name) === norm(fix.name) && norm(c.address) === norm(fix.from))
        .map(c => ({ ...fix, id: c.id, status: c.status, address: c.address })));
}
