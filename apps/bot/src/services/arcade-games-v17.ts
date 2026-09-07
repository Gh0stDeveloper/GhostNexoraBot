/**
 * Arcade V17 · juegos HTML autocontenidos para WhatsApp.
 * Sin red, assets remotos ni librerías externas.
 */

const shell = (title: string, body: string, script: string) => `
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
html,body{margin:0;background:#070910;color:#f7f9ff;font-family:Arial,system-ui,sans-serif;overscroll-behavior:none}
body{padding:10px;touch-action:none}
.gn17{max-width:620px;margin:0 auto;border:1px solid #283248;border-radius:18px;overflow:hidden;background:linear-gradient(180deg,#121827,#080b12);box-shadow:0 14px 42px rgba(0,0,0,.45)}
.gn17h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #263047;background:#111725}.gn17brand{font-size:9px;letter-spacing:1.6px;color:#6ee7ff}.gn17title{font-weight:900;font-size:19px;margin-top:2px}.gn17stat{text-align:right;font-size:11px;color:#9ca8bd}.gn17stat strong{display:block;color:#fff;font-size:17px}
.gn17b{padding:12px}.gn17 canvas{display:block;width:100%;height:auto;border:1px solid #27334b;border-radius:12px;background:#03050a;touch-action:none}.row{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.btn{min-width:50px;min-height:44px;border:1px solid #3a4965;border-radius:11px;background:#1d2738;color:#fff;padding:9px 14px;font-weight:800;font-size:14px;touch-action:none}.btn:active{transform:scale(.96);background:#293750}.primary{background:#245fe8;border-color:#4f83ff}.danger{background:#ad3448;border-color:#e25368}.note{text-align:center;color:#8995a9;font-size:11px;line-height:1.4;margin-top:9px}.grid2048{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-width:430px;margin:auto;background:#121827;border:1px solid #283650;padding:7px;border-radius:13px}.tile2048{aspect-ratio:1;display:grid;place-items:center;border-radius:9px;background:#1d2738;font-weight:900;font-size:22px}.memory{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;max-width:430px;margin:auto}.mem{aspect-ratio:1;border:1px solid #364862;border-radius:10px;background:#172235;color:#fff;font-size:24px;font-weight:900;touch-action:none}.mem.open,.mem.done{background:#183d52;border-color:#52d8ff}
</style>
<div class="gn17"><div class="gn17h"><div><div class="gn17brand">GHOST NEXORA ARCADE V17</div><div class="gn17title">${title}</div></div><div id="stat" class="gn17stat"></div></div><div class="gn17b">${body}</div></div>
<script>(function(){'use strict';${script}})();</script>`

