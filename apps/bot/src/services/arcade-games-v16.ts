/**
 * Juegos arcade autocontenidos para el HTML Primitive de WhatsApp.
 * No usan red, imágenes externas ni librerías de terceros.
 */

const shell = (title: string, body: string, script: string) => `
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
html,body{margin:0;background:#090b10;color:#f6f7fb;font-family:Arial,system-ui,sans-serif;overscroll-behavior:none}
body{padding:10px;touch-action:none}
.gn-wrap{max-width:620px;margin:0 auto;background:linear-gradient(180deg,#131722,#0b0e14);border:1px solid #282e3a;border-radius:18px;overflow:hidden;box-shadow:0 12px 38px rgba(0,0,0,.45)}
.gn-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid #272d38;background:#151a24}
.gn-brand{font-size:9px;letter-spacing:1.6px;color:#7f8998}.gn-title{font-size:19px;font-weight:800;margin-top:2px}.gn-stat{text-align:right;font-size:12px;color:#aab2c0}.gn-stat strong{display:block;color:#fff;font-size:17px}
.gn-body{padding:12px}.gn-canvas{display:block;width:100%;height:auto;border:1px solid #2b3340;border-radius:12px;background:#05070b;touch-action:none}
.gn-row{display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;flex-wrap:wrap}.gn-btn{border:1px solid #384252;background:#202734;color:#fff;border-radius:11px;min-width:48px;min-height:44px;padding:9px 13px;font-weight:800;font-size:15px;touch-action:none;-webkit-user-select:none!important;user-select:none!important}.gn-btn:active{transform:scale(.96);background:#2c3545}.gn-primary{background:#315ee8;border-color:#416ef5}.gn-danger{background:#b63743;border-color:#d34a57}.gn-note{text-align:center;color:#8e98a8;font-size:11px;margin-top:9px;line-height:1.35}
</style>
<div class="gn-wrap">
  <div class="gn-head"><div><div class="gn-brand">GHOST NEXORA ARCADE</div><div class="gn-title">${title}</div></div><div class="gn-stat" id="gnStat"></div></div>
  <div class="gn-body">${body}</div>
</div>
<script>
(function(){
'use strict';
function stopNative(e){if(e&&e.cancelable)e.preventDefault()}
['contextmenu','selectstart','dragstart'].forEach(function(name){document.addEventListener(name,stopNative,{capture:true,passive:false})});
document.addEventListener('touchstart',function(e){var t=e.target;if(t&&t.closest&&t.closest('.gn-btn,.gn-canvas,.gn-game-control'))stopNative(e)},{capture:true,passive:false});
document.addEventListener('touchmove',function(e){var t=e.target;if(t&&t.closest&&t.closest('.gn-btn,.gn-canvas,.gn-game-control'))stopNative(e)},{capture:true,passive:false});
${script}
})();
</script>`

