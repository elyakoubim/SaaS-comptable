/** @type {import('tailwindcss').Config} */

/**
 * Thème Vatu — aligné sur le site public (vatu-site.vercel.app).
 *
 * Relevé sur le site plutôt que deviné : fond blanc, encre gray-900,
 * texte courant gray-600, un seul accent — l'emerald-600 #059669 des boutons —
 * et l'ambre pour la seconde série des graphiques. Cartes blanches à bordure
 * gray-200, rayon 12-16 px, ombre quasi nulle.
 *
 * Les noms de jetons (canvas, ink, accent…) sont inchangés : les classes déjà
 * écrites dans les pages continuent de fonctionner, elles pointent simplement
 * vers les bonnes couleurs. Seule la verrerie (blur, rounded-3xl, fonds
 * translucides) a dû être retirée à la main — le site n'en a pas.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#ffffff",
        ink: "#111827",
        muted: "#4b5563",
        line: "#e5e7eb",
        accent: "#059669",
        "accent-soft": "#ecfdf5",
        "accent-line": "#a7f3d0",
        "accent-strong": "#047857",
        ember: "#d97706",
        success: "#059669",
        warning: "#d97706",
        danger: "#dc2626"
      },
      fontFamily: {
        // Le site n'embarque aucune webfont : il s'appuie sur la pile système.
        // On fait pareil — même rendu, et une requête bloquante en moins.
        display: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        body: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        floating: "0 4px 16px rgba(17, 24, 39, 0.06), 0 1px 2px rgba(17, 24, 39, 0.04)"
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        rise: "rise 420ms ease-out"
      }
    }
  },
  plugins: []
};
