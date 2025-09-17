import { ENGINES } from './engines.js';

// ----------------------------- PWA register ------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}
let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); deferredPrompt = null; installBtn.hidden = true;
});

// ------------------------------ DOM handles ------------------------------
const C = /** @type {HTMLCanvasElement} */(document.getElementById('game'));
const CTX = C.getContext('2d');
const menu = document.getElementById('menu');
const dead = document.getElementById('dead');
const meta = document.getElementById('meta');
const garage = document.getElementById('garage');
const metaGrid = document.getElementById('metaGrid');
const engineGrid = document.getElementById('engineGrid');
const deathSummary = document.getElementById('deathSummary');
const toastMsg = document.getElementById('toastMsg');

const runBtn = document.getElementById('runBtn');
const pauseBtn = document.getElementById('pauseBtn');
const menuRun = document.getElementById('menuRun');
const againBtn = document.getElementById('againBtn');
const menuMeta = document.getElementById('menuMeta');
const deadMetaBtn = document.getElementById('deadMetaBtn');
const metaBtn = document.getElementById('metaBtn');
const closeMeta = document.getElementById('closeMeta');
const engineBtn = document.getElementById('engineBtn');
const closeGarage = document.getElementById('closeGarage');

const goldEl = document.getElementById('gold');
const shardsEl = document.getElementById('shards');
const depthEl = document.getElementById('depth');
const engineNameEl = document.getElementById('engineName');

const statDMG = document.getElementById('statDMG');
const statFR = document.getElementById('statFR');
const statProj = document.getElementById('statProj');
const statSpread = document.getElementById('statSpread');
const statSpd = document.getElementById('statSpd');
const statHP = document.getElementById('statHP');
const statGoldMult = document.getElementById('statGoldMult');
const statShardMult = document.getElementById('statShardMult');

const buyDash = document.getElementById('buyDash');
const buyShield = document.getElementById('buyShield');
const buyNuke = document.getElementById('buyNuke');
const buyHeal = document.getElementById('buyHeal');
const buyTurret = document.getElementById('buyTurret');

const cd = {
  Dash: document.getElementById('cdDash'),
  Shield: document.getElementById('cdShield'),
  Nuke: document.getElementById('cdNuke'),
  Heal: document.getElementById('cdHeal'),
  Turret: document.getElementById('cdTurret'),
};

// ------------------------------ Utilities --------------------------------
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rnd=(a,b)=>a+Math.random()*(b-a);
const rndInt=(a,b)=>Math.floor(rnd(a,b+1));
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const lerp=(a,b,t)=>a+(b-a)*t;
const now=()=>performance.now();

// ------------------------------ Save/meta --------------------------------
const saveKey='rogue_meta_v1';
const loadMeta=()=>{ try { return JSON.parse(localStorage.getItem(saveKey)||'{}'); } catch { return {}; } };
const storeMeta=(m)=>localStorage.setItem(saveKey,JSON.stringify(m));
const META = Object.assign({
  shards:0,
  goldMagnet:0,      // +pickup radius
  goldRush:0,        // +drop chance
  wealthMult:0,      // +gold amount
  treasureHunter:0,  // chance for extra pile
  endlessMight:0,    // +% damage permanent
  endlessGreed:0,    // +% gold permanent
  shardMult:0
}, loadMeta());

const ENGINE_KEY='rogue_engine_choice_v1';
const loadEngineChoice=()=>{
  try {
    const id = localStorage.getItem(ENGINE_KEY);
    if (id){
      const found = ENGINES.find(e=>e.id===id);
      if (found) return found;
    }
  } catch {}
  return ENGINES[0];
};
const storeEngineChoice=(id)=>{ try { localStorage.setItem(ENGINE_KEY, id); } catch {} };
let selectedEngine = loadEngineChoice();

const BASE_PLAYER = { spd:220, hpMax:5, dmg:1, proj:1, spread:6, fireDelay:0.28 };