export function buildPacmanGameHtml(): string {
  const body = `<canvas id="game" class="gn-canvas" width="456" height="360"></canvas>
<div class="gn-row"><button class="gn-btn" data-dir="0,-1">▲</button></div>
<div class="gn-row"><button class="gn-btn" data-dir="-1,0">◀</button><button class="gn-btn gn-primary" id="restart">●</button><button class="gn-btn" data-dir="1,0">▶</button></div>
<div class="gn-row"><button class="gn-btn" data-dir="0,1">▼</button></div>
<div class="gn-note">Come todos los puntos · Evita los fantasmas · Desliza o usa los controles</div>`
  const script = `
var cv=document.getElementById('game'),g=cv.getContext('2d'),stat=document.getElementById('gnStat');
var raw=['###################','#........#........#','#.###.##.#.##.###.#','#o###.##.#.##.###o#','#.................#','#.###.#.###.#.###.#','#.....#..#..#.....#','#####.## # ##.#####','    #.#     #.#    ','#####.# ### #.#####','     .  # #  .     ','#####.# ### #.#####','    #.#     #.#    ','#####.#.###.#.#####','#........#........#','#.###.##.#.##.###.#','#o..#....P....#..o#','##.#.#.###.#.#.#.##','#.....#..#..#.....#','###################'];
var ts=24,rows=raw.length,cols=raw[0].length,map=[],pac,ghosts,dir,next,score,lives,over,lastMove,fright;
function init(){map=raw.map(function(r){return r.split('')});for(var y=0;y<rows;y++)for(var x=0;x<cols;x++)if(map[y][x]=='P'){pac={x:x,y:y};map[y][x]=' '}dir={x:0,y:0};next={x:0,y:0};score=0;lives=3;over=false;fright=0;ghosts=[{x:9,y:8,c:'#ff4d67',d:{x:1,y:0}},{x:8,y:10,c:'#58d8ff',d:{x:-1,y:0}},{x:10,y:10,c:'#ff9de1',d:{x:1,y:0}}];lastMove=0;draw()}
function wall(x,y){return y<0||y>=rows||x<0||x>=cols||map[y][x]=='#'}
function can(p,d){return !wall(p.x+d.x,p.y+d.y)}
function setDir(x,y){next={x:x,y:y}}
function movePac(){if(can(pac,next))dir=next;if(can(pac,dir)){pac.x+=dir.x;pac.y+=dir.y}var c=map[pac.y][pac.x];if(c=='.'){map[pac.y][pac.x]=' ';score+=10}else if(c=='o'){map[pac.y][pac.x]=' ';score+=50;fright=45}var left=0;for(var y=0;y<rows;y++)for(var x=0;x<cols;x++)if(map[y][x]=='.'||map[y][x]=='o')left++;if(!left){score+=500;over=true}}
function ghostMove(q){var opts=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].filter(function(d){return !wall(q.x+d.x,q.y+d.y)});if(!opts.length)return;opts.sort(function(a,b){var da=Math.abs((q.x+a.x)-pac.x)+Math.abs((q.y+a.y)-pac.y),db=Math.abs((q.x+b.x)-pac.x)+Math.abs((q.y+b.y)-pac.y);return fright>0?db-da:da-db});var pick=Math.random()<.7?opts[0]:opts[Math.floor(Math.random()*opts.length)];q.d=pick;q.x+=pick.x;q.y+=pick.y}
function collide(){ghosts.forEach(function(q){if(q.x==pac.x&&q.y==pac.y){if(fright>0){score+=200;q.x=9;q.y=8}else{lives--;pac.x=9;pac.y=16;dir={x:0,y:0};next={x:0,y:0};if(lives<=0)over=true}}})}
function draw(){g.fillStyle='#03050a';g.fillRect(0,0,cv.width,cv.height);var ox=0,oy=-60;for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){var c=map[y][x],px=ox+x*ts,py=oy+y*ts;if(c=='#'){g.fillStyle='#173a9b';g.fillRect(px+1,py+1,ts-2,ts-2);g.strokeStyle='#4f7cff';g.strokeRect(px+3,py+3,ts-6,ts-6)}else if(c=='.'){g.fillStyle='#ffe7b0';g.beginPath();g.arc(px+12,py+12,2.2,0,7);g.fill()}else if(c=='o'){g.fillStyle='#fff3cf';g.beginPath();g.arc(px+12,py+12,5,0,7);g.fill()}}
var px=pac.x*ts+12,py=oy+pac.y*ts+12;g.fillStyle='#ffd633';g.beginPath();g.arc(px,py,10,0.22,Math.PI*2-.22);g.lineTo(px,py);g.fill();ghosts.forEach(function(q){var gx=q.x*ts+12,gy=oy+q.y*ts+12;g.fillStyle=fright>0?'#465cff':q.c;g.beginPath();g.arc(gx,gy-2,9,Math.PI,0);g.lineTo(gx+9,gy+9);g.lineTo(gx+4,gy+5);g.lineTo(gx,gy+9);g.lineTo(gx-4,gy+5);g.lineTo(gx-9,gy+9);g.closePath();g.fill();g.fillStyle='#fff';g.fillRect(gx-5,gy-4,3,4);g.fillRect(gx+2,gy-4,3,4)});if(over){g.fillStyle='rgba(0,0,0,.7)';g.fillRect(0,0,cv.width,cv.height);g.fillStyle='#fff';g.textAlign='center';g.font='bold 25px Arial';g.fillText(lives>0?'¡LABERINTO COMPLETADO!':'GAME OVER',cv.width/2,170);g.font='14px Arial';g.fillText('Toca ● para reiniciar',cv.width/2,198);g.textAlign='left'}stat.innerHTML='<strong>'+score+'</strong>VIDAS '+lives}
function frame(t){if(!over&&t-lastMove>145){lastMove=t;movePac();ghosts.forEach(ghostMove);collide();if(fright>0)fright--;draw()}requestAnimationFrame(frame)}
document.querySelectorAll('[data-dir]').forEach(function(b){b.addEventListener('pointerdown',function(e){e.preventDefault();var a=this.getAttribute('data-dir').split(',');setDir(+a[0],+a[1])})});document.getElementById('restart').addEventListener('pointerdown',function(e){e.preventDefault();init()});
var sx=0,sy=0;cv.addEventListener('pointerdown',function(e){sx=e.clientX;sy=e.clientY});cv.addEventListener('pointerup',function(e){var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)>Math.abs(dy))setDir(dx>0?1:-1,0);else setDir(0,dy>0?1:-1)});document.addEventListener('keydown',function(e){var d={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(d){e.preventDefault();setDir(d[0],d[1])}});init();requestAnimationFrame(frame);`
  return shell('Pac-Man · Laberinto', body, script)
}

