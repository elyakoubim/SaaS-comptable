import { createContext, useContext, useMemo, useState } from "react";
import { translations } from "./translations.js";

const LanguageContext = createContext(null);
const STORAGE_KEY = "vatu-lang";
const SUPPORTED = ["fr", "nl"];

// Preference stockee cote navigateur uniquement pour l'instant (pas encore de
// champ "langue" sur le cabinet en base) : chaque appareil/navigateur choisit
// la sienne. A remonter au niveau du cabinet si plusieurs collaborateurs
// veulent une langue partagee (cf. vatu/libelles-multilingues.md, point 5).
function detectDefaultLang() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) {
      return stored;
    }
  } catch (_error) {
    // localStorage indisponible (navigation privee stricte, etc.) - on retombe
    // sur la langue du navigateur.
  }
  const browserLang = String(navigator.language || "fr").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browserLang) ? browserLang : "fr";
}

function interpolate(template, vars) {
  // Certaines entrees du dictionnaire sont des tableaux (ex. listes de
  // fonctionnalites d'un plan) : pas de {{...}} a interpoler dedans, on les
  // renvoie telles quelles plutot que d'appeler .replace() sur un tableau.
  if (Array.isArray(template) || typeof template !== "string") {
    return template;
  }
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectDefaultLang);

  function setLang(next) {
    if (!SUPPORTED.includes(next)) {
      return;
    }
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (_error) {
      // Pas grave : la preference ne survivra pas a un rechargement.
    }
  }

  const t = useMemo(() => {
    const dict = translations[lang] || translations.fr;
    const fallbackDict = translations.fr;
    return (key, vars) => {
      const entry = dict[key] ?? fallbackDict[key];
      if (entry === undefined) {
        return key;
      }
      if (typeof entry === "function") {
        return entry(vars || {});
      }
      return interpolate(entry, vars);
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, supported: SUPPORTED }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage doit etre utilise a l'interieur de LanguageProvider");
  }
  return ctx;
}

export { LanguageProvider, useLanguage };