function applyEngineModifiers(player, engine){
  if (!engine || !engine.stats) return;
  const s = engine.stats;
  if (s.speedMult) player.spd *= s.speedMult;
  if (s.speedAdd) player.spd += s.speedAdd;
  if (s.damageMult) player.dmg *= s.damageMult;
  if (s.fireDelayMult) player.fireDelay *= s.fireDelayMult;
  if (s.fireDelayAdd) player.fireDelay += s.fireDelayAdd;
  if (s.projectilesBonus) player.proj += s.projectilesBonus;
  if (s.hpBonus) player.hpMax += s.hpBonus;
  if (s.spreadAdd) player.spread += s.spreadAdd;
}

function buildPlayer(base){
  const player = {
    x: base?.x ?? 0,
    y: base?.y ?? 0,
    vx: base?.vx ?? 0,
    vy: base?.vy ?? 0,
    inv: base?.inv ?? 0,
    fireAcc: base?.fireAcc ?? 0,
    spd: BASE_PLAYER.spd,
    hpMax: BASE_PLAYER.hpMax,
    dmg: BASE_PLAYER.dmg,
    proj: BASE_PLAYER.proj,
    spread: BASE_PLAYER.spread,
    fireDelay: BASE_PLAYER.fireDelay,
    hp: BASE_PLAYER.hpMax,
  };
  applyEngineModifiers(player, selectedEngine);
  player.spd = Math.max(60, player.spd);
  player.hpMax = Math.max(1, Math.round(player.hpMax));
  player.proj = Math.max(1, Math.round(player.proj));
  player.spread = Math.max(0, player.spread);
  player.fireDelay = Math.max(0.08, player.fireDelay);
  const ratio = base && base.hpMax ? clamp(base.hp / base.hpMax, 0, 1) : 1;
  player.hp = Math.max(1, Math.round(player.hpMax * ratio));
  player.fireAcc = Math.min(player.fireDelay, player.fireAcc);
  return player;
}

// ------------------------------ Game state -------------------------------
const ROOM_W=1200, ROOM_H=800;

let state = resetState();
function resetState() {
  const player = buildPlayer();
  player.x = ROOM_W*0.5;
  player.y = ROOM_H*0.5;
  player.vx = 0;
  player.vy = 0;
  player.inv = 0;
  player.fireAcc = 0;
  player.hp = player.hpMax;
  return {
    running:false, paused:false, over:false,
    t:0, dt:0, last:now(),
    player,
    cam:{x:ROOM_W*0.5,y:ROOM_H*0.5},
    room:{x:0,y:0},
    visited:new Set(),
    cleared:new Set(),
    enemies:[], bullets:[], ebullets:[], pickups:[], turrets:[],
    gold:0, depth:0,
    engineId:selectedEngine ? selectedEngine.id : null,
    abilities:{
      Dash:{owned:false, cd:0, baseCd:3, price:50},
      Shield:{owned:false, cd:0, baseCd:12, price:80, active:0},
      Nuke:{owned:false, cd:0, baseCd:18, price:120},
      Heal:{owned:false, cd:0, baseCd:10, price:60},
      Turret:{owned:false, cd:0, baseCd:14, price:100}
    }
  };
}

// ------------------------------- Input -----------------------------------
const keys = new Set();
window.addEventListener('keydown', e=>{
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key==='p' || e.key==='P') togglePause();
  if (e.key==='m' || e.key==='M'){ openGarage(false); openMeta(true); }
  if (state.running && !state.paused){
    if (e.key==='1') useAbility('Dash');
    if (e.key==='2') useAbility('Shield');
    if (e.key==='3') useAbility('Nuke');
    if (e.key==='4') useAbility('Heal');
    if (e.key==='5') useAbility('Turret');
  }
});
window.addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));