export function buildFlappyGameHtml(): string {
  const body = `<canvas id="g" width="360" height="480"></canvas><div class="row"><button id="jump" class="btn primary">SALTAR</button><button id="restart" class="btn">REINICIAR</button></div><div class="note">Toca SALTAR o el área de juego · Cruza entre los obstáculos</div>`
  const script = `
var c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('stat'),bird,pipes,score,over,tick;
function reset(){bird={x:78,y:220,v:0};pipes=[];score=0;over=false;tick=0;draw()}
function flap(){if(over){reset();return}bird.v=-6.8}
function addPipe(){var gap=118,top=55+Math.random()*220;pipes.push({x:380,top:top,gap:gap,pass:false})}
function draw(){x.fillStyle='#06111e';x.fillRect(0,0,c.width,c.height);var grd=x.createLinearGradient(0,0,0,480);grd.addColorStop(0,'#0b2c4a');grd.addColorStop(1,'#071018');x.fillStyle=grd;x.fillRect(0,0,c.width,c.height);x.fillStyle='#173d2d';x.fillRect(0,454,360,26);pipes.forEach(function(p){x.fillStyle='#32d17d';x.fillRect(p.x,0,48,p.top);x.fillRect(p.x,p.top+p.gap,48,454-(p.top+p.gap));x.fillStyle='#66f0a5';x.fillRect(p.x-4,p.top-12,56,12);x.fillRect(p.x-4,p.top+p.gap,56,12)});x.fillStyle='#ffd63d';x.beginPath();x.arc(bird.x,bird.y,12,0,7);x.fill();x.fillStyle='#ff8a2b';x.beginPath();x.moveTo(bird.x+10,bird.y);x.lineTo(bird.x+22,bird.y-4);x.lineTo(bird.x+10,bird.y+5);x.fill();x.fillStyle='#fff';x.beginPath();x.arc(bird.x+4,bird.y-5,3,0,7);x.fill();if(over){x.fillStyle='rgba(0,0,0,.66)';x.fillRect(0,0,360,480);x.fillStyle='#fff';x.textAlign='center';x.font='bold 28px Arial';x.fillText('GAME OVER',180,225);x.font='14px Arial';x.fillText('Toca SALTAR para volver a jugar',180,252);x.textAlign='left'}st.innerHTML='<strong>'+score+'</strong>PUNTOS'}
function frame(){if(!over){tick++;bird.v+=.38;bird.y+=bird.v;if(tick%92===0)addPipe();pipes.forEach(function(p){p.x-=2.6;if(!p.pass&&p.x+48<bird.x){p.pass=true;score++}if(bird.x+11>p.x&&bird.x-11<p.x+48&&(bird.y-11<p.top||bird.y+11>p.top+p.gap))over=true});pipes=pipes.filter(function(p){return p.x>-60});if(bird.y<0||bird.y>442)over=true}draw();requestAnimationFrame(frame)}
document.getElementById('jump').addEventListener('pointerdown',function(e){e.preventDefault();flap()});document.getElementById('restart').addEventListener('pointerdown',function(e){e.preventDefault();reset()});c.addEventListener('pointerdown',function(e){e.preventDefault();flap()});document.addEventListener('keydown',function(e){if(e.code==='Space'||e.key==='ArrowUp'){e.preventDefault();flap()}});reset();requestAnimationFrame(frame);`
  return shell('Flappy · Sky Run', body, script)
}

export function buildBreakoutGameHtml(): string {
  const body = `<canvas id="g" width="520" height="360"></canvas><div class="row"><button class="btn" data-h="l">◀</button><button id="start" class="btn primary">INICIAR</button><button class="btn" data-h="r">▶</button></div><div class="note">Mantén ◀ ▶ para mover la barra · Rompe todos los bloques</div>`
  const script = `
var c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('stat'),p,b,bricks,run,keys={},score,lives;
function reset(){p={x:215,w:90};b={x:260,y:285,vx:3.2,vy:-3.2,r:7};bricks=[];for(var r=0;r<5;r++)for(var q=0;q<9;q++)bricks.push({x:19+q*55,y:38+r*24,w:49,h:17,on:true});score=0;lives=3;run=false;draw()}
function draw(){x.fillStyle='#050814';x.fillRect(0,0,520,360);bricks.forEach(function(o,i){if(!o.on)return;var hue=185+(i%5)*24;x.fillStyle='hsl('+hue+',80%,56%)';x.fillRect(o.x,o.y,o.w,o.h)});x.fillStyle='#eef4ff';x.fillRect(p.x,326,p.w,10);x.fillStyle='#ffef7a';x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fill();st.innerHTML='<strong>'+score+'</strong>VIDAS '+lives}
function hit(){bricks.forEach(function(o){if(o.on&&b.x>o.x&&b.x<o.x+o.w&&b.y-b.r<o.y+o.h&&b.y+b.r>o.y){o.on=false;b.vy*=-1;score+=10}});if(bricks.every(function(o){return !o.on})){run=false;score+=500}}
function frame(){if(keys.l)p.x=Math.max(0,p.x-6);if(keys.r)p.x=Math.min(520-p.w,p.x+6);if(run){b.x+=b.vx;b.y+=b.vy;if(b.x<b.r||b.x>520-b.r)b.vx*=-1;if(b.y<b.r)b.vy=Math.abs(b.vy);if(b.y>316&&b.y<340&&b.x>p.x&&b.x<p.x+p.w){b.vy=-Math.abs(b.vy);b.vx+=(b.x-(p.x+p.w/2))/38}hit();if(b.y>370){lives--;if(lives<=0){run=false}else{b.x=260;b.y=285;b.vx=3.2;b.vy=-3.2;run=false}}}draw();requestAnimationFrame(frame)}
document.querySelectorAll('[data-h]').forEach(function(el){var k=el.getAttribute('data-h');el.addEventListener('pointerdown',function(e){e.preventDefault();keys[k]=true});['pointerup','pointercancel','pointerleave'].forEach(function(n){el.addEventListener(n,function(){keys[k]=false})})});document.getElementById('start').addEventListener('pointerdown',function(e){e.preventDefault();if(lives<=0||bricks.every(function(o){return !o.on}))reset();run=true});reset();requestAnimationFrame(frame);`
  return shell('Breakout · Neon Bricks', body, script)
}

