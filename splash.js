/* =========================================================
   Pointeuse — animation de démarrage (3 s, touchez pour passer)
   Fichier autonome : il suffit de l'inclure dans index.html,
   juste après <body> :  <script src="./splash.js"></script>
   ========================================================= */
(function () {
  const DURATION = 3000; // 3 secondes : l'animation (dessinée sur 10 s) est jouée en accéléré
  const SPEED = 10000 / DURATION;

  // Une seule fois par ouverture de l'application (pas à chaque rechargement interne)
  try {
    if (sessionStorage.getItem('splashSeen') === '1') return;
    sessionStorage.setItem('splashSeen', '1');
  } catch (e) { /* stockage indisponible : on joue l'animation quand même */ }

  // Thème « Chat » choisi dans les Paramètres : le chat s'invite au démarrage
  let catTheme = false;
  try { catTheme = localStorage.getItem('appTheme') === 'chat'; } catch (e) { /* stockage indisponible */ }

  const css = `
  #pt-splash{position:fixed;inset:0;z-index:9999;overflow:hidden;cursor:pointer;
    background:radial-gradient(120% 90% at 50% 35%,#1e2a4a 0%,#0d1324 55%,#06080f 100%);
    color:#fff;font-family:'Inter',system-ui,sans-serif;-webkit-tap-highlight-color:transparent;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    transition:opacity .7s ease, transform .7s ease}
  #pt-splash.pt-out{opacity:0;transform:scale(1.06);pointer-events:none}
  #pt-splash .pt-cat{width:170px;max-width:46vw;margin:-10px 0 -18px;position:relative;z-index:1;
    opacity:0;transform:translateY(24px);animation:ptCat 1.4s .4s cubic-bezier(.2,1.4,.4,1) forwards}
  @keyframes ptCat{to{opacity:1;transform:none}}
  #pt-splash .pt-stars i{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;opacity:0;
    animation:ptTwinkle 3s ease-in-out infinite}
  @keyframes ptTwinkle{0%,100%{opacity:0}50%{opacity:.7}}

  /* --- Route qui se dessine (km) --- */
  #pt-splash .pt-road{position:absolute;left:0;right:0;bottom:9%;height:26%;opacity:.9}
  #pt-splash .pt-road path.pt-line{fill:none;stroke:url(#ptRoadGrad);stroke-width:3;stroke-linecap:round;
    stroke-dasharray:520;stroke-dashoffset:520;animation:ptDraw 6.5s 1.2s cubic-bezier(.6,.1,.3,1) forwards}
  #pt-splash .pt-road path.pt-dash{fill:none;stroke:rgba(255,255,255,.12);stroke-width:1;stroke-dasharray:6 10}
  @keyframes ptDraw{to{stroke-dashoffset:0}}
  #pt-splash .pt-pin{opacity:0;transform-box:fill-box;transform-origin:50% 100%}
  #pt-splash .pt-pin.p1{animation:ptPin .6s 1.1s ease-out forwards}
  #pt-splash .pt-pin.p2{animation:ptPin .6s 4.2s ease-out forwards}
  #pt-splash .pt-pin.p3{animation:ptPin .6s 5.4s ease-out forwards}
  #pt-splash .pt-pin.p4{animation:ptPin .6s 7.4s ease-out forwards}
  @keyframes ptPin{0%{opacity:0;transform:translateY(-14px) scale(.6)}70%{transform:translateY(2px) scale(1.08)}100%{opacity:1;transform:none}}
  #pt-splash .pt-car{offset-path:path('M 24 150 C 90 70, 140 185, 200 120 S 310 40, 376 104');
    offset-rotate:auto;animation:ptDrive 6.5s 1.2s cubic-bezier(.6,.1,.3,1) forwards;offset-distance:0%;opacity:0}
  @keyframes ptDrive{0%{offset-distance:0%;opacity:1}96%{opacity:1}100%{offset-distance:100%;opacity:0}}

  /* --- Horloge --- */
  #pt-splash .pt-clock{position:relative;width:150px;height:150px;margin-bottom:28px;
    animation:ptPop 1s .2s cubic-bezier(.2,1.4,.4,1) both}
  @keyframes ptPop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
  #pt-splash .pt-clock svg{width:100%;height:100%;overflow:visible}
  #pt-splash .pt-glow{position:absolute;inset:-30px;border-radius:50%;
    background:radial-gradient(circle,rgba(99,140,255,.45),transparent 65%);animation:ptPulse 2.4s ease-in-out infinite}
  @keyframes ptPulse{0%,100%{opacity:.5;transform:scale(.92)}50%{opacity:1;transform:scale(1.05)}}
  #pt-splash .pt-hand-m{transform-origin:75px 75px;animation:ptSpin 10s linear forwards}
  #pt-splash .pt-hand-h{transform-origin:75px 75px;animation:ptSpinH 10s linear forwards}
  @keyframes ptSpin{from{transform:rotate(0)}to{transform:rotate(1440deg)}}
  @keyframes ptSpinH{from{transform:rotate(-60deg)}to{transform:rotate(60deg)}}
  #pt-splash .pt-ring{fill:none;stroke:#7aa2ff;stroke-width:4;stroke-linecap:round;
    stroke-dasharray:440;stroke-dashoffset:440;transform:rotate(-90deg);transform-origin:75px 75px;
    animation:ptRing 10s linear forwards}
  @keyframes ptRing{to{stroke-dashoffset:0}}

  /* --- Titre --- */
  #pt-splash .pt-title{font-size:38px;font-weight:700;letter-spacing:.02em;display:flex}
  #pt-splash .pt-title span{opacity:0;transform:translateY(18px);display:inline-block;
    animation:ptLetter .6s cubic-bezier(.2,1.2,.4,1) forwards}
  @keyframes ptLetter{to{opacity:1;transform:none}}
  #pt-splash .pt-sub{margin-top:10px;font-size:15px;color:#9fb0d6;opacity:0;animation:ptFade .8s 2.4s forwards}
  @keyframes ptFade{to{opacity:1}}
  #pt-splash .pt-msg{margin-top:22px;height:22px;font-size:14px;color:#cfd9f5;font-weight:500}
  #pt-splash .pt-msg b{display:inline-block;animation:ptMsg .5s ease both}
  @keyframes ptMsg{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

  /* --- Bas : barre + indication --- */
  #pt-splash .pt-bottom{position:absolute;left:24px;right:24px;bottom:calc(28px + env(safe-area-inset-bottom));
    text-align:center}
  #pt-splash .pt-bar{height:3px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
  #pt-splash .pt-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5b7cff,#33ccff);
    animation:ptBar 10s linear forwards}
  @keyframes ptBar{to{width:100%}}
  #pt-splash .pt-skip{margin-top:12px;font-size:13px;color:#8796bb;animation:ptBlink 1.8s ease-in-out infinite}
  @keyframes ptBlink{0%,100%{opacity:.45}50%{opacity:1}}
  @media (prefers-reduced-motion: reduce){#pt-splash *{animation-duration:.01s!important;animation-delay:0s!important}}
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Graduations de l'horloge
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * 30) * Math.PI / 180, r1 = i % 3 ? 60 : 55, r2 = 66;
    ticks += `<line x1="${75 + r1 * Math.sin(a)}" y1="${75 - r1 * Math.cos(a)}" x2="${75 + r2 * Math.sin(a)}" y2="${75 - r2 * Math.cos(a)}" stroke="rgba(255,255,255,${i % 3 ? .35 : .9})" stroke-width="${i % 3 ? 2 : 3}" stroke-linecap="round"/>`;
  }
  const pin = (cls, x, y, c) => `<g transform="translate(${x - 10} ${y - 26})"><g class="pt-pin ${cls}">
      <path d="M10 0C4.5 0 0 4.4 0 9.8 0 17 10 26 10 26s10-9 10-16.2C20 4.4 15.5 0 10 0z" fill="${c}"/>
      <circle cx="10" cy="9.6" r="3.6" fill="#0d1324"/></g></g>`;
  const title = 'Pointeuse'.split('').map((l, i) => `<span style="animation-delay:${1.2 + i * .07}s">${l}</span>`).join('');

  const el = document.createElement('div');
  el.id = 'pt-splash';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', "Touchez pour passer l'animation");
  el.innerHTML = `
    <div class="pt-stars"></div>
    <svg class="pt-road" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="ptRoadGrad" x1="0" x2="1"><stop offset="0" stop-color="#5b7cff"/><stop offset="1" stop-color="#33ccff"/></linearGradient></defs>
      <path class="pt-dash" d="M 24 150 C 90 70, 140 185, 200 120 S 310 40, 376 104"/>
      <path class="pt-line" d="M 24 150 C 90 70, 140 185, 200 120 S 310 40, 376 104"/>
      ${pin('p1', 24, 150, '#ffb547')}${pin('p2', 200, 120, '#7aa2ff')}${pin('p4', 376, 104, '#3ddc97')}
      <g class="pt-car"><rect x="-11" y="-6" width="22" height="12" rx="4" fill="#fff"/><rect x="2" y="-4" width="6" height="8" rx="2" fill="#33ccff"/></g>
    </svg>
    <div class="pt-clock">
      <div class="pt-glow"></div>
      <svg viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="rgba(13,19,36,.85)" stroke="rgba(255,255,255,.15)" stroke-width="2"/>
        <circle class="pt-ring" cx="75" cy="75" r="70"/>
        ${ticks}
        <line class="pt-hand-h" x1="75" y1="75" x2="75" y2="42" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
        <line class="pt-hand-m" x1="75" y1="75" x2="75" y2="24" stroke="#33ccff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="75" cy="75" r="6" fill="#fff"/>
      </svg>
    </div>
    ${catTheme ? '<img class="pt-cat" src="./themes/chat/chat-coucou-jour.svg" alt="">' : ''}
    <div class="pt-title">${title}</div>
    <div class="pt-sub">Vos heures, vos chantiers, vos trajets.</div>
    <div class="pt-msg"><b>Préparation de votre journée…</b></div>
    <div class="pt-bottom"><div class="pt-bar"><i></i></div><div class="pt-skip">Touchez l'écran pour passer</div></div>`;

  // Étoiles
  const stars = el.querySelector('.pt-stars');
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 60 + '%';
    s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
    stars.appendChild(s);
  }

  // Messages qui défilent (avec la route : départ dépôt → chantiers → retour)
  const msgs = catTheme
    ? ['Le chat se réveille…', 'Il s\'étire', 'Il file vers les chantiers', 'Il compte les kilomètres', 'Retour au panier', 'Miaou, c\'est parti !']
    : ['Préparation de votre journée…', 'Départ du dépôt', 'En route vers les chantiers', 'Calcul des kilomètres', 'Retour au dépôt', "C'est parti !"];
  const msgEl = el.querySelector('.pt-msg');
  const timers = msgs.slice(1).map((m, i) => setTimeout(() => { msgEl.innerHTML = `<b>${m}</b>`; }, (1300 + i * 1800) / SPEED));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    clearTimeout(autoClose);
    el.classList.add('pt-out');
    setTimeout(() => { el.remove(); style.remove(); }, 750);
  }
  const autoClose = setTimeout(close, DURATION);
  el.addEventListener('pointerdown', close);
  el.addEventListener('keydown', close);

  // S'affiche immédiatement, avant même que l'application ne charge
  // Toutes les animations CSS jouées à la même vitesse accélérée
  const speedUp = () => { try { el.getAnimations({ subtree: true }).forEach((a) => { a.playbackRate = SPEED; }); } catch (e) { /* navigateur ancien : vitesse normale */ } };
  const show = () => { document.body.prepend(el); speedUp(); };
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
})();