export function buildMinesweeperGameHtml(): string {
  const body = `<div id="mineBoard" class="gn-game-control" style="display:grid;grid-template-columns:repeat(9,1fr);gap:3px;max-width:460px;margin:0 auto;touch-action:none"></div>
<div class="gn-row"><button class="gn-btn gn-primary" id="revealMode">Descubrir</button><button class="gn-btn" id="flagMode">Bandera</button><button class="gn-btn" id="mineNew">Nuevo</button></div>
<div class="gn-note">9 × 9 · 10 minas · Usa “Bandera” para marcar sin mantener pulsado</div>`
  const script = `
var board=document.getElementById('mineBoard'),stat=document.getElementById('gnStat'),mode='reveal',W=9,H=9,N=10,cells=[],started=false,over=false,flags=0,revealed=0;
function make(){cells=Array.from({length:W*H},function(){return{m:false,n:0,r:false,f:false}});started=false;over=false;flags=0;revealed=0;mode='reveal';document.getElementById('revealMode').classList.add('gn-primary');document.getElementById('flagMode').classList.remove('gn-primary');render()}
function seed(safe){var p=[];for(var i=0;i<cells.length;i++)if(i!=safe&&Math.abs((i%W)-(safe%W))+Math.abs(Math.floor(i/W)-Math.floor(safe/W))>1)p.push(i);for(var n=0;n<N;n++){var k=Math.floor(Math.random()*p.length),idx=p.splice(k,1)[0];cells[idx].m=true}for(var i=0;i<cells.length;i++){var x=i%W,y=Math.floor(i/W),count=0;for(var yy=y-1;yy<=y+1;yy++)for(var xx=x-1;xx<=x+1;xx++)if(xx>=0&&yy>=0&&xx<W&&yy<H&&cells[yy*W+xx].m)count++;cells[i].n=count}started=true}
function flood(i){var c=cells[i];if(!c||c.r||c.f)return;c.r=true;revealed++;if(c.n===0&&!c.m){var x=i%W,y=Math.floor(i/W);for(var yy=y-1;yy<=y+1;yy++)for(var xx=x-1;xx<=x+1;xx++)if(xx>=0&&yy>=0&&xx<W&&yy<H)flood(yy*W+xx)}}
function tap(i){if(over)return;if(!started)seed(i);var c=cells[i];if(mode=='flag'){if(c.r)return;c.f=!c.f;flags+=c.f?1:-1;render();return}if(c.f)return;if(c.m){c.r=true;over=true;cells.forEach(function(q){if(q.m)q.r=true});render();return}flood(i);if(revealed>=W*H-N)over=true;render()}
function render(){board.innerHTML='';cells.forEach(function(c,i){var b=document.createElement('button');b.className='gn-btn';b.style.minWidth='0';b.style.minHeight='38px';b.style.padding='0';b.style.borderRadius='7px';b.style.fontSize='14px';b.style.background=c.r?(c.m?'#b63f49':'#171d27'):'#2a3342';if(c.r)b.textContent=c.m?'✹':(c.n?String(c.n):'');else if(c.f)b.textContent='⚑';b.addEventListener('pointerdown',function(e){e.preventDefault();tap(i)});board.appendChild(b)});stat.innerHTML='<strong>'+(N-flags)+'</strong>MINAS'+(over?'<br>'+(revealed>=W*H-N?'GANASTE':'PERDISTE'):'')}
document.getElementById('revealMode').addEventListener('pointerdown',function(e){e.preventDefault();mode='reveal';this.classList.add('gn-primary');document.getElementById('flagMode').classList.remove('gn-primary')});document.getElementById('flagMode').addEventListener('pointerdown',function(e){e.preventDefault();mode='flag';this.classList.add('gn-primary');document.getElementById('revealMode').classList.remove('gn-primary')});document.getElementById('mineNew').addEventListener('pointerdown',function(e){e.preventDefault();make()});make();`
  return shell('Buscaminas', body, script)
}

