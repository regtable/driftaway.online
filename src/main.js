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
const metaGrid = document.getElementById('metaGrid');
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

const goldEl = document.getElementById('gold');
const shardsEl = document.getElementById('shards');
const depthEl = document.getElementById('depth');

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
  shardMult:0,       // +shard amount
  rapidFire:0,       // +fire rate
  speedBoost:0,      // +move speed
  vitality:0,        // +max hp
  abilityMastery:0,  // -ability cooldowns
  endlessMight:0,    // +% damage permanent
  endlessGreed:0,    // +% gold permanent
}, loadMeta());

// ------------------------------ Game state -------------------------------
const ROOM_W=1200, ROOM_H=800, WALL=40, DOOR=160;

let state = resetState();
function resetState() {
  const cdMult = Math.max(0.2, 1 - (META.abilityMastery||0)*0.05);
  return {
    running:false, paused:false, over:false,
    t:0, dt:0, last:now(),
    player:{
      x:ROOM_W*0.5,
      y:ROOM_H*0.5,
      vx:0, vy:0,
      spd:220*(1+(META.speedBoost||0)*0.05),
      hp:5+(META.vitality||0),
      hpMax:5+(META.vitality||0),
      inv:0,
      dmg:1,
      proj:1,
      spread:6,
      fireDelay:0.28/(1+(META.rapidFire||0)*0.05),
      fireAcc:0
    },
    cam:{x:ROOM_W*0.5,y:ROOM_H*0.5},
    room:{x:0,y:0},
    visited:new Set(),
    cleared:new Set(),
    enemies:[], bullets:[], ebullets:[], pickups:[], turrets:[],
    gold:0, depth:0,
    abilities:{
      Dash:{owned:false, cd:0, baseCd:3*cdMult, price:50},
      Shield:{owned:false, cd:0, baseCd:12*cdMult, price:80, active:0},
      Nuke:{owned:false, cd:0, baseCd:18*cdMult, price:120},
      Heal:{owned:false, cd:0, baseCd:10*cdMult, price:60},
      Turret:{owned:false, cd:0, baseCd:14*cdMult, price:100}
    }
  };
}

