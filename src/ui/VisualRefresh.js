/** Night Shift art direction. Installed after the legacy UI layers. */
const CSS = `
body.night-shift { --glass:rgba(5,15,24,.88); --muted:#a7bfcb; --line:rgba(155,216,240,.16); --line-2:rgba(155,216,240,.3); --skew:-4deg; }
.night-shift .screen::after { opacity:.25; }
.night-shift .screen.dim { background:radial-gradient(ellipse at 72% 10%,#06344b66,transparent 60%),linear-gradient(130deg,#030910dc,#030810b8); }
.night-shift #screen-title { padding-top:40px; padding-bottom:84px; }
.night-shift .title-col { width:min(490px,100%); gap:15px; }
.night-shift .tf-grad { background:linear-gradient(90deg,#02080ff5 0%,#02080fd9 29%,#02080f55 58%,transparent 82%),linear-gradient(0deg,#02080f 0%,transparent 32%); }
.night-shift .tf-scan { background:radial-gradient(ellipse at 75% 30%,#1bdfff0d,transparent 55%); }
.night-shift .tf-scan::before { content:''; position:absolute; width:56vw; height:56vw; right:-15vw; top:-20vw; border:1px solid #70ddff25; border-radius:50%; box-shadow:0 0 0 32px #00e5ff04,0 0 0 120px #00e5ff03; }
.night-shift .tf-scan::after { content:''; position:absolute; inset:0; background:linear-gradient(120deg,transparent 60%,#00e5ff08 60.1%,transparent 60.2%); }
.night-shift .eyebrow-line { font-size:10px; letter-spacing:.24em; color:#bbd7e2; }
.night-shift .dot-live { background:#70ffd0; box-shadow:0 0 12px #70ffd0; }
.night-shift .logo { line-height:.88; transform:skewX(-5deg); }
.night-shift .logo-a { color:#edfbff; -webkit-text-stroke:0; font-size:clamp(52px,7.8vw,102px); letter-spacing:.015em; text-shadow:0 4px 24px #00e5ff25; }
.night-shift .logo-a::after { display:none; }
.night-shift .logo-b { font-size:clamp(64px,9.8vw,130px); background:linear-gradient(180deg,#e2fbff,#50e5ff 60%,#008cb4)!important; -webkit-background-clip:text!important; background-clip:text!important; filter:drop-shadow(0 5px 0 #002b3b)!important; }
.night-shift .logo-rule { margin-top:14px; }.night-shift .logo-rule b { border-color:#00e5ff40; color:#a9dcea; font-size:9px; letter-spacing:.15em; padding:4px 8px; }
.night-shift .logo-rule i { height:1px; box-shadow:none; }
.night-shift .menu { gap:8px; }
.night-shift #title-menu .mbtn { padding:12px 20px; min-height:62px; font-size:15px; }
.night-shift #title-menu .mbtn::before { border-radius:10px; background:linear-gradient(110deg,#0c202bda,#07121bc2); border-color:#a4dfff1c; transform:none; }
.night-shift #title-menu .mbtn:hover::before,.night-shift #title-menu .mbtn.sel::before,.night-shift #title-menu .mbtn:focus-visible::before { background:linear-gradient(110deg,#123448,#081a27)!important; border-color:#69e1ff9c!important; transform:none; box-shadow:0 6px 24px #0005!important; }
.night-shift #title-menu .mbtn[data-action="play"] { color:#02141d; }
.night-shift #title-menu .mbtn[data-action="play"]::before { background:linear-gradient(110deg,#b3f9ff,#36d8f4)!important; border-color:#c0faff!important; box-shadow:0 6px 32px #00e5ff20!important; }
.night-shift #title-menu .mbtn[data-action="play"] .mbtn-k,.night-shift #title-menu .mbtn[data-action="play"] small { color:#174957; }
.night-shift #title-menu .mbtn[data-action="play"] .mbtn-t { color:#02141d!important; text-shadow:none!important; }
.night-shift #title-menu .mbtn-go { opacity:.65; width:8px; height:8px; }
.night-shift #title-menu .mbtn-t small { font-size:11px; font-weight:400; }
.night-shift #title-menu .mbtn::after { display:none; }
.night-shift .new-banner.cu-banner { margin:2px 0; padding:9px 12px; border:1px solid #ffb56b40; border-radius:8px; background:#23190d85; box-shadow:none; animation:none; }
.night-shift .new-banner::after { display:none; }.night-shift .new-banner.cu-banner .nb-tag { color:#ffcb8c; background:#ffb34715; font-size:9px; }
.night-shift .nb-t { font-size:12px; }.night-shift .nb-t small { font-size:10px; color:#b5c1c8; }
.night-shift .pr-panel { background:linear-gradient(135deg,#071722f0,#040c14e8); border:1px solid #99dfff24; border-top:2px solid #ffb56b; border-left:1px solid #99dfff24; border-radius:16px; box-shadow:0 24px 80px #0006; }
.night-shift .pr-mission { border-radius:8px; background:#ffffff04; }
.night-shift .title-badge { gap:4px; }.night-shift .badge-row::before { transform:none; border-radius:8px; background:#06121bd9; border:1px solid #92dfff20; box-shadow:none; }
.night-shift .badge-row { padding:10px 18px; font-size:8px; }.night-shift .badge-row b { font-size:25px; color:#b9efff; }
.night-shift .title-bar { height:42px; background:#02090ee8; border-color:#89dfff1a; }.night-shift .tb-ver { color:#94b9c8; font-size:9px; }
.night-shift .panel { clip-path:none; border-radius:18px; border-color:#a4dfff2b!important; background:linear-gradient(140deg,#0b202ef5,#040c15f5)!important; background-size:auto!important; box-shadow:0 30px 100px #0008!important; }
.night-shift .panel::before { width:100px; left:26px; background:linear-gradient(90deg,#7aebff,transparent); height:1px; box-shadow:none; }.night-shift .panel::after { display:none; }
.night-shift .panel-head { border-color:#a4dfff1a; }.night-shift .kicker { font-size:9px; color:#ffc288; }.night-shift h2 { letter-spacing:-.02em; }
.night-shift .card { border-radius:12px; background:linear-gradient(145deg,#142a3766,#06111aa3); border-color:#91d9ff1c; transition:border-color .18s,background .18s,box-shadow .18s; }
.night-shift .card:hover { border-color:#9feaff70; background:#12304080; }
.night-shift .card.on { background:linear-gradient(140deg,#16394ce0,#07141ee0); border-color:var(--acc,#62e7ff); box-shadow:inset 0 2px 0 var(--acc,#62e7ff),0 8px 24px #0004!important; }
.night-shift .card .card-t { font-size:13px; }.night-shift .card .card-d { color:#aac3d0; line-height:1.45; }
.night-shift .track-card canvas { background:radial-gradient(ellipse at center,color-mix(in srgb,var(--acc,#00e5ff) 12%,transparent),transparent 80%); margin:10px 0; }
.night-shift .tc-n { color:#d9f7ff; font-size:15px; }.night-shift .card .rec { font-size:9px; }
.night-shift .seg,.night-shift .stepper { background:#020b12aa; border-color:#91d9ff20; border-radius:9px; }.night-shift .seg button { border-radius:6px; }
.night-shift .seg button.on { background:#8ceeff; box-shadow:0 2px 12px #00e5ff18!important; }
.night-shift .btn::before { border-radius:8px; transform:none; }.night-shift .btn.primary::before { background:linear-gradient(100deg,#ffd59e,#ffa85e)!important; box-shadow:0 5px 24px #ff9c3822!important; }
.night-shift .btn { min-height:42px; }.night-shift .icon-btn { background:#06121be6; border-color:#9ddfff26; box-shadow:0 4px 16px #0003; }
.night-shift .h-pos::before,.night-shift .h-lapbox::before,.night-shift .h-tr::before { transform:none; border-radius:10px; background:#04121bdb!important; border-color:#a4dfff30!important; }
.night-shift .h-place { text-shadow:0 2px 14px #00e5ff35!important; }.night-shift .h-pos::after { transform:none; border-radius:2px; width:2px; left:0; background:#83ebff; box-shadow:none; }
.night-shift .tw-r { border-radius:4px; background:#03111bd9; }.night-shift .tw-r.me { background:linear-gradient(90deg,#156181c9,#092c41c9)!important; box-shadow:none!important; }
.night-shift #minimap { border-radius:12px; background:linear-gradient(145deg,#081b28e6,#020a12d9); border-color:#9ddfff30; box-shadow:0 8px 25px #0004; }
.night-shift .race-contracts { background:linear-gradient(130deg,#071b27e8,#030d16db); border-color:#8ce8ff30; border-left-color:#8ce8ff; backdrop-filter:none; }
.night-shift .rc-kicker { color:#b5efff; }.night-shift .gauge .kmh { text-shadow:0 3px 18px #00e5ff44; }
.night-shift .res-hero { border-radius:12px; background:linear-gradient(110deg,#123d516e,#06121a99); border:1px solid #9ddfff20; }
.night-shift .standings tbody tr { background:#ffffff02; }.night-shift .standings tbody tr:nth-child(even) { background:#ffffff05; }
.night-shift .contract-report { background:radial-gradient(ellipse at top right,#007eaa20,transparent 70%),#06121c; border-color:#8de6ff30; }
@media(min-width:1100px) and (min-height:760px) { .night-shift .title-col { margin-left:2vw; } }
@media(max-width:720px) { .night-shift #screen-title { padding-top:22px; padding-bottom:66px; } .night-shift .title-col { gap:11px; } .night-shift .logo-a { font-size:60px; } .night-shift .logo-b { font-size:76px; } .night-shift #title-menu .mbtn { min-height:58px; font-size:13px; } .night-shift .panel { border-radius:12px; } .night-shift .card .card-t { font-size:11px; } }
@media(max-height:600px) { .night-shift #screen-title { align-items:flex-start; padding-top:18px; } .night-shift .title-col { gap:8px; } .night-shift .logo-a { font-size:42px; } .night-shift .logo-b { font-size:52px; } .night-shift .logo-rule { margin-top:6px; } .night-shift #title-menu .mbtn { min-height:46px; padding:8px 14px; font-size:12px; } .night-shift #title-menu .mbtn small { display:none; } .night-shift .new-banner { padding:6px 10px; } .night-shift .eyebrow-line { font-size:8px; } }

/* Touch HUD has independent lanes: map left, timing right, goals at top centre, thumbs below. */
.night-shift .rc-short { display:none; }
body.touch-ui.night-shift .phud .race-contracts {
  top:max(8px, env(safe-area-inset-top))!important; bottom:auto!important; right:auto!important; left:50%!important;
  transform:translateX(-50%); width:250px!important; padding:8px!important;
  box-sizing:border-box; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px 10px;
  border:1px solid #8ce8ff30; border-radius:9px; background:#04121bdd;
}
body.touch-ui.night-shift .race-contracts .rc-kicker { grid-column:1/-1; margin:0 0 3px; font-size:8px; letter-spacing:.12em; }
body.touch-ui.night-shift .race-contracts .rc-full, body.touch-ui.night-shift .race-contracts>small { display:none; }
body.touch-ui.night-shift .race-contracts .rc-short { display:inline; }
body.touch-ui.night-shift .race-contracts .rc-goal { display:grid; margin:0; gap:4px; font-size:8px; }
body.touch-ui.night-shift .phud:not(.compact) .h-tr { min-width:0; width:160px; padding:8px 12px; box-sizing:border-box; }
body.touch-ui.night-shift .phud .h-tr .tm-main { font-size:10px; }
body.touch-ui.night-shift .phud .h-tr .tm-main b { font-size:24px; }
body.touch-ui.night-shift .phud .h-tr .tm-row { font-size:9px; }
body.touch-ui.night-shift .phud.compact .race-contracts { top:max(8px, env(safe-area-inset-top))!important; width:190px!important; }
body.touch-ui.night-shift.portrait .phud .race-contracts { top:max(8px, env(safe-area-inset-top))!important; width:230px!important; }
@media(max-width:600px) and (orientation:landscape) {
 body.touch-ui.night-shift .phud .race-contracts { top:max(8px, env(safe-area-inset-top))!important; width:176px!important; }
 body.touch-ui.night-shift .phud:not(.compact) .h-tr { width:120px; }
 body.touch-ui.night-shift .phud .h-tr .tm-row { display:none; }
 body.touch-ui.night-shift .phud .race-contracts .rc-goal { font-size:7px; }
}
body.touch-ui.night-shift.portrait .phud .h-banner { top:270px; }
body.touch-ui.night-shift.portrait .phud .h-feed { top:310px; }
/* No mobile footer: the landscape hint and its dark plate cover menu actions. */
body.touch-ui.night-shift #screen-title .title-bar { display:none; }
body.touch-ui.night-shift #screen-title { padding-bottom:max(16px, env(safe-area-inset-bottom)); }
/* Reserve the top centre for contracts; transient combo feedback goes below it. */
body.touch-ui.night-shift .phud .fx-combo { top:calc(max(8px, env(safe-area-inset-top)) + 66px); }
body.touch-ui.night-shift:not(.portrait) .phud .h-banner { top:140px; }
body.touch-ui.night-shift.portrait .phud .h-tl { top:80px; }
body.touch-ui.night-shift.portrait .phud .h-tr { top:150px; }
/* Short menus scroll inside the visible viewport; keep actions reachable below the cards. */
body.night-shift #screen-setup { align-items:flex-start; }
body.night-shift #screen-setup .setup-panel { margin-block:auto; flex-shrink:0; }
@media(min-width:900px) { body.night-shift .cards.tracks { grid-template-columns:repeat(6,minmax(0,1fr)); } }
@media(prefers-reduced-motion:reduce) { .night-shift *, .night-shift *::before, .night-shift *::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }
`;
export function installVisualRefresh() {
  if (document.getElementById('night-shift-style')) return;
  document.body.classList.add('night-shift');
  const st = document.createElement('style');
  st.id = 'night-shift-style'; st.textContent = CSS; document.head.append(st);
}