export function buildHaloArenaGameHtml(): string {
  const body = `<canvas id="game" class="gn-canvas" width="560" height="340"></canvas>
<div class="gn-row"><button class="gn-btn" data-hold="up">▲</button></div>
<div class="gn-row"><button class="gn-btn" data-hold="left">◀</button><button class="gn-btn gn-danger" id="fire">DISPARAR</button><button class="gn-btn" data-hold="right">▶</button></div>
<div class="gn-row"><button class="gn-btn" data-hold="down">▼</button></div>
<div class="gn-note">Arena sci-fi original · Mantén movimiento y disparo · El escudo se regenera</div>`
  const script = `
var cv=document.getElementById('game'),g=cv.getContext('2d'),stat=document.getElementById('gnStat'),keys={},p,enemies,shots,score,wave,last,spawn,over;
function reset(){p={x:280,y:170,r:12,hp:100,shield:100,cd:0,ang:0};enemies=[];shots=[];score=0;wave=1;last=0;spawn=0;over=false;draw()}
function addEnemy(){var side=Math.floor(Math.random()*4),q={x:0,y:0,r:10,hp:20+wave*4,s:1.0+wave*.08};if(side==0){q.x=Math.random()*560;q.y=-15}else if(side==1){q.x=575;q.y=Math.random()*340}else if(side==2){q.x=Math.random()*560;q.y=355}else{q.x=-15;q.y=Math.random()*340}enemies.push(q)}
function shoot(){if(over){reset();return}if(p.cd>0)return;p.cd=8;var target=enemies.slice().sort(function(a,b){return Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)})[0];var a=target?Math.atan2(target.y-p.y,target.x-p.x):p.ang;p.ang=a;shots.push({x:p.x,y:p.y,vx:Math.cos(a)*8,vy:Math.sin(a)*8})}
function step(dt){if(over)return;var vx=(keys.right?1:0)-(keys.left?1:0),vy=(keys.down?1:0)-(keys.up?1:0),m=Math.hypot(vx,vy)||1;p.x=Math.max(14,Math.min(546,p.x+vx/m*3.4*dt));p.y=Math.max(14,Math.min(326,p.y+vy/m*3.4*dt));if(p.cd>0)p.cd-=dt;p.shield=Math.min(100,p.shield+.08*dt);spawn-=dt;if(spawn<=0){addEnemy();spawn=Math.max(12,42-wave*2)+Math.random()*24}shots.forEach(function(s){s.x+=s.vx*dt;s.y+=s.vy*dt});shots=shots.filter(function(s){return s.x>-20&&s.x<580&&s.y>-20&&s.y<360});enemies.forEach(function(q){var a=Math.atan2(p.y-q.y,p.x-q.x);q.x+=Math.cos(a)*q.s*dt;q.y+=Math.sin(a)*q.s*dt;shots.forEach(function(s){if(!s.dead&&Math.hypot(s.x-q.x,s.y-q.y)<q.r+3){s.dead=true;q.hp-=12}});if(q.hp<=0){q.dead=true;score+=25;if(score%250==0)wave++}if(Math.hypot(p.x-q.x,p.y-q.y)<p.r+q.r){q.dead=true;var dmg=18;if(p.shield>0){var used=Math.min(p.shield,dmg);p.shield-=used;dmg-=used}p.hp-=dmg;if(p.hp<=0)over=true}});shots=shots.filter(function(s){return !s.dead});enemies=enemies.filter(function(q){return !q.dead})}
function draw(){g.fillStyle='#04070d';g.fillRect(0,0,560,340);g.strokeStyle='rgba(76,130,180,.18)';for(var x=0;x<560;x+=28){g.beginPath();g.moveTo(x,0);g.lineTo(x,340);g.stroke()}for(var y=0;y<340;y+=28){g.beginPath();g.moveTo(0,y);g.lineTo(560,y);g.stroke()}g.fillStyle='#60f0c4';g.beginPath();g.arc(p.x,p.y,p.r,0,7);g.fill();g.strokeStyle='#88b8ff';g.lineWidth=3;g.beginPath();g.arc(p.x,p.y,p.r+5,-Math.PI/2,-Math.PI/2+Math.PI*2*(p.shield/100));g.stroke();g.strokeStyle='#b9fff1';g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x+Math.cos(p.ang)*21,p.y+Math.sin(p.ang)*21);g.stroke();shots.forEach(function(s){g.fillStyle='#ffe66d';g.beginPath();g.arc(s.x,s.y,3,0,7);g.fill()});enemies.forEach(function(q){g.fillStyle='#e85063';g.fillRect(q.x-q.r,q.y-q.r,q.r*2,q.r*2);g.fillStyle='#ffb1ba';g.fillRect(q.x-3,q.y-3,6,6)});if(over){g.fillStyle='rgba(0,0,0,.72)';g.fillRect(0,0,560,340);g.fillStyle='#fff';g.textAlign='center';g.font='bold 27px Arial';g.fillText('MISIÓN TERMINADA',280,155);g.font='14px Arial';g.fillText('Toca DISPARAR para reiniciar',280,184);g.textAlign='left'}stat.innerHTML='<strong>'+score+'</strong>OLEADA '+wave+' · ESC '+Math.ceil(p.shield)+' · HP '+Math.ceil(p.hp)}
function frame(t){var dt=last?Math.min((t-last)/16.67,2):1;last=t;step(dt);draw();requestAnimationFrame(frame)}
function hold(el,k){function on(e){e.preventDefault();keys[k]=true}function off(e){if(e)e.preventDefault();keys[k]=false}el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('pointerleave',off)}document.querySelectorAll('[data-hold]').forEach(function(b){hold(b,b.getAttribute('data-hold'))});var f=document.getElementById('fire'),fireTimer=null;f.addEventListener('pointerdown',function(e){e.preventDefault();shoot();fireTimer=setInterval(shoot,125)});['pointerup','pointercancel','pointerleave'].forEach(function(n){f.addEventListener(n,function(e){e.preventDefault();clearInterval(fireTimer);fireTimer=null})});document.addEventListener('keydown',function(e){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==' ')shoot();else keys[e.key.replace('Arrow','').toLowerCase()]=true});document.addEventListener('keyup',function(e){keys[e.key.replace('Arrow','').toLowerCase()]=false});reset();requestAnimationFrame(frame);`
  return shell('Halo · Arena Sci‑Fi', body, script)
}