// -------------------------- Buttons / UI hooks ---------------------------
function uiSync(){
  goldEl.textContent = state.gold|0;
  shardsEl.textContent = META.shards|0;
  depthEl.textContent = state.depth|0;

  const goldMult = 1 + META.wealthMult*0.05 + META.endlessGreed*0.01;
  const dmgMult = state.player.dmg * (1 + META.endlessMight*0.01);
  statDMG.textContent = Math.round(dmgMult*100)+'%';
  statFR.textContent = (1/state.player.fireDelay).toFixed(2)+'/s';
  statProj.textContent = state.player.proj|0;
  statSpread.textContent = (state.player.spread|0)+'°';
  statSpd.textContent = Math.round(state.player.spd/BASE_PLAYER.spd*100)+'%';
  statHP.textContent = state.player.hpMax|0;
  statGoldMult.textContent = goldMult.toFixed(2)+'×';
  const shardMult=1+(META.shardMult||0)*0.05;
  statShardMult.textContent = shardMult.toFixed(2)+'×';

  if (engineNameEl){
    if (selectedEngine){
      engineNameEl.textContent = selectedEngine.name;
      engineNameEl.title = `${selectedEngine.manufacturer} • ${selectedEngine.induction.join(', ')} • ${selectedEngine.application}`;
    } else {
      engineNameEl.textContent = '--';
      engineNameEl.title = '';
    }
  }

  const depthScale = 1 + state.depth*0.02;
  for (const k of Object.keys(state.abilities)){
    const A = state.abilities[k];
    const price = Math.round(A.price*depthScale);
    const buyBtn = document.getElementById('buy'+k);
    const cdEl = cd[k];
    if (!A.owned){
      buyBtn.hidden=false; buyBtn.disabled = state.gold<price;
      buyBtn.textContent = 'Buy '+price;
      cdEl.textContent='Not owned';
    } else {
      buyBtn.hidden=true;
      cdEl.textContent = A.cd>0 ? ('CD '+A.cd.toFixed(1)+'s') : 'Ready';
    }
  }
}
buyDash.onclick=()=>buyAbility('Dash');
buyShield.onclick=()=>buyAbility('Shield');
buyNuke.onclick=()=>buyAbility('Nuke');
buyHeal.onclick=()=>buyAbility('Heal');
buyTurret.onclick=()=>buyAbility('Turret');

runBtn.onclick=()=>startRun();
pauseBtn.onclick=()=>togglePause();
menuRun.onclick=()=>{menu.style.display='none'; startRun();}
againBtn.onclick=()=>{dead.style.display='none'; startRun();}
menuMeta.onclick=()=>{ openGarage(false); openMeta(true); };
deadMetaBtn.onclick=()=>{ openGarage(false); openMeta(true); };
metaBtn.onclick=()=>{ openGarage(false); openMeta(true); };
closeMeta.onclick=()=>openMeta(false);
engineBtn?.addEventListener('click', ()=>{ openMeta(false); openGarage(true); });
closeGarage?.addEventListener('click', ()=>openGarage(false));

// -------------------------- Meta upgrades shop ---------------------------
const metaDefs = [
  { key:'goldMagnet', name:'Gold Magnet', desc:'+15px pickup radius per level', base:8, step:1.18, show:()=>true },
  { key:'goldRush', name:'Gold Rush', desc:'+5% drop chance per level', base:10, step:1.22, show:()=>true },
  { key:'wealthMult', name:'Wealth Multiplier', desc:'+5% gold amount per level', base:12, step:1.22, show:()=>true },
  { key:'treasureHunter', name:'Treasure Hunter', desc:'10% chance for extra pile per level', base:16, step:1.26, show:()=>true },
  { key:'endlessMight', name:'Endless Might', desc:'+1% permanent damage per level (infinite)', base:20, step:1.28, show:()=>true },
  { key:'endlessGreed', name:'Endless Greed', desc:'+1% permanent gold per level (infinite)', base:20, step:1.28, show:()=>true }
];
const metaCost = (key) => {
  const d = metaDefs.find(x=>x.key===key); const lvl = META[key]||0;
  return Math.round(d.base * Math.pow(d.step, lvl));
};
function drawMeta(){
  metaGrid.innerHTML='';
  for (const d of metaDefs){
    if (!d.show()) continue;
    const lvl=META[d.key]||0;
    const cost=metaCost(d.key);
    const div=document.createElement('div');
    div.className='shop-item';
    div.innerHTML=`
      <div>
        <div><b>${d.name}</b> <span class="small">Lv ${lvl}</span></div>
        <div class="small">${d.desc}</div>
      </div>
      <div>
        <div class="price">✦ ${cost}</div>
        <button class="btn acc" ${META.shards<cost?'disabled':''}>Buy</button>
      </div>`;
    const btn=div.querySelector('button');
    btn.onclick=()=>{
      if (META.shards>=cost){
        META.shards-=cost;
        META[d.key]=(META[d.key]||0)+1;
        storeMeta(META);
        shardsEl.textContent=META.shards|0;
        drawMeta(); uiSync();
      }
    };
    metaGrid.appendChild(div);
  }
}
function openMeta(open){
  meta.style.display = open?'flex':'none';
  if (open) drawMeta();
}

