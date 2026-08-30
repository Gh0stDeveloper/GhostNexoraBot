/** Space Dodge — canvas HTML */
export function buildSpaceDodgeHtml(): string {
  return `<style>*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}</style>
<body style="margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation">
<div style="width:100%;max-width:620px;margin:auto;box-sizing:border-box">
<div style="position:relative;width:100%;aspect-ratio:16/9;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden">
<canvas id="g" width="480" height="270" style="position:absolute;inset:0;width:100%;height:100%;display:block;background:#050814"></canvas>
<div style="position:absolute;top:8px;left:12px;pointer-events:none;text-shadow:0 1px 4px #000">
<div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.65)">GHOST NEXORA</div>
<div style="font-size:14px;font-weight:bold;color:#fff">Space Dodge</div>
</div>
<div style="position:absolute;top:8px;right:12px;text-align:right;pointer-events:none;text-shadow:0 1px 4px #000">
<div id="sc" style="font-size:15px;font-weight:bold">0</div>
<div id="bt" style="font-size:9px;color:rgba(255,255,255,.75)">BEST 0</div>
</div>
<div id="st" style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:9px;color:rgba(255,255,255,.8);pointer-events:none;text-shadow:0 1px 4px #000">Toca izq/der o usa ◀ ▶</div>
<div style="position:absolute;bottom:6px;left:6px;right:6px;display:flex;justify-content:space-between;pointer-events:none">
<button id="L" style="pointer-events:auto;width:44px;height:32px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(0,0,0,.45);color:#fff">◀</button>
<button id="R" style="pointer-events:auto;width:44px;height:32px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(0,0,0,.45);color:#fff">▶</button>
</div>
</div></div>
<script>
const c=document.getElementById('g'),x=c.getContext('2d'),sc=document.getElementById('sc'),bt=document.getElementById('bt'),st=document.getElementById('st');
const W=c.width,H=c.height;
function lb(){let v=[];try{const a=localStorage.getItem('sd_best');if(a)v.push(+a)}catch(e){}return v.length?Math.max(...v):0}
function sb(v){try{localStorage.setItem('sd_best',String(v))}catch(e){}}
let best=lb(),ship,rocks,stars,score,spd,alive,keys={l:0,r:0},shake=0,t=0;
function reset(){ship={x:W/2,y:H-36,w:22,h:18};rocks=[];stars=[];for(let i=0;i<40;i++)stars.push({x:Math.random()*W,y:Math.random()*H,s:.4+Math.random()*1.2,v:.4+Math.random()*1.2});score=0;spd=2.2;alive=true;shake=0;t=0;sc.textContent='0';bt.textContent='BEST '+best;st.textContent='Toca izq/der o usa ◀ ▶'}
function spawn(){const r=10+Math.random()*14;rocks.push({x:r+Math.random()*(W-2*r),y:-r,r,v:spd*(.7+Math.random()*.6),rot:Math.random()*6,vr:(Math.random()-.5)*.1})}
function hit(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.hypot(dx,dy)<a.r+12}
function loop(){
t++;
if(alive){
if(keys.l)ship.x-=4.2;if(keys.r)ship.x+=4.2;
ship.x=Math.max(14,Math.min(W-14,ship.x));
if(t%Math.max(12,38-Math.floor(score/80))===0)spawn();
rocks.forEach(o=>{o.y+=o.v;o.rot+=o.vr});
rocks=rocks.filter(o=>o.y<H+40);
for(const o of rocks){if(hit({x:ship.x,y:ship.y,r:10},o)){alive=false;shake=12;if(score>best){best=Math.floor(score);sb(best)}}}
score+=.15+spd*.02;spd=Math.min(7,spd+.0008);
sc.textContent=String(Math.floor(score));bt.textContent='BEST '+best;
st.textContent='Velocidad '+spd.toFixed(1)+'x'
}else st.textContent='GAME OVER · Toca para reiniciar';
if(shake>0)shake=Math.max(0,shake-.5);
stars.forEach(s=>{s.y+=s.v;if(s.y>H){s.y=0;s.x=Math.random()*W}});
x.clearRect(0,0,W,H);x.save();
if(shake)x.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
x.fillStyle='#050814';x.fillRect(0,0,W,H);
stars.forEach(s=>{x.fillStyle='rgba(255,255,255,'+(.3+s.s*.2)+')';x.fillRect(s.x,s.y,s.s,s.s)});
rocks.forEach(o=>{x.save();x.translate(o.x,o.y);x.rotate(o.rot);x.fillStyle='#8b7355';x.beginPath();for(let i=0;i<6;i++){const a=i/6*Math.PI*2,rr=o.r*(.75+.25*Math.sin(i*2));x[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();x.restore()});
x.fillStyle='#6c9eff';x.beginPath();x.moveTo(ship.x,ship.y-ship.h/2);x.lineTo(ship.x-ship.w/2,ship.y+ship.h/2);x.lineTo(ship.x+ship.w/2,ship.y+ship.h/2);x.closePath();x.fill();
x.fillStyle='#9ec5ff';x.fillRect(ship.x-3,ship.y+2,6,8);
if(!alive){x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font='bold 22px Arial';x.fillText('GAME OVER',W/2,H/2-6);x.font='12px Arial';x.fillText('Puntos '+Math.floor(score)+' · Toca para reiniciar',W/2,H/2+16);x.textAlign='left'}
x.restore();requestAnimationFrame(loop)
}
function bind(id,k){const b=document.getElementById(id);const d=e=>{e.preventDefault();keys[k]=1};const u=e=>{e.preventDefault();keys[k]=0};b.addEventListener('touchstart',d,{passive:false});b.addEventListener('touchend',u,{passive:false});b.addEventListener('mousedown',d);b.addEventListener('mouseup',u);b.addEventListener('mouseleave',u)}
bind('L','l');bind('R','r');
c.addEventListener('pointerdown',e=>{if(!alive){reset();return}const r=c.getBoundingClientRect();const px=(e.clientX-r.left)/r.width*W;keys.l=px<W/2?1:0;keys.r=px>=W/2?1:0});
c.addEventListener('pointerup',()=>{keys.l=0;keys.r=0});
c.addEventListener('pointerleave',()=>{keys.l=0;keys.r=0});
window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='a')keys.l=1;if(e.key==='ArrowRight'||e.key==='d')keys.r=1});
window.addEventListener('keyup',e=>{if(e.key==='ArrowLeft'||e.key==='a')keys.l=0;if(e.key==='ArrowRight'||e.key==='d')keys.r=0});
reset();requestAnimationFrame(loop);
</script></body>`
}