export function buildPianoTilesGameHtml(): string {
  const body = `<canvas id="game" class="gn-canvas" width="480" height="520"></canvas>
<div class="gn-row" id="pianoControls"><button class="gn-btn" data-lane="0">1</button><button class="gn-btn" data-lane="1">2</button><button class="gn-btn" data-lane="2">3</button><button class="gn-btn" data-lane="3">4</button></div>
<div class="gn-note">Toca únicamente las fichas oscuras · La velocidad aumenta progresivamente</div>`
  const script = `
var cv=document.getElementById('game'),g=cv.getContext('2d'),stat=document.getElementById('gnStat'),tiles=[],score=0,best=0,speed=3.0,over=false,last=0,spawn=0;
function reset(){tiles=[];score=0;speed=3;over=false;spawn=0;last=0;draw()}
function add(){var lane=Math.floor(Math.random()*4);tiles.push({lane:lane,y:-125,h:122,hit:false})}
function tap(lane){if(over){reset();return}var candidates=tiles.filter(function(t){return !t.hit&&t.lane==lane&&t.y+t.h>390&&t.y<520}).sort(function(a,b){return b.y-a.y});if(!candidates.length){over=true;return}var t=candidates[0];t.hit=true;score++;best=Math.max(best,score);speed=Math.min(9,3+score*.055)}
function step(dt){if(over)return;spawn-=dt;if(spawn<=0){add();spawn=Math.max(16,34-speed*1.3)}tiles.forEach(function(t){t.y+=speed*dt});for(var i=0;i<tiles.length;i++){var t=tiles[i];if(!t.hit&&t.y>520){over=true;break}}tiles=tiles.filter(function(t){return t.y<650&&!t.hit})}
function draw(){g.fillStyle='#f3f4f7';g.fillRect(0,0,480,520);for(var i=1;i<4;i++){g.strokeStyle='#c5c9d1';g.beginPath();g.moveTo(i*120,0);g.lineTo(i*120,520);g.stroke()}g.fillStyle='rgba(65,120,255,.12)';g.fillRect(0,390,480,130);tiles.forEach(function(t){g.fillStyle='#11151c';g.fillRect(t.lane*120+3,t.y,114,t.h);g.fillStyle='#303641';g.fillRect(t.lane*120+12,t.y+10,96,6)});if(over){g.fillStyle='rgba(8,10,15,.83)';g.fillRect(0,0,480,520);g.fillStyle='#fff';g.textAlign='center';g.font='bold 28px Arial';g.fillText('FIN DE LA CANCIÓN',240,240);g.font='14px Arial';g.fillText('Toca cualquier carril para reiniciar',240,270);g.textAlign='left'}stat.innerHTML='<strong>'+score+'</strong>BEST '+best+' · '+speed.toFixed(1)+'x'}
function frame(t){var dt=last?Math.min((t-last)/16.67,2):1;last=t;step(dt);draw();requestAnimationFrame(frame)}document.querySelectorAll('[data-lane]').forEach(function(b){b.addEventListener('pointerdown',function(e){e.preventDefault();tap(+this.getAttribute('data-lane'))})});cv.addEventListener('pointerdown',function(e){e.preventDefault();var r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*480;tap(Math.max(0,Math.min(3,Math.floor(x/120))))});document.addEventListener('keydown',function(e){var m={'1':0,'2':1,'3':2,'4':3,ArrowLeft:0,ArrowDown:1,ArrowUp:2,ArrowRight:3};if(m[e.key]!==undefined){e.preventDefault();tap(m[e.key])}});reset();requestAnimationFrame(frame);`
  return shell('Piano Tiles', body, script)
}