// --------------------------- Engine garage -----------------------------
function equipEngine(engine){
  if (!engine) return;
  if (selectedEngine && selectedEngine.id===engine.id) return;
  selectedEngine = engine;
  storeEngineChoice(engine.id);
  if (state && state.player){
    const next = buildPlayer(state.player);
    next.x = state.player.x;
    next.y = state.player.y;
    next.vx = state.player.vx;
    next.vy = state.player.vy;
    next.inv = state.player.inv;
    state.player = next;
    state.engineId = engine.id;
  }
  uiSync();
}

function engineEffectText(engine){
  const s = engine.stats || {};
  const lines = [];
  if (s.speedMult && Math.abs(s.speedMult-1)>0.001){
    const pct = Math.round((s.speedMult-1)*100);
    lines.push(`${pct>=0?'+':''}${pct}% Move Speed`);
  }
  if (s.damageMult && Math.abs(s.damageMult-1)>0.001){
    const pct = Math.round((s.damageMult-1)*100);
    lines.push(`${pct>=0?'+':''}${pct}% Damage`);
  }
  if (s.fireDelayMult && Math.abs(s.fireDelayMult-1)>0.001){
    const pct = Math.round(((1/s.fireDelayMult)-1)*100);
    lines.push(`${pct>=0?'+':''}${pct}% Fire Rate`);
  }
  if (s.projectilesBonus){
    const amt = s.projectilesBonus;
    lines.push(`${amt>0?'+':''}${amt} Projectile${Math.abs(amt)===1?'':'s'}`);
  }
  if (s.hpBonus){
    lines.push(`${s.hpBonus>0?'+':''}${s.hpBonus} Max HP`);
  }
  if (s.spreadAdd && Math.abs(s.spreadAdd)>0.05){
    const deg = Math.round(s.spreadAdd*10)/10;
    lines.push(`${deg>=0?'+':''}${deg}° Spread`);
  }
  return lines;
}

function drawGarage(){
  if (!engineGrid) return;
  engineGrid.innerHTML='';
  for (const engine of ENGINES){
    const card=document.createElement('div');
    const active = selectedEngine && selectedEngine.id===engine.id;
    card.className='engine-card'+(active?' selected':'');
    const badges = (engine.induction||[]).map(t=>`<span class="badge">${t}</span>`).join('');
    const effects = engineEffectText(engine);
    const effectText = effects.length ? effects.join(', ') : 'Factory tune — no stat changes.';
    const vehicles = (engine.vehicles||[]).join(', ');
    const hp = engine.output && typeof engine.output.hp!=='undefined' ? engine.output.hp : '?';
    const torque = engine.output && typeof engine.output.torque!=='undefined' ? engine.output.torque : '?';
    card.innerHTML=`
      <div class="engine-header">
        <div>
          <div class="engine-name">${engine.name}</div>
          <div class="engine-sub">${engine.manufacturer} • ${engine.application}</div>
        </div>
        <div class="engine-meta">${badges}</div>
      </div>
      <p class="engine-desc">${engine.description}</p>
      <div class="engine-stats">
        <div><span class="label">Output</span>${hp} hp / ${torque} lb-ft</div>
        <div><span class="label">Effects</span>${effectText}</div>
        <div><span class="label">Notable Uses</span>${vehicles}</div>
      </div>
      <div class="row" style="margin-top:6px">
        <button class="btn ok">${active?'Equipped':'Equip'}</button>
      </div>`;
    const btn = card.querySelector('button');
    if (active) btn.disabled=true;
    btn.addEventListener('click', ()=>{ equipEngine(engine); drawGarage(); });
    engineGrid.appendChild(card);
  }
}