// ------------------------------- Input -----------------------------------
const keys = new Set();
window.addEventListener('keydown', e=>{
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key==='p' || e.key==='P') togglePause();
  if (e.key==='m' || e.key==='M') openMeta(true);
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
  statDMG.textContent = ((1+META.endlessMight*0.01)*100|0) + '%';
  statFR.textContent = (1/state.player.fireDelay).toFixed(2)+'/s';
  statProj.textContent = state.player.proj|0;
  statSpread.textContent = (state.player.spread|0)+'°';
  statSpd.textContent = (state.player.spd/220*100|0)+'%';
  statHP.textContent = state.player.hpMax|0;
  statGoldMult.textContent = goldMult.toFixed(2)+'×';
  const shardMult=1+(META.shardMult||0)*0.05;
  statShardMult.textContent = shardMult.toFixed(2)+'×';

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
menuMeta.onclick=()=>openMeta(true);
deadMetaBtn.onclick=()=>openMeta(true);
metaBtn.onclick=()=>openMeta(true);
closeMeta.onclick=()=>openMeta(false);

// -------------------------- Meta upgrades shop ---------------------------
const metaDefs = [
  { key:'goldMagnet', name:'Gold Magnet', desc:'+15px pickup radius per level', base:8, step:1.18, show:()=>true },
  { key:'goldRush', name:'Gold Rush', desc:'+5% drop chance per level', base:10, step:1.22, show:()=>true },
  { key:'wealthMult', name:'Wealth Multiplier', desc:'+5% gold amount per level', base:12, step:1.22, show:()=>true },
  { key:'treasureHunter', name:'Treasure Hunter', desc:'10% chance for extra pile per level', base:16, step:1.26, show:()=>true },
  { key:'shardMult', name:'Shard Hoarder', desc:'+5% shards per run', base:14, step:1.24, show:()=>true },
  { key:'rapidFire', name:'Rapid Fire', desc:'+5% fire rate per level', base:18, step:1.25, show:()=>true },
  { key:'speedBoost', name:'Swift Steps', desc:'+5% move speed per level', base:18, step:1.25, show:()=>true },
  { key:'vitality', name:'Vitality', desc:'+1 max HP per level', base:20, step:1.28, show:()=>true },
  { key:'abilityMastery', name:'Ability Mastery', desc:'-5% ability cooldowns per level', base:22, step:1.3, show:()=>true },
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
  for (let i=0;i<state.player.proj;i++){
    const off = (i - (state.player.proj-1)/2) * (spreadDeg*Math.PI/180);
    const a = ang + off;
    state.bullets.push({x:state.player.x, y:state.player.y, vx:Math.cos(a)*520, vy:Math.sin(a)*520, dmg:(1+META.endlessMight*0.01)});
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
  deathSummary.textContent = `Depth ${state.depth} — +${Math.floor(shardsGained*shardMult)} ✦ (Total ${META.shards|0})`;
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
  menu.style.display='none'; dead.style.display='none'; meta.style.display='none';
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

  const doorX1 = left + ROOM_W*0.5 - DOOR*0.5;
  const doorX2 = doorX1 + DOOR;
  const doorY1 = top + ROOM_H*0.5 - DOOR*0.5;
  const doorY2 = doorY1 + DOOR;

  if (roomClear){
    state.cleared.add(roomKey(rx, ry));
    let crossed=false;
    if (state.player.x<left && state.player.y>doorY1 && state.player.y<doorY2){ state.player.x+=ROOM_W; crossed=true; }
    else if (state.player.x>right && state.player.y>doorY1 && state.player.y<doorY2){ state.player.x-=ROOM_W; crossed=true; }
    else if (state.player.y<top && state.player.x>doorX1 && state.player.x<doorX2){ state.player.y+=ROOM_H; crossed=true; }
    else if (state.player.y>bottom && state.player.x>doorX1 && state.player.x<doorX2){ state.player.y-=ROOM_H; crossed=true; }
    if (crossed){
      ensureRoom();
    } else {
      state.player.x = clamp(state.player.x, left+WALL, right-WALL);
      state.player.y = clamp(state.player.y, top+WALL,  bottom-WALL);
    }
  } else {
    state.player.x = clamp(state.player.x, left+WALL, right-WALL);
    state.player.y = clamp(state.player.y, top+WALL,  bottom-WALL);
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
        state.bullets.push({x:t.x,y:t.y,vx:Math.cos(ang)*520,vy:Math.sin(ang)*520,dmg:(0.8+META.endlessMight*0.01)});
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

  // room walls near player
  const rx=state.room.x, ry=state.room.y;
  const roomsToDraw=[[rx,ry],[rx+1,ry],[rx-1,ry],[rx,ry+1],[rx,ry-1]];
  for (const [x,y] of roomsToDraw){
    const x0=x*ROOM_W, y0=y*ROOM_H;
    const key=roomKey(x,y);
    const cleared=state.cleared.has(key);
    ctx.fillStyle='#1e293b';
    // top & bottom walls
    ctx.fillRect(x0, y0, ROOM_W*0.5-DOOR*0.5, WALL);
    ctx.fillRect(x0+ROOM_W*0.5+DOOR*0.5, y0, ROOM_W*0.5-DOOR*0.5, WALL);
    ctx.fillRect(x0, y0+ROOM_H-WALL, ROOM_W*0.5-DOOR*0.5, WALL);
    ctx.fillRect(x0+ROOM_W*0.5+DOOR*0.5, y0+ROOM_H-WALL, ROOM_W*0.5-DOOR*0.5, WALL);
    // left & right walls
    ctx.fillRect(x0, y0, WALL, ROOM_H*0.5-DOOR*0.5);
    ctx.fillRect(x0, y0+ROOM_H*0.5+DOOR*0.5, WALL, ROOM_H*0.5-DOOR*0.5);
    ctx.fillRect(x0+ROOM_W-WALL, y0, WALL, ROOM_H*0.5-DOOR*0.5);
    ctx.fillRect(x0+ROOM_W-WALL, y0+ROOM_H*0.5+DOOR*0.5, WALL, ROOM_H*0.5-DOOR*0.5);
    if (!cleared){
      ctx.fillStyle='#475569';
      ctx.fillRect(x0+ROOM_W*0.5-DOOR*0.5, y0, DOOR, WALL);
      ctx.fillRect(x0+ROOM_W*0.5-DOOR*0.5, y0+ROOM_H-WALL, DOOR, WALL);
      ctx.fillRect(x0, y0+ROOM_H*0.5-DOOR*0.5, WALL, DOOR);
      ctx.fillRect(x0+ROOM_W-WALL, y0+ROOM_H*0.5-DOOR*0.5, WALL, DOOR);
    }
  }

  // gray overlay on cleared visited rooms (in/near viewport)
  const viewL = targetX - ROOM_W, viewT = targetY - ROOM_H;
  const viewR = targetX + rect.width + ROOM_W, viewB = targetY + rect.height + ROOM_H;
  for (const key of state.visited){
    const [vx,vy] = key.split('_').map(Number);
    const x0=vx*ROOM_W, y0=vy*ROOM_H;
    if (x0>viewL && x0<viewR && y0>viewT && y0<viewB && state.cleared.has(key)){
      ctx.fillStyle='rgba(148,163,184,0.12)';
      ctx.fillRect(x0+WALL, y0+WALL, ROOM_W-WALL*2, ROOM_H-WALL*2);
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
