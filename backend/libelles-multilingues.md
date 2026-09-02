# Vatu — libellés de documents en FR / NL / DE

*Relevé le 02/09/2026 sur l'environnement d'acceptation du SPF, via `node scripts/doc-labels.mjs`. Recherche S01 à 55 jours sur les mandants 0806154033, 0662348959 et 0663895516 : **4 137 documents observés, 106 types distincts**.*

*Bien plus large que les 47 types de `vatu/categories-documents.md`, qui ne reflétaient que les 647 documents présents en base — le worker ne synchronise que sur 7 jours.*

---

## Quatre constats

### 1. Trois langues, jamais quatre

`docType.name` est un `LocalizedString`. Sur les 106 types : **FR 106/106, NL 106/106, DE 106/106, EN 0/106.**

L'anglais n'est jamais fourni. L'interface doit donc proposer **trois** langues. Et ces libellés ne s'inventent pas : « Avertissement-extrait de rôle » se dit **Aanslagbiljet**, « Sommation » se dit **Aanmaning**. Aucune traduction automatique ne produirait les termes qu'un comptable flamand reconnaît.

`pickLocalized()` n'en conserve qu'une et jette les autres. **À corriger : stocker les trois.**

### 2. Le libellé français n'est pas une clé unique

Deux types distincts portent le même libellé FR « Avis de paiement », avec des traductions différentes :

| FR | NL | DE | N |
|---|---|---|---|
| Avis de paiement | Betaalbericht | Zahlungsaufforderung | 1 722 |
| Avis de paiement | Betalingsbericht | Zahlungsavis | 1 |

➡️ Le classifier et la déduplication doivent porter sur le **triplet complet**, pas sur la chaîne française.

### 3. Les documents TVA existent — l'argumentaire tient

C'était l'inconnue la plus lourde. Réponse : oui.

- PDF / XML — Accusé de réception global d'un consignment **InterVat** (60)
- Récapitulatif de votre demande — Autorisation **E.T. 90.500 — entrepôt TVA** (8)
- Demande 6 % TVA pour l'entretien d'un véhicule (10) · Demande remboursement TVA à l'achat d'un véhicule (10)

Les flux TVA transitent bien par MyMinfin. Rien à changer au positionnement.

### 4. Toute une famille « recouvrement » manquait au premier inventaire

Et c'est celle qui justifie le produit. Ces types n'apparaissaient pas dans les 647 documents en base :

| Type | N | Ce que ça signifie |
|---|---|---|
| **Saisie-arrêt exécution** | 2 | Saisie entre les mains d'un tiers. Le plus grave qui puisse arriver. |
| Contre-dénonciation de la saisie-arrêt exécution | 1 | Suite de procédure |
| Déclaration de tiers-saisi : rappel | 1 | Le tiers saisi n'a pas répondu |
| Liste de frais de poursuites | 1 | Les frais courent déjà |
| **Avis d'imposition d'office (279E1)** | 1 | L'administration taxe d'office, faute de réponse |
| **Rappel pour absence de déclaration** | 3 | Déclaration non déposée |
| Précompte professionnel : Sommation de paiement | 7 | Mise en demeure ciblée PP |
| avis d'amende | 1 | Amende notifiée |
| Demande de données comptables **BE SAF-T** | 31 | Demande du fichier comptable — contrôle |
| Demande de renseignement aux tiers | 3 | Enquête auprès de tiers |
| Avertissement d'une possible décision négative | 6 | Préavis défavorable |
| **UBO — notification de non-conformité** | 4 | Registre UBO non conforme |
| UBO — amende | 3 | Sanction UBO |

**« Rappel pour absence de déclaration » est aussi structurant que la Sommation.** L'un dit « vous n'avez pas payé », l'autre « vous n'avez pas déposé ». Ce sont les deux fautes qu'un cabinet ne peut pas laisser passer, et les deux alertes qui vendent Vatu.

### Défauts dans les données du SPF

À afficher telles quelles — corriger silencieusement les libellés officiels créerait un écart avec ce que le client voit sur MyMinfin — mais à connaître :