function openGarage(open){
  if (!garage) return;
  garage.style.display = open?'flex':'none';
  if (open) drawGarage();
}

// --------------------------- Room & spawning -----------------------------
function roomKey(x,y){ return x+'_'+y; }
function currentRoomXY(){ return {x:Math.floor(state.player.x/ROOM_W), y:Math.floor(state.player.y/ROOM_H)}; }
function ensureRoom(){
  const r=currentRoomXY();
  if (state.room.x!==r.x || state.room.y!==r.y){
    state.room=r;
    state.depth=Math.max(state.depth, Math.abs(r.x)+Math.abs(r.y));
    const key=roomKey(r.x,r.y);
    if (!state.visited.has(key)){
      state.visited.add(key);
      spawnRoom(r.x,r.y);
    }
  }
}
function spawnRoom(rx,ry){
  const depth = Math.max(1, Math.abs(rx)+Math.abs(ry));
  const n = Math.min(12, 4 + Math.floor(depth*1.5) + rndInt(-1,2));
  for (let i=0;i<n;i++){ state.enemies.push(spawnEnemy(rx,ry,depth)); }
  if (Math.random()<0.12){
    for (let i=0;i<rndInt(3,6);i++){
      dropGold(rx*ROOM_W+rnd(200,ROOM_W-200), ry*ROOM_H+rnd(160,ROOM_H-160), rndInt(6,12));
    }
  }
}
function spawnEnemy(rx,ry,depth){
  const x = rx*ROOM_W + rnd(140, ROOM_W-140);
  const y = ry*ROOM_H + rnd(120, ROOM_H-120);
  const hp = 2 + Math.floor(depth*0.7) + rndInt(0,2);
  const spd = 60 + depth*4 + rndInt(-8,10);
  const goldBonus = 1 + depth*0.08;
  return {x,y,vx:0,vy:0,hp,spd,hit:0, goldBonus};
}

// -------------------------------- Combat ---------------------------------
function autoShoot(dt){
  state.player.fireAcc += dt;
  if (state.player.fireAcc < state.player.fireDelay) return;
  const nearest = state.enemies.reduce((best,e)=>{
    const d = dist(state.player.x,state.player.y,e.x,e.y);
    return (!best || d<best.d) ? {e,d} : best;
  }, null);
  if (!nearest) return;
  state.player.fireAcc=0;
  const {e} = nearest;
  const ang = Math.atan2(e.y - state.player.y, e.x - state.player.x);
  const spreadDeg = state.player.spread;
  const baseDmg = state.player.dmg * (1+META.endlessMight*0.01);
  for (let i=0;i<state.player.proj;i++){
    const off = (i - (state.player.proj-1)/2) * (spreadDeg*Math.PI/180);
    const a = ang + off;
    state.bullets.push({x:state.player.x, y:state.player.y, vx:Math.cos(a)*520, vy:Math.sin(a)*520, dmg:baseDmg});
  }
}
function damagePlayer(d){
  if (state.player.inv>0) return;
  if (state.abilities.Shield.active>0) return;
  state.player.hp -= d;
  state.player.inv = 0.4;
  if (state.player.hp<=0) gameOver();
}
function gameOver(){
  state.running=false; state.over=true;
  const shardMult = 1 + (META.shardMult||0)*0.05;
  const goldMultPerm = 1 + META.endlessGreed*0.01;
  const shardsGained = Math.max(1, Math.floor( (state.depth*0.7) + (state.gold*0.15*goldMultPerm) ) );
  META.shards += Math.floor(shardsGained*shardMult);
  storeMeta(META);
  shardsEl.textContent = META.shards|0;
  const engineUsed = ENGINES.find(e=>e.id===state.engineId) || selectedEngine;
  const engineLabel = engineUsed ? engineUsed.name : 'Factory Spec 2.0L Turbo';
  deathSummary.textContent = `Depth ${state.depth} — +${Math.floor(shardsGained*shardMult)} ✦ — Engine: ${engineLabel} (Total ${META.shards|0})`;
  dead.style.display='flex';
}
function dropGold(x,y,amount){
  const piles = Math.max(1, Math.floor(amount/3));
  for (let i=0;i<piles;i++){
    state.pickups.push({x:x+rnd(-20,20),y:y+rnd(-20,20),vx:rnd(-40,40),vy:rnd(-40,40),t:0,amt:Math.max(1, Math.round(amount/piles))});
  }
}
function enemyDeath(e){
  const metaDrop = 0.05*(META.goldRush||0);
  const chance = 0.45 + metaDrop + Math.min(0.35, state.depth*0.02);
  if (Math.random()<chance){
    const amtBase = rndInt(3,7);
    const wealth = 1 + META.wealthMult*0.05 + META.endlessGreed*0.01;
    const val = Math.round(amtBase * wealth * e.goldBonus);
    dropGold(e.x,e.y, val);
    const th = META.treasureHunter||0;
    for (let k=0;k<th;k++){
      if (Math.random()<0.10) dropGold(e.x+rnd(-30,30), e.y+rnd(-30,30), Math.max(1, Math.round(val*0.6)));
    }
  }
}

