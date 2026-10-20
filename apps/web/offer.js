/* Offre en cours, gérée dans l'administration de l'application (docs/OFFRES.md) : bandeau, encadré Pro et boutons
   remplis si une offre tourne, dans la langue de la page ; sinon les textes habituels restent. Le code de campagne
   (?offre=CODE) suit le visiteur vers l'application. Aucun cookie, aucune donnée personnelle. */
(function () {
  var cfg = window.EVOLY_TRACKING || {};
  var app = (cfg.app || "https://app.evoly.me").replace(/\/$/, "");
  var lang = (document.documentElement.lang || "fr").slice(0, 2);
  var code = (new URLSearchParams(location.search).get("offre") || "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(code)) code = "";
  function apply(o) {
    var banner = document.querySelector("[data-evoly-offer]");
    if (banner && o.banner) {
      banner.textContent = o.banner;
      banner.hidden = false;
    }
    var short = document.querySelector(".plan--pro .plan__sub");
    if (short && o.short) short.textContent = o.short;
    if (o.cta)
      document.querySelectorAll('a[href*="plan=pro"]').forEach(function (a) {
        a.textContent = o.cta;
      });
  }
  if (code)
    document.querySelectorAll('a[href^="' + app + '"]').forEach(function (a) {
      if (a.href.indexOf("offre=") < 0) a.href += (a.href.indexOf("?") < 0 ? "?" : "&") + "offre=" + encodeURIComponent(code);
    });
  if (!window.fetch) return;
  fetch(app + "/api/public/offer?lang=" + lang + (code ? "&offre=" + encodeURIComponent(code) : ""), { credentials: "omit" })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      if (d && d.offer) apply(d.offer);
    })
    .catch(function () {});
})();