export function buildPongGameHtml(): string {
  const body = `<canvas id="g" width="520" height="320"></canvas><div class="row"><button class="btn" data-h="u">▲</button><button id="reset" class="btn primary">NUEVA</button><button class="btn" data-h="d">▼</button></div><div class="note">Mantén ▲ ▼ · Primero en llegar a 7 puntos gana</div>`
  const script = `
var c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('stat'),py,ay,b,ps,as,keys={};
function serve(dir){b={x:260,y:160,vx:dir*(3.5+Math.random()),vy:(Math.random()-.5)*5}}
function reset(){py=130;ay=130;ps=0;as=0;serve(Math.random()<.5?-1:1)}
function draw(){x.fillStyle='#030710';x.fillRect(0,0,520,320);x.strokeStyle='#24314b';x.setLineDash([8,10]);x.beginPath();x.moveTo(260,0);x.lineTo(260,320);x.stroke();x.setLineDash([]);x.fillStyle='#62e6ff';x.fillRect(18,py,10,62);x.fillStyle='#b783ff';x.fillRect(492,ay,10,62);x.fillStyle='#fff';x.beginPath();x.arc(b.x,b.y,7,0,7);x.fill();x.font='bold 28px Arial';x.fillText(ps,210,38);x.fillText(as,295,38);st.innerHTML='<strong>'+ps+' : '+as+'</strong>MARCADOR'}
function frame(){if(keys.u)py=Math.max(0,py-5.5);if(keys.d)py=Math.min(258,py+5.5);ay+=((b.y-31)-ay)*.055;ay=Math.max(0,Math.min(258,ay));b.x+=b.vx;b.y+=b.vy;if(b.y<7||b.y>313)b.vy*=-1;if(b.x<35&&b.x>15&&b.y>py&&b.y<py+62){b.vx=Math.abs(b.vx)*1.04;b.vy+=(b.y-(py+31))*.035}if(b.x>485&&b.x<505&&b.y>ay&&b.y<ay+62){b.vx=-Math.abs(b.vx)*1.04;b.vy+=(b.y-(ay+31))*.035}if(b.x<-10){as++;serve(1)}if(b.x>530){ps++;serve(-1)}if(ps>=7||as>=7){ps=0;as=0;serve(Math.random()<.5?-1:1)}draw();requestAnimationFrame(frame)}
document.querySelectorAll('[data-h]').forEach(function(el){var k=el.getAttribute('data-h');el.addEventListener('pointerdown',function(e){e.preventDefault();keys[k]=true});['pointerup','pointercancel','pointerleave'].forEach(function(n){el.addEventListener(n,function(){keys[k]=false})})});document.getElementById('reset').addEventListener('pointerdown',function(e){e.preventDefault();reset()});reset();requestAnimationFrame(frame);`
  return shell('Pong · Cyber Duel', body, script)
}