// -------------------------------- Abilities ------------------------------
function buyAbility(name){
  const A = state.abilities[name]; if (!A || A.owned) return;
  const price = Math.round(A.price*(1+state.depth*0.02));
  if (state.gold >= price){ state.gold -= price; A.owned=true; A.cd=0; uiSync(); }
}
function useAbility(name){
  const A = state.abilities[name]; if (!A || !A.owned || A.cd>0) return;
  if (name==='Dash'){
    state.player.inv = Math.max(state.player.inv, 0.35);
    let dx = (keys.has('arrowright')||keys.has('d')) - (keys.has('arrowleft')||keys.has('a'));
    let dy = (keys.has('arrowdown')||keys.has('s')) - (keys.has('arrowup')||keys.has('w'));
    const mag = Math.hypot(dx,dy)||1; dx/=mag; dy/=mag;
    state.player.vx += dx*780; state.player.vy += dy*780;
    A.cd = A.baseCd;
  }
  if (name==='Shield'){ A.cd=A.baseCd; A.active=5.0; }
  if (name==='Nuke'){
    A.cd=A.baseCd;
    const rx=state.room.x, ry=state.room.y;
    state.enemies = state.enemies.filter(e=>{
      const inRoom = Math.floor(e.x/ROOM_W)===rx && Math.floor(e.y/ROOM_H)===ry;
      if (inRoom){ enemyDeath(e); return false; } else return true;
    });
  }
  if (name==='Heal'){ A.cd=A.baseCd; state.player.hp = Math.min(state.player.hpMax, state.player.hp + Math.ceil(state.player.hpMax*0.5)); }
  if (name==='Turret'){ A.cd=A.baseCd; state.turrets.push({x:state.player.x,y:state.player.y,life:10,fire:0}); }
}

// --------------------------------- Loop ----------------------------------
function startRun(){
  state = resetState();
  menu.style.display='none'; dead.style.display='none'; meta.style.display='none'; openGarage(false);
  state.running=true; state.paused=false; pauseBtn.textContent='Pause';
  state.room={x:0,y:0}; state.visited=new Set(); state.cleared=new Set(); state.visited.add(roomKey(0,0));
  spawnRoom(0,0);
  uiSync();
}
function togglePause(){ if (!state.running) return; state.paused=!state.paused; pauseBtn.textContent = state.paused?'Resume':'Pause'; }
function update(){ const t=now(); state.dt=Math.min(0.033,(t-state.last)/1000); state.last=t; if (state.running && !state.paused && !state.over){ step(state.dt); draw(); } else { draw(); } requestAnimationFrame(update); }
requestAnimationFrame(update);

