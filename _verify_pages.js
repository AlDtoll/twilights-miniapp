// Verify each standalone game page: syntax (new Function over core.js + inline script)
// + smoke (run the entry under DOM/canvas/tg stubs; catch ReferenceError/TypeError).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = '/home/claudeuser/twilights-miniapp';
const core = fs.readFileSync(path.join(DIR, 'shared/core.js'), 'utf8');
const games = process.argv.slice(2);

function inlineScript(html) {
  // all <script> ... </script> without a src= attribute → the game's inline code
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/\bsrc=/.test(m[1])).map(m => m[2]);
  return blocks.join('\n');
}

function makeEl() {
  const el = {
    style: {}, dataset: {}, _children: [],
    textContent: '', innerHTML: '', value: '', className: '', width: 0, height: 0,
    classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
    addEventListener(){}, removeEventListener(){}, appendChild(c){this._children.push(c);return c;},
    removeChild(){}, insertBefore(c){this._children.push(c);return c;}, remove(){},
    setAttribute(){}, getAttribute(){return null;}, querySelector(){return makeEl();},
    querySelectorAll(){return [];}, getBoundingClientRect(){return {left:0,top:0,width:320,height:320,right:320,bottom:320};},
    focus(){}, blur(){}, click(){}, cloneNode(){return makeEl();},
    getContext(){return ctxStub();}, closest(){return null;}, scrollIntoView(){},
  };
  return new Proxy(el, { get(t,p){ if(p in t) return t[p]; if(typeof p==='string'){ return undefined; } return t[p]; } });
}
function ctxStub(){
  return new Proxy({}, { get(){ return ()=>{}; } });
}

function run(game) {
  const file = path.join(DIR, game, 'index.html');
  if (!fs.existsSync(file)) return { game, exists:false, syntax:false, smoke:false, err:'no file' };
  const html = fs.readFileSync(file, 'utf8');
  const hasCore = /shared\/core\.js/.test(html);
  const hasStyles = /shared\/styles\.css/.test(html);
  const script = inlineScript(html);
  // 1) syntax
  let syntax = true, serr = null;
  try { new Function(core + '\n' + script); } catch (e) { syntax = false; serr = e.message; }
  // 2) smoke
  let smoke = true, merr = null;
  if (syntax) {
    const timers = [];
    const sandbox = {
      console: { log(){}, warn(){}, error(){} },
      Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, Symbol,
      parseInt, parseFloat, isNaN, isFinite,
      setTimeout: (fn,d)=>{ if(typeof fn==='function') timers.push(fn); return timers.length; },
      clearTimeout: ()=>{}, setInterval: ()=>0, clearInterval: ()=>{},
      requestAnimationFrame: ()=>0, cancelAnimationFrame: ()=>{},
      atob: (s)=>Buffer.from(s,'base64').toString('binary'),
      btoa: (s)=>Buffer.from(s,'binary').toString('base64'),
      TextDecoder, TextEncoder, Uint8Array, ArrayBuffer,
      navigator: { userAgent:'node', vibrate(){} },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    sandbox.devicePixelRatio = 2;
    sandbox.innerWidth = 390; sandbox.innerHeight = 800;
    sandbox.location = { search:'', href:'https://x/y', hash:'' };
    sandbox.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){} };
    const mb = { show(){}, hide(){}, setText(){}, setParams(){}, onClick(){}, offClick(){}, enable(){}, disable(){} };
    sandbox.Telegram = { WebApp: {
      ready(){}, expand(){}, close(){}, onEvent(){}, offEvent(){}, sendData(){},
      MainButton: mb, BackButton:{show(){},hide(){},onClick(){}}, HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}},
      themeParams:{}, colorScheme:'dark', initData:'', initDataUnsafe:{},
      setHeaderColor(){}, setBackgroundColor(){}, enableClosingConfirmation(){}, disableVerticalSwipes(){},
    } };
    const doc = {
      body: makeEl(), documentElement: makeEl(), head: makeEl(),
      getElementById(){ return makeEl(); }, querySelector(){ return makeEl(); },
      querySelectorAll(){ return []; }, createElement(){ return makeEl(); },
      createElementNS(){ return makeEl(); }, addEventListener(){}, removeEventListener(){},
      createDocumentFragment(){ return makeEl(); }, getElementsByClassName(){ return []; },
      getElementsByTagName(){ return []; }, readyState:'complete',
    };
    sandbox.document = doc;
    try {
      const ctx = vm.createContext(sandbox);
      vm.runInContext(core + '\n' + script, ctx, { timeout: 5000 });
      // flush one round of timers (covers setTimeout(initCard,0) etc.)
      timers.slice(0, 50).forEach(fn => { try { fn(); } catch(e){ throw e; } });
    } catch (e) { smoke = false; merr = (e && e.message) || String(e); }
  }
  return { game, exists:true, hasCore, hasStyles, syntax, syntaxErr:serr, smoke, smokeErr:merr };
}

const res = games.map(run);
for (const r of res) {
  const ok = r.exists && r.syntax && r.smoke && r.hasCore && r.hasStyles;
  console.log(`${ok?'✅':'❌'} ${r.game.padEnd(11)} exists=${r.exists} syntax=${r.syntax} smoke=${r.smoke} core=${r.hasCore} styles=${r.hasStyles}` +
    (r.syntaxErr?`  SYNTAX: ${r.syntaxErr}`:'') + (r.smokeErr?`  SMOKE: ${r.smokeErr}`:''));
}
const bad = res.filter(r => !(r.exists && r.syntax && r.smoke && r.hasCore && r.hasStyles)).map(r=>r.game);
console.log('\nPASS: ' + res.filter(r=>r.exists&&r.syntax&&r.smoke&&r.hasCore&&r.hasStyles).map(r=>r.game).join(', '));
console.log('FAIL: ' + (bad.join(', ')||'none'));
