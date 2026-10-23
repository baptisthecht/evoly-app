/*
 * Evoly : billetterie intégrable (section 9.26).
 * Bouton : <a href="ADRESSE_DE_LA_PAGE_DE_VENTE" data-evoly-button>Réserver</a>
 * Module : <div data-evoly-module="IDENTIFIANT_DE_L_EVENEMENT"></div>
 * L'achat s'ouvre dans une fenêtre posée sur votre site : tous les moyens de paiement y fonctionnent.
 */
(function () {
  var script = document.currentScript;
  var base = script ? new URL(script.src).origin : "https://app.evoly.me";
  var popups = [];
  // RG-EMB-07 : événements pour le site de l'organisateur, sans aucune donnée personnelle
  function emit(data) {
    if (!data || typeof data !== "object") return;
    if (data.type === "evoly:open")
      window.dispatchEvent(new CustomEvent("evoly:open"));
    if (data.type === "evoly:order_completed") {
      var tickets = Math.max(0, Math.floor(Number(data.tickets) || 0));
      var amountMinor = Math.max(0, Math.floor(Number(data.amountMinor) || 0));
      var currency = /^[A-Z]{3}$/.test(String(data.currency))
        ? String(data.currency)
        : "";
      window.dispatchEvent(
        new CustomEvent("evoly:order_completed", {
          detail: {
            tickets: tickets,
            amountMinor: amountMinor,
            currency: currency,
          },
        }),
      );
    }
  }
  function popup(url) {
    var w = Math.min(480, screen.availWidth || 480);
    var h = Math.min(820, screen.availHeight || 820);
    var left = Math.max(0, ((screen.availWidth || w) - w) / 2);
    var top = Math.max(0, ((screen.availHeight || h) - h) / 2);
    var win = window.open(
      url,
      "evoly-billetterie",
      "popup=yes,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top,
    );
    if (win) popups.push(win);
    else window.location.href = url; // fenêtre bloquée : la page de vente s'ouvre à la place
    emit({ type: "evoly:open" });
  }
  function init() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-evoly-button]"),
      function (el) {
        if (el.getAttribute("data-evoly-ready")) return;
        el.setAttribute("data-evoly-ready", "1");
        el.addEventListener("click", function (e) {
          var url =
            el.getAttribute("data-evoly-button") || el.getAttribute("href");
          if (!url) return;
          e.preventDefault();
          popup(url);
        });
      },
    );
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-evoly-module]"),
      function (el) {
        if (el.getAttribute("data-evoly-ready")) return;
        var id = el.getAttribute("data-evoly-module") || "";
        if (!/^[a-z0-9]{10,40}$/i.test(id)) return;
        el.setAttribute("data-evoly-ready", "1");
        var lang = (
          el.getAttribute("data-lang") ||
          document.documentElement.lang ||
          ""
        ).slice(0, 2);
        var frame = document.createElement("iframe");
        frame.src =
          base +
          "/integre/" +
          id +
          (lang ? "?lang=" + encodeURIComponent(lang) : "");
        frame.title = el.getAttribute("data-title") || "Billetterie";
        frame.loading = "lazy";
        frame.setAttribute("data-evoly-frame", id);
        frame.style.cssText =
          "width:100%;border:0;min-height:280px;display:block;color-scheme:normal";
        el.appendChild(frame);
      },
    );
  }
  window.addEventListener("message", function (e) {
    if (!e.data || typeof e.data !== "object") return;
    if (popups.indexOf(e.source) !== -1) return emit(e.data); // fenêtre d'achat ouverte par un bouton
    if (e.origin !== base) return;
    if (e.data.type !== "evoly:height") return emit(e.data); // relayé par un module
    Array.prototype.forEach.call(
      document.querySelectorAll("iframe[data-evoly-frame]"),
      function (frame) {
        if (frame.contentWindow === e.source)
          frame.style.height =
            Math.min(4000, Math.max(200, Number(e.data.height) || 0)) + "px";
      },
    );
  });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
