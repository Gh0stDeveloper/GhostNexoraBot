/** Mini juego de plataformas estilo Mario para rich message HTML de WhatsApp. */
export function buildMarioGameHtml(): string {
  return `<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
html,body{width:100%;direction:ltr}
body{background:linear-gradient(165deg,#1e1b4b,#0f172a 60%,#020617);padding:8px;color:#eaf2ff;overflow-y:auto}
#app{max-width:430px;margin:0 auto}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 7px;gap:8px}
.tt{font:900 16px Arial;color:#ff5757;text-shadow:0 0 12px rgba(255,87,87,.4);letter-spacing:.5px}
.tt small{display:block;font:700 8px Arial;letter-spacing:1px;color:#94a3b8;text-shadow:none;margin-top:2px}
.hrs{display:flex;gap:5px;align-items:center}
.hr{background:rgba(0,0,0,.42);border:1px solid rgba(255,87,87,.28);border-radius:9px;padding:3px 7px;text-align:center;min-width:48px}
.hr i{display:block;font:700 7px Arial;font-style:normal;letter-spacing:.6px;color:#94a3b8}
.hr b{font:900 12px Arial;color:#ffd75e;font-variant-numeric:tabular-nums}
.mbtn{width:32px;height:32px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(0,0,0,.42);color:#fff;font-size:14px;cursor:pointer;touch-action:none}
.mbtn:active{filter:brightness(1.6)}
.gw{position:relative;border:2px solid rgba(255,87,87,.3);border-radius:14px;overflow:hidden;background:#5c94fc;box-shadow:0 0 18px rgba(255,87,87,.15);direction:ltr}
canvas{width:100%;display:block;touch-action:none}
.pads{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
.pd{height:54px;border:2px solid rgba(255,255,255,.18);border-radius:14px;font:900 13px Arial;color:#fff;cursor:pointer;touch-action:none;box-shadow:0 4px 0 rgba(0,0,0,.5)}
.pd:active{transform:translateY(3px);box-shadow:none;filter:brightness(1.5)}
#leftB,#rightB{background:linear-gradient(#3b82f6,#1d4ed8 60%,#1e3a8a)}
#jumpB{background:linear-gradient(#ef4444,#b91c1c 60%,#7f1d1d)}
.hint{text-align:center;font:600 9.5px Arial;color:#94a3b8;margin-top:7px;line-height:1.4}
.brand{text-align:center;font:700 8px Arial;color:#64748b;margin-top:5px;letter-spacing:.8px}
</style>
<div id="app">
  <div class="hdr">
    <div class="tt">🍄 SUPER MARIO<small>MINI PLATAFORMAS · GHOST NEXORA</small></div>
    <div class="hrs">
      <div class="hr"><i>PUNTOS</i><b id="sc">0</b></div>
      <div class="hr"><i>MONEDAS</i><b id="co">0</b></div>
      <div class="hr"><i>VIDAS</i><b id="li">3</b></div>
      <button class="mbtn" id="resetB" title="Reiniciar">↻</button>
      <button class="mbtn" id="muteB" title="Sonido">🔊</button>
    </div>
  </div>
  <div class="gw"><canvas id="cv" width="404" height="240"></canvas></div>
  <div class="pads">
    <button class="pd" id="leftB">◀ IZQUIERDA</button>
    <button class="pd" id="jumpB">▲ SALTAR</button>
    <button class="pd" id="rightB">DERECHA ▶</button>
  </div>
  <div class="hint" id="hint">Muévete, salta sobre los enemigos, recoge monedas y llega a la bandera.</div>
  <div class="brand">GHOST NEXORA BOT</div>
</div>
<script>
(function(){
var cv=document.getElementById('cv'),x=cv.getContext('2d'),W=404,H=240,DPR=2;
cv.width=W*DPR;cv.height=H*DPR;
var scEl=document.getElementById('sc'),coEl=document.getElementById('co'),liEl=document.getElementById('li'),hint=document.getElementById('hint');
var AC=null,MUTED=false;
try{MUTED=localStorage.getItem('ghost_mario_mute')==='1'}catch(e){}
function ac(){if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}if(AC&&AC.state==='suspended'){try{AC.resume()}catch(e){}}return AC}
function tone(f,d,t,v,at,sl){var a=AC;if(!a||MUTED)return;try{var n=a.currentTime+(at||0),o=a.createOscillator(),g=a.createGain();o.type=t||'square';o.frequency.setValueAtTime(f,n);if(sl)o.frequency.exponentialRampToValueAtTime(sl,n+d);g.gain.setValueAtTime(v||.1,n);g.gain.exponentialRampToValueAtTime(.0001,n+d);o.connect(g);g.connect(a.destination);o.start(n);o.stop(n+d+.03)}catch(e){}}
function noise(d,v,at,fc){var a=AC;if(!a||MUTED)return;try{var n=a.currentTime+(at||0),len=Math.floor(a.sampleRate*d),b=a.createBuffer(1,len,a.sampleRate),c=b.getChannelData(0),i;for(i=0;i<len;i++)c[i]=Math.random()*2-1;var s=a.createBufferSource(),g=a.createGain(),f=a.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=fc||1200;g.gain.setValueAtTime(v,n);g.gain.exponentialRampToValueAtTime(.0001,n+d);s.connect(f);f.connect(g);g.connect(a.destination);s.start(n);s.stop(n+d+.03)}catch(e){}}
function sJump(){tone(300,.12,'square',.15,0,600)}
function sCoin(){tone(988,.08,'sine',.12);tone(1319,.15,'sine',.14,.07)}
function sStomp(){tone(140,.1,'square',.2,0,40);noise(.1,.15,0,800)}
function sDie(){[330,294,262,220,196,165].forEach(function(f,i){tone(f,.15,'sawtooth',.15,i*.1)});noise(.3,.2,.6,400)}
function sWin(){[523,659,784,1047].forEach(function(f,i){tone(f,.16,'square',.12,i*.12)})}
var state='ready',score=0,coins=0,lives=3,camX=0,frame=0,goalX=2730;
var keys={left:false,right:false};
var mario={x:40,y:140,vx:0,vy:0,w:18,h:24,grounded:false,facing:1,inv:0};
var platforms=[],pipes=[],coinsList=[],enemies=[];
function updateUI(){scEl.textContent=score;coEl.textContent=coins;liEl.textContent=lives}
function generateMap(){
platforms=[{x:0,y:200,w:3000,h:40},{x:350,y:140,w:80,h:16},{x:520,y:100,w:96,h:16},{x:720,y:140,w:112,h:16},{x:940,y:110,w:80,h:16},{x:1150,y:140,w:120,h:16},{x:1400,y:100,w:100,h:16},{x:1650,y:140,w:150,h:16},{x:1920,y:105,w:90,h:16},{x:2150,y:140,w:120,h:16},{x:2390,y:95,w:120,h:16}];
pipes=[{x:250,y:160,w:28,h:40},{x:650,y:160,w:28,h:40},{x:880,y:160,w:28,h:40},{x:1320,y:160,w:28,h:40},{x:1580,y:160,w:28,h:40},{x:2050,y:160,w:28,h:40},{x:2310,y:160,w:28,h:40}];
coinsList=[];for(var i=100;i<2650;i+=85)coinsList.push({x:i,y:(i%170===0?112:165),collected:false});
enemies=[];for(var j=300;j<2600;j+=220)enemies.push({x:j,y:180,w:20,h:20,vx:-1,alive:true,rangeMin:j-105,rangeMax:j+105});
}
function resetWorld(startPlaying){score=0;coins=0;lives=3;camX=0;frame=0;mario={x:40,y:140,vx:0,vy:0,w:18,h:24,grounded:false,facing:1,inv:0};generateMap();state=startPlaying?'play':'ready';updateUI();hint.textContent=startPlaying?'Llega a la bandera del final.':'Pulsa SALTAR para comenzar.'}
function respawn(){mario.x=Math.max(40,camX+42);mario.y=90;mario.vx=0;mario.vy=0;mario.inv=100;}
function jump(){ac();if(state==='ready'){state='play';hint.textContent='Llega a la bandera del final.';return}if(state==='dead'||state==='win'){resetWorld(true);return}if(mario.grounded){mario.vy=-10.5;mario.grounded=false;sJump()}}
function setMove(side,on){keys[side]=on;ac()}
function bindHold(id,side){var b=document.getElementById(id);b.addEventListener('pointerdown',function(e){e.preventDefault();setMove(side,true)});['pointerup','pointerleave','pointercancel'].forEach(function(ev){b.addEventListener(ev,function(e){e.preventDefault();keys[side]=false})})}
bindHold('leftB','left');bindHold('rightB','right');
document.getElementById('jumpB').addEventListener('pointerdown',function(e){e.preventDefault();jump()});
document.addEventListener('keydown',function(e){if((e.code==='Space'||e.code==='ArrowUp')&&!e.repeat){e.preventDefault();jump()}if(e.code==='ArrowLeft')keys.left=true;if(e.code==='ArrowRight')keys.right=true});
document.addEventListener('keyup',function(e){if(e.code==='ArrowLeft')keys.left=false;if(e.code==='ArrowRight')keys.right=false});
var mb=document.getElementById('muteB');mb.textContent=MUTED?'🔇':'🔊';mb.addEventListener('pointerdown',function(e){e.preventDefault();MUTED=!MUTED;mb.textContent=MUTED?'🔇':'🔊';try{localStorage.setItem('ghost_mario_mute',MUTED?'1':'0')}catch(e2){}});
document.getElementById('resetB').addEventListener('pointerdown',function(e){e.preventDefault();resetWorld(true)});
function die(){if(mario.inv>0)return;lives--;sDie();updateUI();if(lives<=0){state='dead';hint.textContent='Game Over · pulsa SALTAR para reiniciar.'}else{respawn();hint.textContent='Perdiste una vida. ¡Sigue intentando!'}}
function overlap(a,b){return a.x+a.w>b.x&&a.x<b.x+b.w&&a.y+a.h>b.y&&a.y<b.y+b.h}
function update(){if(state!=='play')return;frame++;if(mario.inv>0)mario.inv--;
if(keys.left){mario.vx=-3.2;mario.facing=-1}else if(keys.right){mario.vx=3.2;mario.facing=1}else mario.vx*=.8;
mario.x+=mario.vx;if(mario.x<0)mario.x=0;
var targetCam=Math.max(0,mario.x-120);camX+=(targetCam-camX)*.1;
mario.vy+=.5;mario.y+=mario.vy;mario.grounded=false;
platforms.forEach(function(p){if(mario.x+mario.w>p.x&&mario.x<p.x+p.w&&mario.y+mario.h>=p.y&&mario.y+mario.h-mario.vy<=p.y+8){mario.y=p.y-mario.h;mario.vy=0;mario.grounded=true}});
pipes.forEach(function(p){if(mario.x+mario.w>p.x&&mario.x<p.x+p.w&&mario.y+mario.h>=p.y&&mario.y+mario.h-mario.vy<=p.y+6){mario.y=p.y-mario.h;mario.vy=0;mario.grounded=true}else if(mario.x+mario.w>p.x&&mario.x<p.x+p.w&&mario.y<p.y+p.h&&mario.y+mario.h>p.y){if(mario.vx>0)mario.x=p.x-mario.w;else if(mario.vx<0)mario.x=p.x+p.w}});
coinsList.forEach(function(c){if(!c.collected&&Math.abs(c.x-mario.x)<16&&Math.abs(c.y-mario.y)<20){c.collected=true;coins++;score+=100;updateUI();sCoin()}});
enemies.forEach(function(en){if(!en.alive)return;en.x+=en.vx;if(en.x<en.rangeMin||en.x>en.rangeMax)en.vx*=-1;var box={x:en.x,y:en.y,w:en.w,h:en.h};if(overlap(mario,box)){if(mario.vy>0&&mario.y+mario.h-mario.vy<=en.y+9){en.alive=false;mario.vy=-7;score+=200;updateUI();sStomp()}else die()}});
if(mario.x>=goalX){score+=1000+lives*250;updateUI();state='win';sWin();hint.textContent='¡Nivel completado! Pulsa SALTAR para jugar otra vez.'}
if(mario.y>H+35)die();
}
function cloud(cx,cy){x.beginPath();x.arc(cx,cy,16,0,7);x.arc(cx+13,cy-8,20,0,7);x.arc(cx+29,cy,16,0,7);x.fill()}
function drawMario(mx){if(mario.inv>0&&Math.floor(mario.inv/5)%2===0)return;x.fillStyle='#5c2a00';x.fillRect(mx+2,mario.y+20,5,4);x.fillRect(mx+11,mario.y+20,5,4);x.fillStyle='#1646d8';x.fillRect(mx+3,mario.y+13,12,7);x.fillStyle='#fcbc32';x.fillRect(mx+4,mario.y+14,2,2);x.fillRect(mx+12,mario.y+14,2,2);x.fillStyle='#e52521';x.fillRect(mx+2,mario.y+8,14,6);x.fillStyle='#f8d080';if(mario.facing>0){x.fillRect(mx+9,mario.y+4,8,8);x.fillStyle='#5c2a00';x.fillRect(mx+15,mario.y+7,2,2)}else{x.fillStyle='#f8d080';x.fillRect(mx+1,mario.y+4,8,8);x.fillStyle='#5c2a00';x.fillRect(mx+1,mario.y+7,2,2)}x.fillStyle='#e52521';if(mario.facing>0){x.fillRect(mx+4,mario.y,12,5);x.fillRect(mx+12,mario.y+2,5,3)}else{x.fillRect(mx+2,mario.y,12,5);x.fillRect(mx+1,mario.y+2,5,3)}}
function overlay(title,subtitle,color){x.fillStyle='rgba(0,0,0,.72)';x.fillRect(0,0,W,H);x.textAlign='center';x.font='900 22px Arial';x.fillStyle=color;x.fillText(title,W/2,82);x.font='700 12px Arial';x.fillStyle='#fff';x.fillText(subtitle,W/2,118);x.font='700 11px Arial';x.fillStyle='#ffd75e';x.fillText('Pulsa SALTAR',W/2,151);x.textAlign='left'}
function draw(){x.setTransform(DPR,0,0,DPR,0,0);x.fillStyle='#5c94fc';x.fillRect(0,0,W,H);
x.fillStyle='rgba(255,255,255,.75)';var off=(camX*.3)%W;[80,240,380].forEach(function(cx,i){cloud((cx-off+W*2)%(W*1.5)-50,40+i*13)});
x.fillStyle='#00a800';[50,450,850,1250,1650,2050,2450].forEach(function(hx){var tx=hx-camX*.5;x.beginPath();x.moveTo(tx,200);x.lineTo(tx+40,130);x.lineTo(tx+80,200);x.fill()});
platforms.forEach(function(p){var px=p.x-camX;if(px+p.w<0||px>W)return;x.fillStyle='#c84c0c';x.fillRect(px,p.y,p.w,p.h);x.fillStyle='#fcbc32';x.fillRect(px,p.y,p.w,5)});
pipes.forEach(function(p){var px=p.x-camX;if(px+p.w<0||px>W)return;x.fillStyle='#00a800';x.fillRect(px+2,p.y+12,p.w-4,p.h-12);x.fillStyle='#00f800';x.fillRect(px+2,p.y+12,4,p.h-12);x.fillStyle='#00a800';x.fillRect(px,p.y,p.w,14);x.fillStyle='#00f800';x.fillRect(px,p.y,p.w,3);x.strokeStyle='#064e00';x.lineWidth=1.5;x.strokeRect(px,p.y,p.w,14);x.strokeRect(px+2,p.y+12,p.w-4,p.h-12)});
coinsList.forEach(function(c){if(c.collected)return;var cx=c.x-camX;if(cx<0||cx>W)return;x.fillStyle='#ffd700';x.beginPath();x.ellipse(cx,c.y,5,8,(frame*.1)%Math.PI,0,7);x.fill();x.strokeStyle='#cc8800';x.stroke()});
enemies.forEach(function(en){if(!en.alive)return;var ex=en.x-camX;if(ex<-24||ex>W)return;x.fillStyle='#8b4513';x.beginPath();x.arc(ex+10,en.y+10,10,Math.PI,0);x.fill();x.fillStyle='#f8d080';x.fillRect(ex+3,en.y+10,14,10);x.fillStyle='#000';x.fillRect(ex+5,en.y+12,3,4);x.fillRect(ex+12,en.y+12,3,4)});
var gx=goalX-camX;if(gx>-20&&gx<W+20){x.fillStyle='#e5e7eb';x.fillRect(gx,62,3,138);x.fillStyle='#22c55e';x.fillRect(gx+3,70,34,18);x.fillStyle='#fff';x.font='700 8px Arial';x.fillText('META',gx+7,82)}
drawMario(mario.x-camX);
if(state==='ready')overlay('SUPER MARIO','Mini plataformas · Ghost Nexora','#ff5757');
if(state==='dead')overlay('GAME OVER','Puntuación final: '+score,'#ff3333');
if(state==='win')overlay('¡NIVEL COMPLETADO!','Puntuación: '+score+' · Monedas: '+coins,'#4ade80');
}
function loop(){update();draw();requestAnimationFrame(loop)}
resetWorld(false);requestAnimationFrame(loop);
})();
</script>`
}
