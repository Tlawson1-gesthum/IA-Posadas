// Burbuja de chat de un agente de la agencia, para pegar en la web del cliente:
//   <script src="https://ia-posadas.vercel.app/widget.js" data-ficha="morfa" defer></script>
// Opcional: data-ocultar-en="#/cocina,#/panel" (no se muestra en esas rutas).
// Si el chat está apagado desde la central, no dibuja nada.
(function () {
  var script = document.currentScript;
  if (!script || window.__burbujaAgente) return;
  window.__burbujaAgente = true;
  var ficha = (script.getAttribute("data-ficha") || "").replace(/[^a-z0-9-]/g, "");
  var ocultarEn = (script.getAttribute("data-ocultar-en") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var origen = new URL(script.src).origin;
  if (!ficha) return;

  fetch(origen + "/api/chat?config=" + ficha)
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (cfg && cfg.activo) dibujar(cfg); })
    .catch(function () {});

  function dibujar(cfg) {
    var color = /^#[0-9a-f]{3,8}$/i.test(cfg.color || "") ? cfg.color : "#2563eb";
    var css = document.createElement("style");
    css.textContent =
      ".ba-boton{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;" +
      "background:" + color + ";color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.28);display:grid;place-items:center;transition:transform .15s}" +
      ".ba-boton:hover{transform:scale(1.06)}.ba-boton svg{width:30px;height:30px}" +
      ".ba-globo{position:fixed;right:88px;bottom:30px;z-index:2147483000;background:#fff;color:#111;font:14px/1.35 system-ui,sans-serif;" +
      "padding:10px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:230px;cursor:pointer}" +
      ".ba-globo b{display:block;margin-bottom:2px}.ba-globo .x{position:absolute;top:2px;right:6px;border:0;background:none;color:#999;cursor:pointer;font-size:16px}" +
      ".ba-ventana{position:fixed;right:18px;bottom:90px;z-index:2147483001;width:min(380px,calc(100vw - 24px));height:min(600px,calc(100vh - 120px));" +
      "border:0;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35);background:#fff;display:none}" +
      ".ba-ventana.abierta{display:block}" +
      "@media (max-width:520px){.ba-ventana{right:0;bottom:0;width:100vw;height:100dvh;border-radius:0}.ba-ventana.abierta~.ba-boton{display:none}}" +
      ".ba-oculto{display:none!important}";
    document.head.appendChild(css);

    var ventana = document.createElement("iframe");
    ventana.className = "ba-ventana";
    ventana.title = "Chat con " + cfg.agente;
    ventana.setAttribute("allow", "geolocation");
    var boton = document.createElement("button");
    boton.className = "ba-boton";
    boton.setAttribute("aria-label", "Chatear con " + cfg.agente);
    boton.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 4.9 3.4 6.5L4.6 22l4.3-2.2c1 .3 2 .4 3.1.4 5.5 0 10-3.9 10-8.7S17.5 3 12 3z"/></svg>';
    var globo = document.createElement("div");
    globo.className = "ba-globo ba-oculto";
    globo.innerHTML = '<button class="x" aria-label="Cerrar">&times;</button><b></b><span></span>';
    globo.querySelector("b").textContent = cfg.agente;
    globo.querySelector("span").textContent = cfg.saludo || "\u00bfTe ayudo con algo?";
    document.body.appendChild(ventana);
    document.body.appendChild(boton);
    document.body.appendChild(globo);

    var abierta = false;
    function alternar(abrir) {
      abierta = abrir;
      if (abrir && !ventana.src) ventana.src = origen + "/widget.html?ficha=" + ficha;
      ventana.classList.toggle("abierta", abrir);
      globo.classList.add("ba-oculto");
      try { sessionStorage.setItem("ba-globo-visto", "1"); } catch (e) {}
    }
    boton.onclick = function () { alternar(!abierta); };
    globo.onclick = function (e) { if (e.target.classList.contains("x")) { globo.classList.add("ba-oculto"); try { sessionStorage.setItem("ba-globo-visto", "1"); } catch (er) {} } else alternar(true); };
    window.addEventListener("message", function (e) { if (e.origin === origen && e.data === "ba-cerrar") alternar(false); });

    function segunRuta() {
      var oculto = ocultarEn.some(function (r) { return location.hash.indexOf(r) === 0 || location.pathname.indexOf(r) === 0; });
      [boton, ventana].forEach(function (el) { el.classList.toggle("ba-oculto", oculto); });
      if (oculto) globo.classList.add("ba-oculto");
    }
    window.addEventListener("hashchange", segunRuta);
    segunRuta();

    var visto = false;
    try { visto = sessionStorage.getItem("ba-globo-visto") === "1"; } catch (e) {}
    if (!visto) setTimeout(function () { if (!abierta && !boton.classList.contains("ba-oculto")) globo.classList.remove("ba-oculto"); }, 6000);
  }
})();
