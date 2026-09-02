# Vatu — anatomie réelle des documents MyMinfin

*Établi le 02/09/2026 en téléchargeant **un exemplaire de chacun des 106 types** présents en base et en extrayant leur texte. Source : `node scripts/doc-samples.mjs 200` → `samples-all.json` (106 documents, 276 Ko).*

---

## Le jeu de test est scindé par mandant, pas par type

| Mandant | Types échantillonnés | Coquilles synthétiques |
|---|---|---|
| **0806154033** | 94 | **0** |
| 0662348959 | 10 | 8 |
| 0663895516 | 2 | 1 |

Les documents de 0662348959 se réduisent à « *This document was generated the 2023-08-21… You can communicate the code … to confirm that you were able to download this document* ». Ce sont des fichiers de vérification technique.

**Tout le matériau de conception vient de 0806154033**, dont les 94 types sont de vrais courriers du SPF : en-tête, expéditeur, références, montants, délais, voies de recours.

**Formats rencontrés :** 94 PDF, **2 .docx**, 2 XML, 8 `application/octet-stream` dont six de **6 octets** (annexes vides).

➡️ Confirme que le `Content-Type` forcé à `application/pdf` dans `document.routes.js` est un bug réel : un .docx servi comme PDF ne s'ouvre pas.

---

## La Sommation, disséquée

183 exemplaires, et c'est le document qui justifie le produit :

```
Aanmaning : Niet betaalde BTW - Period 01/04/2026 - 30/04/2026
U hebt een onbetaalde schuld.

Door u te betalen:            € 14,00
Betaal binnen:                48 uur   na ontvangst van deze brief

Rekeningnummer:               BE42 6792 0000 0054
Gestructureerde mededeling:   ***200/7875/14372***
Begunstigde:                  FOD Financiën     BIC: GEBABEBB

Ons kenmerk: 200 787 514 372  |  Uw kenmerk: 0891.002.507
Aard van de schuld: Btw       Schuldnummer: 200 787 514 372
```

Tout y est : **montant dû, délai, compte, communication structurée, nature de la dette, période, numéro de dossier**. Un moteur d'extraction bien cadré sort les six champs sans ambiguïté.

Et le délai est **48 heures**, pas trente jours. C'est l'argument commercial le plus fort de Vatu : un courrier découvert trois jours plus tard est déjà hors délai.

---

## Ce qui est réellement extractible, et sur quelle proportion

Sur les 74 documents réels :

| Champ | Types concernés |
|---|---|
| Délai explicite | 27 / 74 |
| IBAN | 13 / 74 |
| Montant | 10 / 74 |
| Communication structurée | 9 / 74 |

**32 types portent un montant ou un délai — soit 524 documents sur 1804 en volume, 29 %.**

### La conséquence stratégique

**Sept documents sur dix ne contiennent rien d'actionnable.** Attestations, accusés de réception, annexes, récapitulatifs : ni argent, ni échéance. Les passer à un modèle coûterait cher pour ne rien produire.

➡️ **L'offre payante ne doit pas être « l'IA lit tous vos documents » mais « Vatu vous dit ce que vous devez, et pour quand ».** Extraction ciblée sur les familles à enjeu : le coût par client tombe d'environ 70 %, et la promesse devient vérifiable plutôt que vague.

---

## Les 32 types à traiter en priorité

