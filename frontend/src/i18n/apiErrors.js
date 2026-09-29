// L'API renvoie parfois des messages bruts en anglais (validation Express
// historique) et parfois en francais (regles metier ajoutees plus tard) -
// jamais en neerlandais, et jamais choisis en fonction de la langue de
// l'interface. Plutot que d'afficher ce texte brut/incoherent, on le traduit
// ici vers un message propre dans la langue active ; tout message qu'on ne
// reconnait pas retombe sur le message generique de l'ecran (fallbackKey)
// plutot que d'exposer le texte serveur tel quel.
const KNOWN_ERROR_KEYS = {
  "email, password and fullname are required": "register.errorMissingFields",
  "an account already exists for this email": "register.errorAccountExists",
  "invitation invalide ou deja utilisee": "register.errorInvitationInvalid",
  "email and password are required": "login.errorMissingFields",
  "invalid credentials": "login.errorInvalidCredentials",
  "email is required": "forgot.errorMissingEmail",
  "token and password are required": "reset.errorMissingToken",
  "lien de reinitialisation invalide ou expire": "reset.errorLinkExpired",
  "token is required": "verify.errorMissingToken",
  "lien de verification invalide ou expire": "verify.errorLinkExpired",
  "compte introuvable": "login.errorAccountNotFound",
  "password is required": "billing.danger.errorMissingPassword",
  "mot de passe incorrect": "billing.danger.errorWrongPassword",
  "database unavailable": "app.serviceUnavailable"
};

function normalize(message) {
  return String(message || "")
    .trim()
    .toLowerCase();
}

// t: la fonction de traduction du contexte de langue actif.
// fallbackKey: cle a utiliser si le message ne correspond a rien de connu.
function translateApiError(rawMessage, t, fallbackKey) {
  const key = KNOWN_ERROR_KEYS[normalize(rawMessage)];
  return t(key || fallbackKey);
}

export { translateApiError };
