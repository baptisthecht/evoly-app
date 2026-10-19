/* Mesure d'audience et publicité du site vitrine (docs/TRACKING.md) : mêmes règles et mêmes cookies que l'application
   (domaine evoly.me), mode Consentement v2 de Google, rien sans accord. Aucun outil n'est chargé sans identifiant. */
(function () {
  var cfg = window.EVOLY_TRACKING || {};
  var T = {
    fr: {
      title: "Vos cookies",
      body: "Nous utilisons des cookies pour mesurer l’audience du site et l’efficacité de nos publicités. Vous choisissez : rien n’est déposé sans votre accord.",
      accept: "Tout accepter",
      refuse: "Tout refuser",
      customize: "Personnaliser",
      save: "Enregistrer mes choix",
      necessary: "Nécessaires",
      necessaryHint: "Connexion et sécurité : toujours actifs.",
      analytics: "Mesure d’audience",
      analyticsHint: "Google Analytics : pages vues et parcours, pour améliorer le site.",
      ads: "Publicité",
      adsHint: "Google Ads : mesurer les inscriptions venues de nos annonces.",
      policy: "Politique cookies",
      manage: "Gérer les cookies",
    },
    en: {
      title: "Your cookies",
      body: "We use cookies to measure site traffic and the effectiveness of our ads. You decide: nothing is stored without your consent.",
      accept: "Accept all",
      refuse: "Refuse all",
      customize: "Customise",
      save: "Save my choices",
      necessary: "Necessary",
      necessaryHint: "Sign-in and security: always on.",
      analytics: "Audience measurement",
      analyticsHint: "Google Analytics: pages viewed and journeys, to improve the site.",
      ads: "Advertising",
      adsHint: "Google Ads: measure sign-ups that come from our ads.",
      policy: "Cookie policy",
      manage: "Manage cookies",
    },
    nl: {
      title: "Uw cookies",
      body: "We gebruiken cookies om het bezoek aan de site en de doeltreffendheid van onze advertenties te meten. U kiest: niets wordt opgeslagen zonder uw toestemming.",
      accept: "Alles aanvaarden",
      refuse: "Alles weigeren",
      customize: "Aanpassen",
      save: "Mijn keuzes opslaan",
      necessary: "Noodzakelijk",
      necessaryHint: "Aanmelden en beveiliging: altijd actief.",
      analytics: "Bezoekersmeting",
      analyticsHint: "Google Analytics: bekeken pagina’s en trajecten, om de site te verbeteren.",
      ads: "Advertenties",
      adsHint: "Google Ads: inschrijvingen via onze advertenties meten.",
      policy: "Cookiebeleid",
      manage: "Cookies beheren",
    },
    de: {
      title: "Ihre Cookies",
      body: "Wir verwenden Cookies, um die Besucherzahlen der Website und die Wirksamkeit unserer Anzeigen zu messen. Sie entscheiden: Ohne Ihre Zustimmung wird nichts gespeichert.",
      accept: "Alle akzeptieren",
      refuse: "Alle ablehnen",
      customize: "Anpassen",
      save: "Auswahl speichern",
      necessary: "Notwendig",
      necessaryHint: "Anmeldung und Sicherheit: immer aktiv.",
      analytics: "Reichweitenmessung",
      analyticsHint: "Google Analytics: aufgerufene Seiten und Wege, um die Website zu verbessern.",
      ads: "Werbung",
      adsHint: "Google Ads: Anmeldungen über unsere Anzeigen messen.",
      policy: "Cookie-Richtlinie",
      manage: "Cookies verwalten",
    },
    es: {
      title: "Tus cookies",
      body: "Usamos cookies para medir la audiencia del sitio y la eficacia de nuestros anuncios. Tú decides: no se guarda nada sin tu consentimiento.",
      accept: "Aceptar todo",
      refuse: "Rechazar todo",
      customize: "Personalizar",
      save: "Guardar mis opciones",
      necessary: "Necesarias",
      necessaryHint: "Inicio de sesión y seguridad: siempre activas.",
      analytics: "Medición de audiencia",
      analyticsHint: "Google Analytics: páginas vistas y recorridos, para mejorar el sitio.",
      ads: "Publicidad",
      adsHint: "Google Ads: medir los registros que vienen de nuestros anuncios.",
      policy: "Política de cookies",
      manage: "Gestionar cookies",
    },
    it: {
      title: "I tuoi cookie",
      body: "Usiamo i cookie per misurare il pubblico del sito e l’efficacia dei nostri annunci. Decidi tu: niente viene salvato senza il tuo consenso.",
      accept: "Accetta tutto",
      refuse: "Rifiuta tutto",
      customize: "Personalizza",
      save: "Salva le mie scelte",
      necessary: "Necessari",
      necessaryHint: "Accesso e sicurezza: sempre attivi.",
      analytics: "Misurazione del pubblico",
      analyticsHint: "Google Analytics: pagine viste e percorsi, per migliorare il sito.",
      ads: "Pubblicità",
      adsHint: "Google Ads: misurare le iscrizioni provenienti dai nostri annunci.",
      policy: "Informativa sui cookie",
      manage: "Gestisci i cookie",
    },
    pt: {
      title: "Os seus cookies",
      body: "Usamos cookies para medir a audiência do site e a eficácia dos nossos anúncios. Você decide: nada é guardado sem o seu consentimento.",
      accept: "Aceitar tudo",
      refuse: "Recusar tudo",
      customize: "Personalizar",
      save: "Guardar as minhas escolhas",
      necessary: "Necessários",
      necessaryHint: "Início de sessão e segurança: sempre ativos.",
      analytics: "Medição de audiência",
      analyticsHint: "Google Analytics: páginas vistas e percursos, para melhorar o site.",
      ads: "Publicidade",
      adsHint: "Google Ads: medir as inscrições vindas dos nossos anúncios.",
      policy: "Política de cookies",
      manage: "Gerir cookies",
    },
  };
  var lang = (document.documentElement.lang || "fr").slice(0, 2);
  var t = T[lang] || T.fr;
  var base = (cfg.base || "evoly.me").split(":")[0];
  var host = location.hostname;
  var domain = host === base || host.slice(-base.length - 1) === "." + base ? "; Domain=." + base : "";
  function read(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? m[1] : null;
  }
  function write(n, v, age) {
    document.cookie = n + "=" + v + "; Max-Age=" + age + "; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "") + domain;
  }
  function consent() {
    try {
      var c = JSON.parse(decodeURIComponent(read("evoly_consent") || ""));
      return c && c.v === 1 ? c : null;
    } catch (e) {
      return null;
    }
  }
  function signals(c) {
    var a = c && c.analytics ? "granted" : "denied",
      d = c && c.ads ? "granted" : "denied";
    return { analytics_storage: a, ad_storage: d, ad_user_data: d, ad_personalization: d };
  }
  function clip(v, n) {
    v = (v || "").replace(/[\u0000-\u001f<>"'`]/g, "").trim();
    return v ? v.slice(0, n || 120) : null;
  }
  function source(c) {
    if (!c || (!c.analytics && !c.ads)) {
      if (read("evoly_src")) write("evoly_src", "", 0);
      return;
    }
    var cur = null;
    try {
      cur = JSON.parse(decodeURIComponent(read("evoly_src") || ""));
    } catch (e) {}
    if (cur && cur.source) {
      if (!c.ads && (cur.gclid || cur.gbraid || cur.wbraid)) {
        delete cur.gclid;
        delete cur.gbraid;
        delete cur.wbraid;
        write("evoly_src", encodeURIComponent(JSON.stringify(cur)), 7776000);
      }
      return;
    }
    var q = new URLSearchParams(location.search),
      ref = null;
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : null;
    } catch (e) {}
    if (ref && (ref === base || ref.slice(-base.length - 1) === "." + base)) ref = null;
    var gclid = clip(q.get("gclid"));
    var a = {
      source: clip(q.get("utm_source")) || (gclid ? "google" : ref || "direct"),
      medium:
        clip(q.get("utm_medium")) ||
        (gclid ? "cpc" : ref ? (/(^|\.)google\.|bing\.|duckduckgo\.|ecosia\.|qwant\./.test(ref) ? "organic" : "referral") : "none"),
      campaign: clip(q.get("utm_campaign")),
      term: clip(q.get("utm_term")),
      content: clip(q.get("utm_content")),
      referrer: ref,
      landing: clip(location.pathname, 200) || "/",
      firstAt: new Date().toISOString(),
    };
    if (c.ads)
      ["gclid", "gbraid", "wbraid"].forEach(function (k) {
        var v = clip(q.get(k));
        if (v) a[k] = v.replace(/[^\w-]/g, "");
      });
    write("evoly_src", encodeURIComponent(JSON.stringify(a)), 7776000);
  }
  var c0 = consent();
  // seulement sur evoly.me : jamais dans un aperçu local, pour ne pas fausser les statistiques
  var live = host === base || host.slice(-base.length - 1) === "." + base;
  if (live && (cfg.ga || cfg.ads)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    var d = signals(c0);
    d.wait_for_update = 500;
    gtag("consent", "default", d);
    gtag("set", "ads_data_redaction", true);
    gtag("set", "url_passthrough", true);
    gtag("js", new Date());
    if (cfg.ga) gtag("config", cfg.ga, { anonymize_ip: true });
    if (cfg.ads) gtag("config", cfg.ads);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga || cfg.ads);
    document.head.appendChild(s);
  }
  source(c0);
  function save(analytics, ads) {
    var c = { v: 1, analytics: analytics, ads: ads, at: new Date().toISOString() };
    write("evoly_consent", encodeURIComponent(JSON.stringify(c)), 31536000);
    if (window.gtag) gtag("consent", "update", signals(c));
    source(c);
    close();
  }
  var box = null;
  function close() {
    if (box) {
      box.remove();
      box = null;
    }
  }
  function open(custom) {
    close();
    var c = consent() || { analytics: false, ads: false };
    box = document.createElement("section");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-labelledby", "evoly-consent-title");
    box.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483000;max-width:560px;margin:0 auto;background:#FFFDF8;color:#222;border-radius:20px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.18);font:15px/1.45 system-ui,sans-serif";
    var b =
      "min-height:44px;border-radius:999px;padding:0 18px;border:1px solid #222;background:#fff;color:#222;font:600 14px system-ui,sans-serif;cursor:pointer";
    var row = function (id, label, hint, on, dis) {
      return (
        '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" id="' +
        id +
        '"' +
        (on ? " checked" : "") +
        (dis ? " disabled" : "") +
        ' style="margin-top:4px"><span><strong>' +
        label +
        "</strong> · " +
        hint +
        "</span></label>"
      );
    };
    box.innerHTML =
      '<h2 id="evoly-consent-title" style="margin:0 0 6px;font-size:18px">' +
      t.title +
      '</h2><p style="margin:0 0 10px;color:#555">' +
      t.body +
      ' <a href="/cookies/" style="color:inherit">' +
      t.policy +
      "</a></p>" +
      (custom
        ? row("evoly-c-n", t.necessary, t.necessaryHint, true, true) +
          row("evoly-c-a", t.analytics, t.analyticsHint, c.analytics) +
          row("evoly-c-d", t.ads, t.adsHint, c.ads)
        : "") +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button type="button" data-a="refuse" style="' +
      b +
      '">' +
      t.refuse +
      '</button><button type="button" data-a="' +
      (custom ? "save" : "custom") +
      '" style="' +
      b +
      '">' +
      (custom ? t.save : t.customize) +
      '</button><button type="button" data-a="accept" style="' +
      b +
      '">' +
      t.accept +
      "</button></div>";
    box.addEventListener("click", function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "refuse") save(false, false);
      else if (a === "accept") save(true, true);
      else if (a === "custom") open(true);
      else if (a === "save") save(document.getElementById("evoly-c-a").checked, document.getElementById("evoly-c-d").checked);
    });
    document.body.appendChild(box);
  }
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("a[href]");
    if (el && /\/register|\/inscription/.test(el.getAttribute("href") || "") && window.gtag) gtag("event", "sign_up_start", { link_url: el.href });
    if (e.target && e.target.closest && e.target.closest("[data-evoly-cookies]")) {
      e.preventDefault();
      open(true);
    }
  });
  function init() {
    var nav = document.querySelector(".footer__nav");
    if (nav && !nav.querySelector("[data-evoly-cookies]")) {
      var l = document.createElement("a");
      l.href = "#";
      l.setAttribute("data-evoly-cookies", "");
      l.textContent = t.manage;
      nav.appendChild(l);
    }
    if (!c0) open(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