function step(dt){
  state.t+=dt;
  // input & movement
  let dx=(keys.has('arrowright')||keys.has('d')) - (keys.has('arrowleft')||keys.has('a'));
  let dy=(keys.has('arrowdown')||keys.has('s')) - (keys.has('arrowup')||keys.has('w'));
  const mag=Math.hypot(dx,dy)||1; dx/=mag; dy/=mag;
  state.player.vx = lerp(state.player.vx, dx*state.player.spd, 0.2);
  state.player.vy = lerp(state.player.vy, dy*state.player.spd, 0.2);
  state.player.x += state.player.vx*dt;
  state.player.y += state.player.vy*dt;

  if (state.player.inv>0) state.player.inv-=dt;
  if (state.abilities.Shield.active>0) state.abilities.Shield.active-=dt;

  // room logic
  ensureRoom();

  // exit lock until clear
  const rx = state.room.x, ry = state.room.y;
  const left = rx*ROOM_W, right=(rx+1)*ROOM_W, top=ry*ROOM_H, bottom=(ry+1)*ROOM_H;
  const enemiesInRoom = state.enemies.some(e => Math.floor(e.x/ROOM_W)===rx && Math.floor(e.y/ROOM_H)===ry);
  const roomClear = !enemiesInRoom;

  if (roomClear){
    state.cleared.add(roomKey(rx, ry));
    let crossed=false;
    if (state.player.x<left){ state.player.x+=ROOM_W; crossed=true; }
    if (state.player.x>right){ state.player.x-=ROOM_W; crossed=true; }
    if (state.player.y<top){ state.player.y+=ROOM_H; crossed=true; }
    if (state.player.y>bottom){ state.player.y-=ROOM_H; crossed=true; }
    if (crossed) ensureRoom();
  } else {
    const m=18;
    state.player.x = clamp(state.player.x, left+m, right-m);
    state.player.y = clamp(state.player.y, top+m,  bottom-m);
  }

  // enemies
  for (const e of state.enemies){
    const a = Math.atan2(state.player.y-e.y, state.player.x-e.x);
    e.vx = Math.cos(a)*e.spd; e.vy = Math.sin(a)*e.spd;
    e.x += e.vx*dt; e.y += e.vy*dt;
    if (e.hit>0) e.hit-=dt;
    if (dist(e.x,e.y,state.player.x,state.player.y)<22){ damagePlayer(1); e.hit=0.1; }
  }

  // turrets
  for (const t of state.turrets){
    t.life-=dt; t.fire+=dt;
    if (t.fire>0.25){
      t.fire=0;
      const target = state.enemies[0];
      if (target){
        const ang=Math.atan2(target.y-t.y,target.x-t.x);
        const turretDmg = (0.8+META.endlessMight*0.01) * state.player.dmg;
        state.bullets.push({x:t.x,y:t.y,vx:Math.cos(ang)*520,vy:Math.sin(ang)*520,dmg:turretDmg});
      }
    }
  }
  state.turrets = state.turrets.filter(t=>t.life>0);

  // bullets
  autoShoot(dt);
  for (const b of state.bullets){ b.x+=b.vx*dt; b.y+=b.vy*dt; }
  for (const b of state.bullets){
    for (const e of state.enemies){
      if (dist(b.x,b.y,e.x,e.y)<14){
        e.hp -= b.dmg; e.hit=0.08;
        b.x=Infinity; b.y=Infinity;
        if (e.hp<=0){ enemyDeath(e); e.hp=-999; }
        break;
      }
    }
  }
  state.bullets = state.bullets.filter(b=>isFinite(b.x));
  state.enemies = state.enemies.filter(e=>e.hp>0);

  // pickups (gold)
  const magnet = 40 + (META.goldMagnet||0)*15;
  for (const p of state.pickups){
    p.t+=dt;
    const d0 = dist(p.x,p.y,state.player.x,state.player.y);
    if (d0<magnet){
      const a = Math.atan2(state.player.y-p.y, state.player.x-p.x);
      p.vx += Math.cos(a)*200*dt;
      p.vy += Math.sin(a)*200*dt;
    }
    p.x += p.vx*dt; p.y += p.vy*dt;
    const d1 = dist(p.x,p.y,state.player.x,state.player.y);
    if (d1<18){
      const goldMult = 1 + META.wealthMult*0.05 + META.endlessGreed*0.01;
      state.gold += Math.max(1, Math.round(p.amt * goldMult));
      p.x=Infinity;
    }
  }
  state.pickups = state.pickups.filter(p=>isFinite(p.x));

  // cooldowns
  for (const k of Object.keys(state.abilities)){
    const A=state.abilities[k];
    if (A.cd>0) A.cd-=dt;
  }

  // toast visibility
  toastMsg.hidden = !(state.running && !state.paused && roomClear);

  // camera
  state.cam.x = lerp(state.cam.x, state.player.x, 0.15);
  state.cam.y = lerp(state.cam.y, state.player.y, 0.15);

  uiSync();
}