export function build2048GameHtml(): string {
  const body = `<div id="board" class="grid2048"></div><div class="row"><button class="btn" data-d="up">▲</button></div><div class="row"><button class="btn" data-d="left">◀</button><button id="new" class="btn primary">NUEVO</button><button class="btn" data-d="right">▶</button></div><div class="row"><button class="btn" data-d="down">▼</button></div><div class="note">Une números iguales · Llega a 2048 o supera tu récord</div>`
  const script = `
var board=document.getElementById('board'),st=document.getElementById('stat'),a,score;
function empty(){var z=[];for(var i=0;i<16;i++)if(!a[i])z.push(i);return z}function add(){var z=empty();if(!z.length)return;a[z[Math.floor(Math.random()*z.length)]]=Math.random()<.9?2:4}
function reset(){a=Array(16).fill(0);score=0;add();add();render()}
function pack(line){var b=line.filter(Boolean),o=[];for(var i=0;i<b.length;i++){if(b[i]===b[i+1]){var v=b[i]*2;o.push(v);score+=v;i++}else o.push(b[i])}while(o.length<4)o.push(0);return o}
function move(dir){var old=a.join(',');for(var n=0;n<4;n++){var line=[];for(var k=0;k<4;k++){var r=dir==='up'||dir==='down'?k:n,c=dir==='up'||dir==='down'?n:k;line.push(a[r*4+c])}if(dir==='right'||dir==='down')line.reverse();line=pack(line);if(dir==='right'||dir==='down')line.reverse();for(var k=0;k<4;k++){var r=dir==='up'||dir==='down'?k:n,c=dir==='up'||dir==='down'?n:k;a[r*4+c]=line[k]}}if(a.join(',')!==old)add();render()}
function render(){board.innerHTML='';a.forEach(function(v){var d=document.createElement('div');d.className='tile2048';d.textContent=v||'';var light=Math.min(70,24+(Math.log2(v||2))*5);d.style.background=v?'hsl('+(190+Math.log2(v)*18)+',65%,'+light+'%)':'#182235';d.style.color=v>=8?'#071018':'#fff';board.appendChild(d)});st.innerHTML='<strong>'+score+'</strong>PUNTOS'}
document.querySelectorAll('[data-d]').forEach(function(el){el.addEventListener('pointerdown',function(e){e.preventDefault();move(this.getAttribute('data-d'))})});document.getElementById('new').addEventListener('pointerdown',function(e){e.preventDefault();reset()});document.addEventListener('keydown',function(e){var m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.key];if(m){e.preventDefault();move(m)}});reset();`
  return shell('2048 · Neon Merge', body, script)
}

