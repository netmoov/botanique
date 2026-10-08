# Floreview V9.3 — Swipe façon application de rencontre

## Ce qui change

- La carte suit le doigt et pivote légèrement.
- Vers la gauche : tampon rose « À REVOIR ».
- Vers la droite : tampon vert « JE CONNAIS ».
- Une seconde carte apparaît derrière et grandit durant le swipe, sans exposer de réponse.
- Si le geste est trop court, la carte revient à sa place.
- Si le geste est validé, la carte glisse hors écran avant d'afficher la suivante.
- La page remonte en haut de chaque nouveau végétal.
- Les boutons et les touches gauche/droite continuent à fonctionner.
- Un clic sur « Afficher la réponse », « Voir la fiche complète » ou un lien photo ne déclenche pas de swipe.
- Les mouvements verticaux peuvent toujours faire défiler la page.
- Les mouvements animés sont limités si « Réduire les animations » est activé.

## Mise en place sur le dépôt existant netmoov/botanique

Remplacer :
- app.js
- index.html

Ajouter :
- swipe-tinder.css

Aucune modification de `data/`, de la progression locale ou des 158 images de `assets/images`.

Commit proposé : `V9.3 animation swipe cartes mobile`
