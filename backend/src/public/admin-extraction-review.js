// Script externe (et non inline) volontairement : la CSP posée par helmet()
// sur toute l'app (script-src 'self', cf. app.js) bloque silencieusement tout
// <script> inline - un fichier servi depuis la meme origine reste autorise.
window.addEventListener("error", (e) => {
  const pre = document.createElement("pre");
  pre.style.cssText = "position:fixed;top:0;left:0;right:0;background:#fbdadb;color:#7a1a1a;padding:12px;z-index:9999;white-space:pre-wrap;font-size:12px;margin:0;";
  pre.textContent = "Erreur JS : " + e.message + "\n" + (e.error && e.error.stack ? e.error.stack : "");
  document.body.prepend(pre);
});

(function () {
  let secret = sessionStorage.getItem("vatu_admin_secret") || "";
  let showAll = false;

  const gateEl = document.getElementById("gate");
  const appEl = document.getElementById("app");
  const gateForm = document.getElementById("gate-form");
  const gateInput = document.getElementById("gate-input");
  const gateError = document.getElementById("gate-error");

  function showGate(message) {
    gateError.textContent = message || "";
    gateEl.style.display = "block";
    appEl.style.display = "none";
    gateInput.value = "";
    gateInput.focus();
  }

  function showApp() {
    gateEl.style.display = "none";
    appEl.style.display = "block";
  }

  gateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = gateInput.value.trim();
    if (!value) return;
    secret = value;
    sessionStorage.setItem("vatu_admin_secret", secret);
    showApp();
    loadList();
  });

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), "X-Admin-Secret": secret, "Content-Type": "application/json" }
    });
    if (res.status === 401) {
      sessionStorage.removeItem("vatu_admin_secret");
      secret = "";
      showGate("Code invalide, réessayez.");
      throw new Error("Code invalide");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || ("Erreur " + res.status));
    }
    return res.json();
  }

  function fieldRow(label, value, current) {
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML =
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + (value == null ? "<em>null</em>" : escapeHtml(String(value))) + '</div>' +
      '<div class="choice"></div>';
    const choice = row.querySelector(".choice");
    const yes = document.createElement("button");
    yes.type = "button";
    yes.textContent = "Correct";
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "Faux";
    function refresh() {
      yes.className = current.value === true ? "active-yes" : "";
      no.className = current.value === false ? "active-no" : "";
    }
    yes.onclick = () => { current.value = true; refresh(); };
    no.onclick = () => { current.value = false; refresh(); };
    refresh();
    choice.appendChild(yes);
    choice.appendChild(no);
    return row;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderCard(item) {
    const card = document.createElement("div");
    card.className = "card" + (item.verification ? " verified" : "");

    const left = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML =
      "<strong>" + escapeHtml(item.companyName || item.mandantEcb) + "</strong> · " +
      escapeHtml(item.category || "?") + "<br/>" +
      escapeHtml(item.title || "");
    left.appendChild(meta);

    const state = {
      montant: { value: item.verification ? item.verification.montantCorrect : null },
      date: { value: item.verification ? item.verification.dateCorrect : null },
      reference: { value: item.verification ? item.verification.referenceCorrect : null }
    };

    left.appendChild(fieldRow("Montant", item.extraction.montant, state.montant));
    left.appendChild(fieldRow("Échéance", item.extraction.dateEcheance, state.date));
    left.appendChild(fieldRow("Référence", item.extraction.reference, state.reference));

    const accrocheRow = document.createElement("div");
    accrocheRow.className = "field-row";
    accrocheRow.innerHTML = '<div class="label">Accroche</div><div class="value">' + escapeHtml(item.extraction.accroche || "") + "</div>";
    left.appendChild(accrocheRow);

    const saveBtn = document.createElement("button");
    saveBtn.className = "save-btn";
    saveBtn.textContent = item.verification ? "Mettre à jour" : "Enregistrer la vérification";
    saveBtn.onclick = async () => {
      try {
        await api("/api/admin/extraction-review/" + item.id + "/verify", {
          method: "POST",
          body: JSON.stringify({
            montantCorrect: state.montant.value,
            dateCorrect: state.date.value,
            referenceCorrect: state.reference.value,
            verifiedBy: "Mohamed"
          })
        });
        card.classList.add("verified");
        saveBtn.textContent = "Enregistré ✓";
      } catch (err) {
        alert("Erreur: " + err.message);
      }
    };
    left.appendChild(saveBtn);

    const right = document.createElement("div");
    const iframe = document.createElement("iframe");
    iframe.src = "/api/admin/extraction-review/" + item.id + "/document?secret=" + encodeURIComponent(secret);
    right.appendChild(iframe);

    card.appendChild(left);
    card.appendChild(right);
    return card;
  }

  async function loadList() {
    const listEl = document.getElementById("list");
    listEl.innerHTML = '<div id="empty">Chargement...</div>';
    try {
      const data = await api("/api/admin/extraction-review?limit=50" + (showAll ? "&all=true" : ""));
      if (!data.items.length) {
        listEl.innerHTML = '<div id="empty">Aucune extraction ' + (showAll ? "" : "en attente de vérification") + ".</div>";
        return;
      }
      listEl.innerHTML = "";
      data.items.forEach((item) => listEl.appendChild(renderCard(item)));
    } catch (err) {
      if (appEl.style.display !== "none") {
        listEl.innerHTML = '<div id="empty">Erreur : ' + escapeHtml(err.message) + "</div>";
      }
    }
  }

  async function loadStats() {
    const panel = document.getElementById("stats-panel");
    try {
      const data = await api("/api/admin/extraction-review/stats");
      let html = "<table><thead><tr><th>Catégorie</th><th>Vérifiées</th><th>Montant</th><th>Échéance</th><th>Référence</th></tr></thead><tbody>";
      data.items.forEach((row) => {
        html +=
          "<tr><td>" + escapeHtml(row.category || "?") + "</td><td>" + row.verifiedCount + "</td>" +
          "<td>" + (row.montant.accuracyPercent == null ? "-" : row.montant.accuracyPercent + "% (" + row.montant.correct + "/" + (row.montant.correct + row.montant.incorrect) + ")") + "</td>" +
          "<td>" + (row.dateEcheance.accuracyPercent == null ? "-" : row.dateEcheance.accuracyPercent + "% (" + row.dateEcheance.correct + "/" + (row.dateEcheance.correct + row.dateEcheance.incorrect) + ")") + "</td>" +
          "<td>" + (row.reference.accuracyPercent == null ? "-" : row.reference.accuracyPercent + "% (" + row.reference.correct + "/" + (row.reference.correct + row.reference.incorrect) + ")") + "</td></tr>";
      });
      html += "</tbody></table>";
      panel.innerHTML = html;
      panel.style.display = panel.style.display === "block" ? "none" : "block";
    } catch (err) {
      if (appEl.style.display !== "none") {
        panel.innerHTML = "Erreur : " + escapeHtml(err.message);
        panel.style.display = "block";
      }
    }
  }

  document.getElementById("btn-stats").onclick = loadStats;
  document.getElementById("btn-toggle-all").onclick = () => {
    showAll = !showAll;
    document.getElementById("btn-toggle-all").textContent = showAll ? "Voir seulement en attente" : "Voir tout (y compris déjà vérifié)";
    loadList();
  };

  if (secret) {
    showApp();
    loadList();
  } else {
    showGate();
  }
})();