- **DE parfois en anglais** : « Request documents for customs control », « Request missing documents »
- **Fautes de frappe** : « Vorä**s**chlag der vereinfachten Erkl**r**ung », « Unternehmen**Entscheidung** »
- **Redondance** : « Zusammenfassung Ihres Antrags – Zusammenfassung Ihres Antrags »
- **Non traduits** : « Supporting document », « D&A additional information… » identiques dans les trois langues
- **Espaces parasites** en tête de libellé (` Voorraadaangifte`, ` Versements anticipés`) → toujours `trim()`

---

## Table de référence — 106 types

⚠️ marque les types de la famille recouvrement / contrôle / défaut de déclaration.

| N | FR | NL | DE |
|---:|---|---|---|

| 1722 | Avis de paiement | Betaalbericht | Zahlungsaufforderung |
| 633 | Récapitulatif de votre demande - Attestation de non-activité (exonération de la cotisation à charge des sociétés – INASTI) | Samenvatting van uw aanvraag - Attest van non-activiteit (vrijstelling van de bijdrage ten laste van de vennootschappen – RSVZ) | Zusammenfassung Ihres Antrags – Bescheinigung über die Nichtaktivität (Befreiung des Beitrags zu Lasten der Gesellschaften – LISVS) |
| 200 | Attestation de résidence - entreprises - 276CONV | Woonplaatsattest - ondernemingen - 276CONV | Bescheinigung des steuerlichen Wohnsitzes - UnternehmenEntscheidung - 276CONV |
| 192 | XML formulaire CBC NOT | XML formulier CBC NOT | XML formular CBC NOT |
| 164 | ⚠️ Sommation | Aanmaning | Mahnung |
| 162 | Annexe - Attestation de non-activité (exonération de la cotisation à charge des sociétés – INASTI) | Bijlage - Attest van non-activiteit (vrijstelling van de bijdrage ten laste van de vennootschappen – RSVZ) | Anhang - Bescheinigung über die Nichtaktivität (Befreiung des Beitrags zu Lasten der Gesellschaften – LISVS) |
| 108 | Annexe de la demande pour les plaques commerciales | Bijlage bij de aanvraag voor commerciële platen | Anhang zum Antrag für kommerzielle platten |
| 84 | AC4 déclaration des droits d'accises | AC4 aangifte van accijnzen | AC4 Angabe von Verbrauchsteuern |
| 50 | Document annexé à une demande E705 | Bijlage bij E705 aanvraag | E705 Antrag - beigefügten Dokumenten |
| 47 | Déclaration de stock Cliquet {CLIQUET_DECLARATION_REFERENCE} | Voorraadaangifte Cliquet {CLIQUET_DECLARATION_REFERENCE} | Bestandsmeldung Cliquet {CLIQUET_DECLARATION_REFERENCE} |
| 46 | Accusé de réception de la déclaration -  {FISC_EXERCISE_YEAR} | Ontvangstbewijs van de aangifte - {FISC_EXERCISE_YEAR} | Empfangsbestätigung der Erklärung - {FISC_EXERCISE_YEAR} |
| 46 | Rapports et délibérations assemblée générale -  {FISC_EXERCISE_YEAR} | Verslagen en besluiten algemene vergadering - {FISC_EXERCISE_YEAR} | Berichte und Beschlüsse Generalversammlung - {FISC_EXERCISE_YEAR} |
| 41 | ⚠️ Demande de documents pour la demande d’amendement/invalidation d’une déclaration d’export {DECLARATION_NUMBER} | Verzoek om documenten voor aanvraag inzake amendment/annulatie van de uitvoeraangifte {DECLARATION_NUMBER} | Request documents for amendment or invalidation request of an export declaration {DECLARATION_NUMBER} |
| 40 | ⚠️ Demande de documents pour la demande d’amendement/invalidation d’une déclaration d'import  {DECLARATION_NUMBER} | Verzoek om documenten voor aanvraag inzake amendment/annulatie van de importaangifte {DECLARATION_NUMBER} | Request documents for amendment or invalidation request of an import declaration {DECLARATION_NUMBER} |
| 40 | PDF de la déclaration -  {FISC_EXERCISE_YEAR} | PDF van de aangifte - {FISC_EXERCISE_YEAR} | PDF-Datei der Erklärung - {FISC_EXERCISE_YEAR} |
| 33 | Avertissement-extrait de rôle {FISC_EXERCISE_YEAR} | Aanslagbiljet {FISC_EXERCISE_YEAR} | Steuerbescheid {FISC_EXERCISE_YEAR} |
| 31 | ⚠️ Demande de données comptables BE SAF-T | Opvraging data boekhouding BE SAF-T | Ersuchen um Buchhaltungsdaten BE SAF-T |
| 30 | PDF - Accusé de réception global d'un consignment InterVat | PDF - Globale ontvangstbevestiging van een InterVat-zending | Globale Empfangsbestätigung für eine InterVat-Sendung |
| 30 | XML - Accusée de réception global d'un consignment InterVat | XML - Globale ontvangstbevestiging van een InterVat-zending | XML-Globalbestätigung für den Erhalt einer InterVat-Sendung |
| 25 | ⚠️ Demande de documents pour le control douanier {DECLARATION_NUMBER} - {DOCUMENT_ID} | Verzoek om documenten voor douanecontrole {DECLARATION_NUMBER} - {DOCUMENT_ID} | Request documents for customs control {DECLARATION_NUMBER} - {DOCUMENT_ID} |
| 23 | Récapitulatif de votre demande - Agrément ASBL - Dons | Samenvatting van uw aanvraag - Erkenning vzw’s - Giften | Zusammenfassung Ihres Antrags – Zusammenfassung Ihres Antrags |
| 17 | ⚠️ Demande de documents pour le control douanier (GIP) {DECLARATION_NUMBER} - {DOCUMENT_ID} | Verzoek om documenten voor douanecontrole (GIP) {DECLARATION_NUMBER} - {DOCUMENT_ID} | Request documents for customs control (GIP) {DECLARATION_NUMBER} - {DOCUMENT_ID} |
| 15 | Proposition de déclaration simplifiée {FISC_EXERCISE_YEAR} | Voorstel van vereenvoudigde aangifte {FISC_EXERCISE_YEAR} | Voräschlag der vereinfachten Erklrung {FISC_EXERCISE_YEAR} |
| 15 | Versements anticipés - Avantages | Voordelen van voorafbetalingen | Vorauszahlungen - Vorteile |
| 14 | Refus de la demande {DECLARATION_NUMBER} | Weigering van de aanvraag {DECLARATION_NUMBER} | Ablehnung der Antrag {DECLARATION_NUMBER} |
| 13 | Avis d'imputation d'un remboursement | Bericht van aanwending van een teruggave | Buchungsbenachrichtigung einer Erstattung |
| 11 | Avertissement extrait de Rôle - {FISC_EXERCISE_YEAR} | Aanslagbiljet - {FISC_EXERCISE_YEAR} | Steuerbescheid - {FISC_EXERCISE_YEAR} |
| 10 | Annexe APT8 {FISC_EXERCISE_YEAR} | Bijlage APT8 {FISC_EXERCISE_YEAR} | Anhang APT8  {FISC_EXERCISE_YEAR} |
| 10 | Annexe APT9 {FISC_EXERCISE_YEAR} | Bijlage APT9 {FISC_EXERCISE_YEAR} | Anhang APT9  {FISC_EXERCISE_YEAR} |
| 10 | Annexe indemnité kilométrique forfaitaire {FISC_EXERCISE_YEAR} | Bijlage forfaitaire kilometervergoeding {FISC_EXERCISE_YEAR} | Anlage pauschalen Kilometerentschädigung {FISC_EXERCISE_YEAR} |
| 10 | ⚠️ Avertissement-extrait de rôle amende administrative impôt des personnes physiques | Aanslagbiljet administratieve boete personenbelasting | Steuerbescheid administrative Geldbuße Steuer der natürlichen Personen |
| 10 | ⚠️ Avertissement-extrait de rôle amende administrative précompte professionnel | Aanslagbiljet administratieve boete bedrijfsvoorheffing | Steuerbescheid administrative Geldbuße Berufssteuervorabzug |
| 10 | Demande 6 % TVA pour l’entretien d’un véhicule | Aanvraag 6 % btw voor onderhoud voertuig | Antrag 6 % MwSt. bei Wartung eines Fahrzeugs |
| 10 | Demande remboursement TVA à l’achat d’un véhicule | Aanvraag teruggave btw bij aankoop voertuig | Antrag Erstattung MwSt. beim Kauf eines Fahrzeugs |
| 10 | Formulaire de déclaration d’un bien à l’étranger. | Formulier voor aangifte van een goed in het buitenland. | Meldeformular für ein ausländisches Gut |
| 10 | ⚠️ Intention de refus pour la demande  {DECLARATION_NUMBER} | Intentie tot weigering van de aanvraag {DECLARATION_NUMBER} | Absicht der Ablehnung des Antrags {DECLARATION_NUMBER} |
| 9 | Attestation de résidence - particuliers/indépendants -276CONV | Woonplaatsattest - particulieren/zelfstandigen -276CONV | Bescheinigung des steuerlichen Wohnsitzes - Privatpersonen/Selbstständige - 276CONV |
| 8 | ⚠️ Demande de documents pour la demande d’invalidation d’une déclaration AC4 {DECLARATION_NUMBER} | Verzoek om documenten voor aanvraag inzake annulatie van AC4 aangifte {DECLARATION_NUMBER} | Request documents for invalidation request of AC4 declaration {DECLARATION_NUMBER} |
| 8 | Récapitulatif de votre demande - Autorisation E.T. 90.500 - entrepôt TVA | Samenvatting van uw aanvraag -   Vergunning E.T. 90.500 - btw-entrepot | Zusammenfassung Ihres Antrags – Genehmigung E.T. 90.500 - MwSt.-Lager |
| 7 | Aperçu des données validées pour un signal E705 | Overzicht gevalideerde E705 | Bewährte E705 - Überblick |
| 7 | Fichier téléchargé via MyMinfin | Document opgeladen via MyMinfin | Datei-Upload über MyMinfin |
| 7 | ⚠️ Précompte professionnel : Sommation de paiement | Bedrijfsvoorheffing: Aanmaning | Berufssteuervorabzug: Mahnung |
| 7 | Réclamation - Annexe - Impôts directs PP | Bezwaarschrift - Bijlage - Directe belastingen NP | Widerspruch - Anlage - Direkte Steuern NP |
| 6 | Acceptation de la recevabilité de la demande {DECLARATION_NUMBER} | Ontvankelijkheid aanvaard voor de aanvraag {DECLARATION_NUMBER} | Annahme der Zulässigkeit des Antrags {DECLARATION_NUMBER} |
| 6 | Accusé de réception Pillar2 {FISC_TAX_TYPE} déclaration - {REPORTED_YEAR} | Ontvangsbevestiging Pillar2 {FISC_TAX_TYPE} Declaratie - {REPORTED_YEAR} | Eingangsbestätigung Pillar2 {FISC_TAX_TYPE} Erklärung - {REPORTED_YEAR} |
| 6 | ⚠️ Avertissement d'une possible décision négative relative à  {DECLARATION_NUMBER} | Waarschuwing over mogelijke negatieve beslissing met betrekking tot {DECLARATION_NUMBER} | Warnung vor möglichen negativen Entscheidungen im Zusammenhang mit {DECLARATION_NUMBER} |
| 6 | Conventions {FISC_EXERCISE_YEAR} | Overeenkomsten {FISC_EXERCISE_YEAR} | Verträge {FISC_EXERCISE_YEAR} |
| 6 | Demande d'informations supplémentaires - Non Activité | Vraag om inlichtingen - Non-activiteit | Ersuchen um Auskunft - Nichtaktivität |
| 5 | Acte de caution | Borgstellingsakte | Urkunde über die Hinterlegung einer Sicherheit |
| 5 | ⚠️ Demande de documents manquants pour le control douanier {DECLARATION_NUMBER} - {DOCUMENT_ID} | Verzoek om ontbrekende documenten voor douanecontrole {DECLARATION_NUMBER} - {DOCUMENT_ID} | Request missing documents for customs control {DECLARATION_NUMBER} - {DOCUMENT_ID} |
| 5 | ⚠️ Demande de documents manquants {DECLARATION_NUMBER} | Verzoek om ontbrekende documenten {DECLARATION_NUMBER} | Request missing documents {DECLARATION_NUMBER} |
| 5 | ⚠️ PRM - Avis de rectification 279 | RV - Bericht van wijziging - 279 | MStV - Berichtigungsanzeige - 279 |
| 5 | Récapitulatif de votre demande - Autorisation ET14000 | Samenvatting van uw aanvraag - Vergunning ET14000 | Zusammenfassung Ihres Antrags – Genehmigung ET14000 |
| 5 | Réponse à votre contact | Antwoord op uw contact | Antwort auf Ihre Anfrage |
| 4 | Accusé de réception DAC9/GIR déclaration - {REPORTED_YEAR} | Ontvangsbevestiging DAC9/GIR Declaratie - {REPORTED_YEAR} | Eingangsbestätigung DAC9/GIR Erklärung - {REPORTED_YEAR} |
| 4 | Annexe - Agrément ASBL - Dons | Bijlage - Erkenning vzw’s - Giften | Anhang - Zulassung VoG - Spenden |
| 4 | Annexe plan de réorganisation {FISC_EXERCISE_YEAR} | Bijlage reorganisatieplan {FISC_EXERCISE_YEAR} | Anlage Reorganisationsplan {FISC_EXERCISE_YEAR} |
| 4 | Décision favorable Remboursement Cliquet {CLIQUET_DECLARATION_REFERENCE} | Gunstige beslissing Terugbetaling Cliquet {CLIQUET_DECLARATION_REFERENCE} | Begünstigende Entscheidung Erstattung Cliquet {CLIQUET_DECLARATION_REFERENCE} |
| 4 | ⚠️ PRP - Demande de renseignements 332 | BV - Vraag om inlichtingen 332 | BStV - Ersuchen um Auskunft 332 |
| 4 | ⚠️ UBO - notification de non-conformité | UBO - kennisgeving van niet-naleving | UBU - Meldung der Nichteinhaltung |
| 3 | Accusé de réception déclaration 111/2 | Ontvangstbevestiging verklaring 111/2 | Empfangsbestätigung Erklärung 111/2 |
| 3 | Annexe tableau d'amortissements {FISC_EXERCISE_YEAR} | Bijlage afschrijvingstabel {FISC_EXERCISE_YEAR} | Anlage Abschreibungstabelle {FISC_EXERCISE_YEAR} |
| 3 | ⚠️ Demande de renseignement aux tiers | Vraag om inlichtingen aan derden | Ersuchen um Auskunft an Dritte |
| 3 | Décision - Attestation de non-activité (exonération de la cotisation à charge des sociétés – INASTI) | Beslissing - Attest van niet-activiteit (vrijstelling van de bijdrage ten laste van de vennootschappen – RSVZ) | Entscheidung – Bescheinigung über die Nichtaktivität (Befreiung vom Beitrag zu Lasten der Gesellschaften – LISVS) |
| 3 | Déclaration Cadastre - {PATDOC_PARCEL_ID} | Kadasteraangifte - {PATDOC_PARCEL_ID} | Katastererklärung - {PATDOC_PARCEL_ID} |
| 3 | Invitation à payer Cliquet {CLIQUET_DECLARATION_REFERENCE} | Uitnodiging tot betaling Cliquet {CLIQUET_DECLARATION_REFERENCE} | Zahlungsaufforderung Cliquet {CLIQUET_DECLARATION_REFERENCE} |
| 3 | ⚠️ PRP - Proposition d'accord | BV - Akkoordverklaring | BStV - Einverständnis |
| 3 | ⚠️ Rappel pour absence de déclaration {FISC_EXERCISE_YEAR} | Herinnering niet-indiening aangifte {FISC_EXERCISE_YEAR} | Erinnerung Nichtabgabe der Erklärung {FISC_EXERCISE_YEAR} |
| 3 | ⚠️ UBO - amende | UBO - boete | UBU - Geldbuße |
| 3 | Validation de la demande {DECLARATION_NUMBER} | Aanvaarding van de aanvraag {DECLARATION_NUMBER} | Annahme des Antrags {DECLARATION_NUMBER} |
| 2 | Attribution de numéro BCE Pillar2 - [{LANGUAGE}] | Toewijzing van KBO-nummer Pillar2 - [{LANGUAGE}] | Zuweisung ZDU-Nummer Pillar2 - [{LANGUAGE}] |
| 2 | Autres annexes {FISC_EXERCISE_YEAR} | Andere bijlagen {FISC_EXERCISE_YEAR} | Andere Anhänge {FISC_EXERCISE_YEAR} |
| 2 | Avis de paiement en cas d'application de l'article 415 | Betaalbericht in geval van toepassing van artikel 415 | Zahlungsaufforderung bei Anwendung des Artikels 415 |
| 2 | D&A additional information about the authorisations for the EO | D&A additional information about the authorisations for the EO | D&A additional information about the authorisations for the EO |
| 2 | ⚠️ Demande de documents pour le control douanier  (GIP) {DECLARATION_NUMBER} - {DOCUMENT_ID} | Verzoek om documenten voor douanecontrole (GIP) {DECLARATION_NUMBER} - {DOCUMENT_ID} | Request documents for customs control (GIP) {DECLARATION_NUMBER} - {DOCUMENT_ID} |
| 2 | Documents complémentaires requis par le PCI {DECLARATION_NUMBER} | Bijkomende documenten gevraagd door PCI {DECLARATION_NUMBER} | Zusätzliche von PCI angeforderte Unterlagen {DECLARATION_NUMBER} |
| 2 | Déclaration fiscale (via Tax-on-web Téléphonie) {FISC_EXERCISE_YEAR} | Belastingaangifte (via Tax-on-web Telefonie) {FISC_EXERCISE_YEAR} | Steuererklärung (über Tax-on-web - Telefonisch) {FISC_EXERCISE_YEAR} |
| 2 | ⚠️ PRP - Avis de rectification 279 | BV - Bericht van wijziging - 279 | BStV - Berichtigungsanzeige - 279 |
| 2 | ⚠️ Saisie-arrêt exécution | Uitvoerend beslag onder derden | Drittvollstreckungspfändung |
| 2 | Supporting document | Supporting document | Supporting document |
| 2 | UBO - demande d'information | UBO - verzoek om informatie | UBU - Auskunftsersuchen |
| 2 | {CADEX-MMF-NUMBER}_ {CADEX-MMF-PRODUCT} Extrait Cadastral | {CADEX-MMF-NUMBER}_ {CADEX-MMF-PRODUCT} Kadastraal uittreksel | {CADEX-MMF-NUMBER}_ {CADEX-MMF-PRODUCT} Katasterauszug |
| 1 | Accusé de réception DAC6/MDR Déclaration -  {REPORTED_YEAR} | Ontvangsbevestiging DAC6/MDR Declaratie - {REPORTED_YEAR} | Eingangsbestätigung DAC6/MDR Erklärung - {REPORTED_YEAR} |
| 1 | Annexe -   Autorisation E.T. 90.500 - entrepôt TVA | Bijlage -   Vergunning E.T. 90.500 - btw-entrepot | Anhang - Genehmigung E.T. 90.500 - MwSt.-Lager |
| 1 | Annexe des dépenses non admises {FISC_EXERCISE_YEAR} | Bijlage verworpen uitgaven  {FISC_EXERCISE_YEAR} | Anlage Nicht zugelassene Ausgaben {FISC_EXERCISE_YEAR} |
| 1 | Attachement Declaration Pillar2 - [{LANGUAGE}] | Bijlage Declaration Pillar2 - [{LANGUAGE}] | Anhang Declaration Pillar2 - [{LANGUAGE}] |
| 1 | ⚠️ Avis d'imposition d’office (279E1) - {FISC_EXERCISE_YEAR} | Bericht van aanslag van ambtswege (279E1) - {FISC_EXERCISE_YEAR} | Veranlagung von Amts wegen (279E1) - {FISC_EXERCISE_YEAR} |
| 1 | Avis de paiement | Betalingsbericht | Zahlungsavis |
| 1 | Contrat de bail | Huurcontract | Mietvertrag |
| 1 | ⚠️ Contre-dénonciation de la saisie-arrêt exécution | Tegenaanzegging van een uitvoerend beslag onder derden | Gegenmitteilung einer Drittvollstreckungspfändung |
| 1 | Demande d'informations supplémentaires - Agrément ASBL - Dons | Vraag om inlichtingen -  Erkenning vzw’s - Giften | Ersuchen um Auskunft - Zulassung VoG - Spenden |
| 1 | Demande d'informations supplémentaires - ET14000 | Vraag om inlichtingen - ET14000 | Ersuchen um Auskunft - ET14000 |
| 1 | Demande d'informations supplémentaires - Plaques commerciales | Vraag om inlichtingen - Commerciele nummerplaten | Ersuchen um Auskunft - Kommerzielles Nummernschild |
| 1 | Demande d’ouverture d’un dossier à la CDC | Verzoek tot het openen van een dossier bij de DCK | Antrag auf Eröffnung einer Akte bei der HKK |
| 1 | Décision - Agrément ASBL - Dons | Beslissing - Erkenning vzw’s - Giften | Entscheidung - Zulassung VoG - Spenden |
| 1 | ⚠️ Déclaration de tiers-saisi : rappel | Verklaring van derde-beslagene: herinnering | Erklärung des Drittgepfändeten: Erinnerung |
| 1 | Etat des lieux | Plaatsbeschrijving | Ortsbefund |
| 1 | ⚠️ Liste de frais de poursuites | Lijst van vervolgingskosten | Liste der Betreibungskosten |
| 1 | ⚠️ PRM - Demande de renseignements 332 | RV - Vraag om inlichtingen 332 | MStV - Ersuchen um Auskunft 332 |
| 1 | Rapport d’audit opérateur | Auditrapport operator | Auditbericht Wirtschaftsbeteiligter |
| 1 | Relation d'enregistrement du contrat de bail. | Registratierelaas van het huurcontract | Registrierungsbericht des Mietvertrags |
| 1 | Relation d’enregistrement de l’état des lieux | Registratierelaas van de plaatsbeschrijving | Registrierungsbericht des Ortsbefunds |
| 1 | Réclamation - Impôts directs PM | Bezwaarschrift - Directe belastingen RP | Widerspruch - Direkte Steuern JP |
| 1 | Temporary docType with reminder option for VP test purpose | Temporary docType with reminder option for VP test purpose | Temporary docType with reminder option for VP test purpose |
| 1 | UBO - exemption | UBO - ontheffing | UBU - Freistellung |
| 1 | ⚠️ avis d’amende {FISC_EXERCISE_YEAR} | Boetebericht {FISC_EXERCISE_YEAR} | Geldbußenbescheid {FISC_EXERCISE_YEAR} |

---

## Conséquences pour le code

1. **Schéma** : `documents.document_type_fps` ne stocke qu'une langue. Ajouter une colonne `document_type_i18n JSONB` portant le `LocalizedString` complet, et faire du triplet la clé de classification.
2. **`pickLocalized()`** : conserver son rôle pour l'affichage, mais ne plus être le seul point où passent les libellés.
3. **Interface** : trois langues, pas quatre. Pas de sélecteur EN.
4. **Classifier** : normaliser (minuscules, `{...}` retirés, espaces réduits, `trim`) puis matcher sur le triplet ; niveau `critical` pour toute la famille ⚠️.
5. **Onboarding** : la langue du cabinet, pas celle du document — un cabinet bruxellois bilingue doit pouvoir choisir.
