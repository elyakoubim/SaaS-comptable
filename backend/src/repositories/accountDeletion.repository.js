import { db } from "../config/db.js";

/**
 * Suppression RGPD complete d'un cabinet (decision produit du 28/09/2026) :
 * quand le owner supprime son compte, c'est tout le cabinet qui disparait -
 * mandats, documents, alertes, abonnement - pas seulement sa ligne
 * `accountants`. Un cabinet est l'unite de propriete (cf. schema.sql,
 * migration multi-utilisateurs du 24/09/2026) ; le laisser orphelin de son
 * seul owner sans le nettoyer serait pire qu'une suppression complete.
 *
 * L'annulation Stripe se fait AVANT l'appel (cf. auth.routes.js) : cette
 * fonction ne fait que la partie base de donnees, dans une seule transaction
 * pour ne jamais laisser le cabinet a moitie supprime si une etape echoue.
 *
 * Ordre de suppression = ordre des contraintes de cle etrangere (pas de
 * ON DELETE CASCADE dans le schema) : les tables qui referencent
 * mandant_ecb d'abord, puis mandants, puis les tokens qui referencent
 * accountant_id, puis accountants, puis cabinets.
 */
async function deleteCabinetCascade(cabinetId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const mandants = await client.query(
      `SELECT ecb_number FROM mandants WHERE cabinet_id = $1::uuid`,
      [cabinetId]
    );
    const ecbNumbers = mandants.rows.map((row) => row.ecb_number);

    if (ecbNumbers.length > 0) {
      await client.query(`DELETE FROM alerts WHERE mandant_ecb::text = ANY($1::text[])`, [ecbNumbers]);
      await client.query(`DELETE FROM sync_runs WHERE mandant_ecb::text = ANY($1::text[])`, [ecbNumbers]);
      await client.query(`DELETE FROM token_events WHERE mandant_ecb::text = ANY($1::text[])`, [ecbNumbers]);
      await client.query(`DELETE FROM vat_period_aggregates WHERE mandant_ecb::text = ANY($1::text[])`, [ecbNumbers]);
      await client.query(`DELETE FROM documents WHERE mandant_ecb::text = ANY($1::text[])`, [ecbNumbers]);
    }

    await client.query(`DELETE FROM mandants WHERE cabinet_id = $1::uuid`, [cabinetId]);

    const accountants = await client.query(
      `SELECT id FROM accountants WHERE cabinet_id = $1::uuid`,
      [cabinetId]
    );
    const accountantIds = accountants.rows.map((row) => row.id);

    if (accountantIds.length > 0) {
      await client.query(
        `DELETE FROM password_reset_tokens WHERE accountant_id::text = ANY($1::text[])`,
        [accountantIds]
      );
      await client.query(
        `DELETE FROM email_verification_tokens WHERE accountant_id::text = ANY($1::text[])`,
        [accountantIds]
      );
    }

    await client.query(`DELETE FROM cabinet_invitations WHERE cabinet_id = $1::uuid`, [cabinetId]);
    await client.query(`DELETE FROM accountants WHERE cabinet_id = $1::uuid`, [cabinetId]);
    await client.query(`DELETE FROM cabinets WHERE id = $1::uuid`, [cabinetId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Suppression du seul compte d'un membre (pas owner) : le cabinet et ses
 * mandats restent intacts pour le reste de l'equipe.
 *
 * Refuse si ce comptable est enregistre comme `accountant_id` d'un mandat
 * (celui qui a donne le consentement MyMinfin, cf. schema.sql) : la colonne
 * est NOT NULL, on ne peut ni la mettre a NULL ni la supprimer sans casser
 * la tracabilite du consentement. Cas suppose rare (l'invite qui connecte un
 * mandat devient generalement owner ou reste actif) ; a traiter au cas par
 * cas plutot que de deviner un transfert automatique.
 */
async function deleteMemberAccount(accountantId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const ownedMandant = await client.query(
      `SELECT ecb_number FROM mandants WHERE accountant_id = $1::uuid LIMIT 1`,
      [accountantId]
    );
    if (ownedMandant.rowCount > 0) {
      const error = new Error(
        "Ce compte a connecte un ou plusieurs mandats : contactez le support pour les transferer avant de supprimer le compte."
      );
      error.code = "MANDANT_OWNER";
      throw error;
    }

    // Anonymisation plutot que blocage : un acquittement d'alerte n'est pas
    // une donnee qu'il faut absolument garder attribuee a la personne partie.
    await client.query(`UPDATE alerts SET acknowledged_by = NULL WHERE acknowledged_by = $1::uuid`, [accountantId]);
    await client.query(`DELETE FROM cabinet_invitations WHERE created_by = $1::uuid`, [accountantId]);
    await client.query(`DELETE FROM password_reset_tokens WHERE accountant_id = $1::uuid`, [accountantId]);
    await client.query(`DELETE FROM email_verification_tokens WHERE accountant_id = $1::uuid`, [accountantId]);
    await client.query(`DELETE FROM accountants WHERE id = $1::uuid`, [accountantId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export { deleteCabinetCascade, deleteMemberAccount };