function draw(){
  const ctx=CTX, cam=state.cam;
  const dpr = window.devicePixelRatio||1;
  const rect = C.getBoundingClientRect();
  if (C.width !== Math.floor(rect.width*dpr) || C.height !== Math.floor(rect.height*dpr)){
    C.width = Math.floor(rect.width*dpr);
    C.height = Math.floor(rect.height*dpr);
    ctx.imageSmoothingEnabled=false;
  }
  ctx.save();
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,rect.width,rect.height);

  // translate to keep player centered-ish
  const targetX = cam.x - rect.width/2;
  const targetY = cam.y - rect.height/2;
  ctx.translate(-targetX, -targetY);

  // room frames near player
  const rx=state.room.x, ry=state.room.y;
  const roomsToDraw=[[rx,ry],[rx+1,ry],[rx-1,ry],[rx,ry+1],[rx,ry-1]];
  for (const [x,y] of roomsToDraw){
    const x0=x*ROOM_W, y0=y*ROOM_H;
    ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=4;
    ctx.strokeRect(x0+10,y0+10, ROOM_W-20, ROOM_H-20);
  }

  // gray overlay on cleared visited rooms (in/near viewport)
  const viewL = targetX - ROOM_W, viewT = targetY - ROOM_H;
  const viewR = targetX + rect.width + ROOM_W, viewB = targetY + rect.height + ROOM_H;
  for (const key of state.visited){
    const [vx,vy] = key.split('_').map(Number);
    const x0=vx*ROOM_W, y0=vy*ROOM_H;
    if (x0>viewL && x0<viewR && y0>viewT && y0<viewB && state.cleared.has(key)){
      ctx.fillStyle='rgba(148,163,184,0.12)';
      ctx.fillRect(x0+10, y0+10, ROOM_W-20, ROOM_H-20);
    }
  }

  // enemies
  for (const e of state.enemies){
    ctx.fillStyle = e.hit>0 ? '#fca5a5' : '#7dd3fc';
    ctx.beginPath(); ctx.arc(e.x,e.y,14,0,Math.PI*2); ctx.fill();
  }

  // bullets
  ctx.fillStyle='#e5e7eb';
  for (const b of state.bullets){ ctx.fillRect(b.x-2,b.y-2,4,4); }

  // turrets
  ctx.fillStyle='#86efac';
  for (const t of state.turrets){ ctx.fillRect(t.x-6,t.y-6,12,12); }

  // gold coins
  ctx.fillStyle = '#facc15';
  for (const p of state.pickups){
    const r = 4.5 + Math.sin(state.t*6 + p.x*0.01)*0.7;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
  }

  // player
  ctx.save();
  ctx.translate(state.player.x, state.player.y);
  ctx.fillStyle = state.abilities.Shield.active>0 ? '#60a5fa' : '#eab308';
  ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
  if (state.player.inv>0){
    ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  // in-canvas HP pips
  ctx.fillStyle='rgba(255,255,255,.2)';
  for (let i=0;i<state.player.hpMax;i++){ const x=targetX+20+i*18, y=targetY+16; ctx.fillRect(x,y,14,8); }
  ctx.fillStyle='#f87171';
  for (let i=0;i<state.player.hp;i++){ const x=targetX+20+i*18, y=targetY+16; ctx.fillRect(x,y,14,8); }

  ctx.restore();
}

// ------------------------------- Resize ----------------------------------
function fit(){
  const wrap = document.getElementById('canvaswrap');
  const r = wrap.getBoundingClientRect();
  C.style.width = r.width+'px';
  C.style.height = r.height+'px';
}
window.addEventListener('resize', fit); fit();

// -------------------------------- Start ----------------------------------
menu.style.display='flex';
uiSync();