| N | Type | Champs présents |
|---:|---|---|
| 183 | Sommation | montant · delai · comm · IBAN |
| 101 | AC4 déclaration des droits d'accises | montant |
| 50 | Document annexé à une demande E705 | delai |
| 42 | Demande de documents pour la demande d’amendement/invalidation d’une déclaration d'import  | delai |
| 41 | Demande de documents pour la demande d’amendement/invalidation d’une déclaration d’export  | delai |
| 15 | Refus de la demande {DECLARATION_NUMBER} | delai |
| 13 | Avis d'imputation d'un remboursement | montant · IBAN |
| 10 | Acceptation de la recevabilité de la demande {DECLARATION_NUMBER} | delai |
| 10 | Intention de refus pour la demande  {DECLARATION_NUMBER} | delai |
| 8 | Demande de documents pour la demande d’invalidation d’une déclaration AC4 {DECLARATION_NUM | delai |
| 7 | Précompte professionnel : Sommation de paiement | montant · delai · comm · IBAN |
| 6 | Demande d'informations supplémentaires - Non Activité | delai |
| 5 | Demande de documents manquants {DECLARATION_NUMBER} | delai |
| 4 | Relation d'enregistrement du contrat de bail. | montant |
| 3 | Invitation à payer Cliquet {CLIQUET_DECLARATION_REFERENCE} | delai · IBAN |
| 3 | Rappel pour absence de déclaration {FISC_EXERCISE_YEAR} | delai |
| 3 | UBO - amende | delai |
| 2 | Avis de paiement en cas d'application de l'article 415 | montant · comm · IBAN |
| 2 | PRP - Avis de rectification 279 | delai |
| 2 | Relation d’enregistrement de l’état des lieux | montant |
| 2 | Saisie-arrêt exécution | montant · delai · comm · IBAN |
| 2 | UBO - demande d'information | delai |
| 1 | avis d’amende {FISC_EXERCISE_YEAR} | delai |
| 1 | Avis d'imposition d’office (279E1) - {FISC_EXERCISE_YEAR} | delai |
| 1 | Contre-dénonciation de la saisie-arrêt exécution | delai · comm · IBAN |
| 1 | Déclaration de tiers-saisi : rappel | montant · delai · comm · IBAN |
| 1 | Demande d'informations supplémentaires - Agrément ASBL - Dons | delai |
| 1 | Demande d'informations supplémentaires - ET14000 | delai |
| 1 | Demande d'informations supplémentaires - Plaques commerciales | delai |
| 1 | Demande d’ouverture d’un dossier à la CDC | montant · delai · comm · IBAN |
| 1 | Rapport d’audit opérateur | delai |
| 1 | UBO - exemption | delai |

---

## Pièges de format à coder

1. **Le montant s'écrit `€ 14,00`** — symbole *avant* le nombre. Une expression attendant « 14,00 EUR » rate la Sommation. *(Erreur commise lors de la première mesure : 8 documents comptés au lieu de 10.)*
2. **Deux formats de communication structurée** coexistent : `+++044/9779/10293+++` et `***200/7875/14372***`.
3. **Les délais s'expriment en heures autant qu'en jours** : « 48 uur », « dans le mois », « trente jours calendriers », « 30 jours ». Ne pas supposer d'unité.
4. **La langue est mélangée au sein d'un même dossier** : 39 des 74 documents réels sont en néerlandais, le reste en français. Elle suit le **bureau émetteur**, pas le client. Ne jamais déduire la langue du cabinet de celle d'un document.
5. **Les documents de test portent `TEST` ou `TEST ACC`** en filigrane textuel — à ne pas confondre avec un champ métier.
6. **L'extraction aplatit les tableaux** : « Btw14,00 », « Totaal te betalen14,00 » sortent collés. Un découpage naïf sur les espaces échouera.

---

## Ce que la fiche document doit afficher

**Pour un document actionnable** (montant ou délai) :

- le type, dans la langue du cabinet ;
- **le montant dû**, en évidence ;
- **l'échéance en date absolue**, calculée depuis la réception — pas « 48 heures » mais « avant le 4 septembre, 14h » ;
- le compte et la communication structurée, **copiables en un clic** : c'est le geste suivant du comptable ;
- la nature de la dette et la période ;
- le lien vers le PDF d'origine.

**Pour les 70 % restants** : type, date, propriétaire, lien. Rien d'autre. Ne pas fabriquer de la valeur là où il n'y en a pas.