export function buildAsteroidsGameHtml(): string {
  const body = `<canvas id="g" width="540" height="360"></canvas><div class="row"><button class="btn" data-h="l">↶</button><button class="btn" data-h="th">▲</button><button id="fire" class="btn danger">DISPARAR</button><button class="btn" data-h="r">↷</button></div><div class="note">Gira, acelera y dispara · Todo el mapa hace wrap</div>`
  const script = `
var c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('stat'),p,rocks,shots,keys={},score,lives,tick;
function rock(big){var edge=Math.floor(Math.random()*4),q={x:Math.random()*540,y:Math.random()*360,r:big?24:13,vx:(Math.random()-.5)*2.2,vy:(Math.random()-.5)*2.2};if(edge===0)q.y=0;if(edge===1)q.x=539;if(edge===2)q.y=359;if(edge===3)q.x=0;return q}
function reset(){p={x:270,y:180,a:-1.57,vx:0,vy:0,cd:0};rocks=[rock(true),rock(true),rock(true),rock(true)];shots=[];score=0;lives=3;tick=0}
function wrap(o){if(o.x<0)o.x+=540;if(o.x>540)o.x-=540;if(o.y<0)o.y+=360;if(o.y>360)o.y-=360}
function fire(){if(p.cd>0)return;p.cd=12;shots.push({x:p.x+Math.cos(p.a)*17,y:p.y+Math.sin(p.a)*17,vx:Math.cos(p.a)*7,vy:Math.sin(p.a)*7,t:70})}
function draw(){x.fillStyle='#030611';x.fillRect(0,0,540,360);x.fillStyle='#fff';for(var i=0;i<45;i++)x.fillRect((i*73)%540,(i*41)%360,1,1);x.save();x.translate(p.x,p.y);x.rotate(p.a);x.strokeStyle='#6ee7ff';x.lineWidth=2;x.beginPath();x.moveTo(17,0);x.lineTo(-12,-10);x.lineTo(-7,0);x.lineTo(-12,10);x.closePath();x.stroke();x.restore();x.strokeStyle='#b693ff';rocks.forEach(function(q){x.beginPath();x.arc(q.x,q.y,q.r,0,7);x.stroke()});x.fillStyle='#ffea7a';shots.forEach(function(s){x.beginPath();x.arc(s.x,s.y,2.5,0,7);x.fill()});st.innerHTML='<strong>'+score+'</strong>VIDAS '+lives}
function frame(){tick++;if(keys.l)p.a-=.065;if(keys.r)p.a+=.065;if(keys.th){p.vx+=Math.cos(p.a)*.09;p.vy+=Math.sin(p.a)*.09}p.vx*=.995;p.vy*=.995;p.x+=p.vx;p.y+=p.vy;wrap(p);if(p.cd>0)p.cd--;rocks.forEach(function(q){q.x+=q.vx;q.y+=q.vy;wrap(q);if(Math.hypot(q.x-p.x,q.y-p.y)<q.r+10){lives--;p.x=270;p.y=180;p.vx=p.vy=0;q.x=-1000;if(lives<=0)reset()}});shots.forEach(function(s){s.x+=s.vx;s.y+=s.vy;wrap(s);s.t--});shots.forEach(function(s){rocks.forEach(function(q){if(q.r>0&&Math.hypot(s.x-q.x,s.y-q.y)<q.r){s.t=0;score+=q.r>18?25:10;if(q.r>18){var a={x:q.x,y:q.y,r:12,vx:-q.vy*1.3,vy:q.vx*1.3},b={x:q.x,y:q.y,r:12,vx:q.vy*1.3,vy:-q.vx*1.3};rocks.push(a,b)}q.r=0}})});shots=shots.filter(function(s){return s.t>0});rocks=rocks.filter(function(q){return q.r>0&&q.x>-900});if(rocks.length<3)rocks.push(rock(true));draw();requestAnimationFrame(frame)}
document.querySelectorAll('[data-h]').forEach(function(el){var k=el.getAttribute('data-h');el.addEventListener('pointerdown',function(e){e.preventDefault();keys[k]=true});['pointerup','pointercancel','pointerleave'].forEach(function(n){el.addEventListener(n,function(){keys[k]=false})})});document.getElementById('fire').addEventListener('pointerdown',function(e){e.preventDefault();fire()});reset();requestAnimationFrame(frame);`
  return shell('Asteroids · Void Patrol', body, script)
}

export function buildMemoryGameHtml(): string {
  const body = `<div id="memory" class="memory"></div><div class="row"><button id="new" class="btn primary">NUEVA PARTIDA</button></div><div class="note">Encuentra las 8 parejas · Memoriza la posición de cada símbolo</div>`
  const script = `
var root=document.getElementById('memory'),st=document.getElementById('stat'),cards,open=[],moves=0,done=0,lock=false;var icons=['★','◆','●','▲','☂','♫','☯','✦'];
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function reset(){cards=shuffle(icons.concat(icons).map(function(v,i){return{v:v,id:i,show:false,done:false}}));open=[];moves=0;done=0;lock=false;render()}
function tap(i){if(lock||cards[i].done||cards[i].show)return;cards[i].show=true;open.push(i);render();if(open.length===2){moves++;var a=open[0],b=open[1];if(cards[a].v===cards[b].v){cards[a].done=cards[b].done=true;done+=2;open=[];render()}else{lock=true;setTimeout(function(){cards[a].show=cards[b].show=false;open=[];lock=false;render()},650)}}}
function render(){root.innerHTML='';cards.forEach(function(q,i){var b=document.createElement('button');b.className='mem'+(q.show?' open':'')+(q.done?' done':'');b.textContent=q.show||q.done?q.v:'?';b.addEventListener('pointerdown',function(e){e.preventDefault();tap(i)});root.appendChild(b)});st.innerHTML='<strong>'+moves+'</strong>MOVIMIENTOS'+(done===16?'<br>COMPLETADO':'')}
document.getElementById('new').addEventListener('pointerdown',function(e){e.preventDefault();reset()});reset();`
  return shell('Memoria · Cyber Match', body, script)
}