export function buildBounceGameHtml(): string {
  const body = `<canvas id="game" class="gn-canvas" width="560" height="330"></canvas>
<div class="gn-row"><button class="gn-btn" data-hold="left">◀</button><button class="gn-btn gn-primary" id="jump">SALTAR</button><button class="gn-btn" data-hold="right">▶</button></div>
<div class="gn-note">Red Ball / Bounce · Mantén ◀ ▶ para moverte · Recoge los orbes dorados</div>`
  const script = `
var cv=document.getElementById('game'),g=cv.getContext('2d'),stat=document.getElementById('gnStat'),keys={},ball,worldX,platforms,orbs,spikes,score,lives,over,last;
function reset(){ball={x:90,y:180,r:13,vx:0,vy:0,on:false};worldX=0;score=0;lives=3;over=false;last=0;platforms=[{x:0,y:285,w:900,h:45},{x:180,y:230,w:110,h:18},{x:360,y:190,w:100,h:18},{x:540,y:245,w:120,h:18},{x:760,y:205,w:120,h:18},{x:980,y:270,w:150,h:18},{x:1180,y:220,w:120,h:18},{x:1390,y:175,w:130,h:18},{x:1600,y:250,w:160,h:18},{x:1830,y:205,w:150,h:18},{x:2080,y:270,w:220,h:45}];orbs=[];for(var i=0;i<26;i++)orbs.push({x:150+i*82,y:120+(i%4)*32,t:false});spikes=[{x:315,y:272,w:30},{x:680,y:272,w:38},{x:1135,y:272,w:42},{x:1775,y:272,w:42}];draw()}
function jump(){if(over){reset();return}if(ball.on){ball.vy=-10.8;ball.on=false}}
function die(){lives--;if(lives<=0){over=true;return}ball.x=Math.max(70,worldX+80);ball.y=120;ball.vx=0;ball.vy=0}
function step(dt){if(over)return;var ax=(keys.right?1:0)-(keys.left?1:0);ball.vx+=ax*.45*dt;ball.vx*=Math.pow(.88,dt);ball.vx=Math.max(-5,Math.min(5,ball.vx));ball.vy+=.58*dt;var oldY=ball.y;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.on=false;platforms.forEach(function(p){if(ball.x+ball.r>p.x&&ball.x-ball.r<p.x+p.w&&oldY+ball.r<=p.y&&ball.y+ball.r>=p.y&&ball.vy>=0){ball.y=p.y-ball.r;ball.vy=0;ball.on=true}});orbs.forEach(function(o){if(!o.t&&Math.hypot(ball.x-o.x,ball.y-o.y)<ball.r+8){o.t=true;score+=10}});spikes.forEach(function(s){if(ball.x+ball.r>s.x&&ball.x-ball.r<s.x+s.w&&ball.y+ball.r>266)die()});if(ball.y>370)die();if(ball.x>2260){score+=500;over=true}worldX=Math.max(0,Math.min(1780,ball.x-150))}
function draw(){g.fillStyle='#8dd8ff';g.fillRect(0,0,560,330);g.fillStyle='#dff4ff';for(var i=0;i<9;i++){var cx=((i*170-worldX*.2)%750+750)%750-80;g.beginPath();g.arc(cx,55+(i%3)*28,24,0,7);g.arc(cx+25,55+(i%3)*28,18,0,7);g.fill()}g.save();g.translate(-worldX,0);platforms.forEach(function(p){g.fillStyle='#3c9b51';g.fillRect(p.x,p.y,p.w,p.h);g.fillStyle='#6bd47c';g.fillRect(p.x,p.y,p.w,5)});spikes.forEach(function(s){g.fillStyle='#6d7785';for(var x=s.x;x<s.x+s.w;x+=10){g.beginPath();g.moveTo(x,285);g.lineTo(x+5,267);g.lineTo(x+10,285);g.fill()}});orbs.forEach(function(o){if(o.t)return;g.fillStyle='#ffd84d';g.beginPath();g.arc(o.x,o.y,7,0,7);g.fill();g.strokeStyle='#fff1a5';g.stroke()});g.fillStyle='#df3349';g.beginPath();g.arc(ball.x,ball.y,ball.r,0,7);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(ball.x+4,ball.y-5,3,0,7);g.fill();g.restore();if(over){g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,0,560,330);g.fillStyle='#fff';g.textAlign='center';g.font='bold 25px Arial';g.fillText(lives>0?'NIVEL COMPLETADO':'GAME OVER',280,145);g.font='14px Arial';g.fillText('Toca SALTAR para reiniciar',280,174);g.textAlign='left'}stat.innerHTML='<strong>'+score+'</strong>VIDAS '+lives}
function frame(t){var dt=last?Math.min((t-last)/16.67,2):1;last=t;step(dt);draw();requestAnimationFrame(frame)}
function hold(el,k){function on(e){e.preventDefault();keys[k]=true}function off(e){if(e)e.preventDefault();keys[k]=false}el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('pointerleave',off)}document.querySelectorAll('[data-hold]').forEach(function(b){hold(b,b.getAttribute('data-hold'))});var j=document.getElementById('jump');j.addEventListener('pointerdown',function(e){e.preventDefault();jump()});document.addEventListener('keydown',function(e){if(e.key=='ArrowLeft')keys.left=true;if(e.key=='ArrowRight')keys.right=true;if(e.key==' '||e.key=='ArrowUp'){e.preventDefault();jump()}});document.addEventListener('keyup',function(e){if(e.key=='ArrowLeft')keys.left=false;if(e.key=='ArrowRight')keys.right=false});reset();requestAnimationFrame(frame);`
  return shell('Red Ball · Bounce', body, script)
}
