/** Damas — canvas HTML vs IA simple */
export function buildDamasGameHtml(): string {
  return `<style>*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}</style>
<body style="margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation">
<div style="width:100%;max-width:620px;margin:auto;box-sizing:border-box">
<div style="position:relative;width:100%;aspect-ratio:16/9;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden">
<canvas id="g" width="480" height="270" style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>
<div style="position:absolute;top:6px;left:10px;pointer-events:none;text-shadow:0 1px 4px #000">
<div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.65)">GHOST NEXORA</div>
<div style="font-size:13px;font-weight:bold;color:#fff">Damas</div>
</div>
<div id="st" style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:10px;color:rgba(255,255,255,.85);pointer-events:none;text-shadow:0 1px 4px #000">Tú: blancas · Elige ficha y casilla</div>
</div></div>
<script>
const c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('st');
const W=c.width,H=c.height,N=8;
const S=Math.min(W,H)*0.9,OX=(W-S)/2,OY=(H-S)/2+4,CS=S/N;
let board,sel,over,msg,turn;
function empty(){return Array.from({length:N},()=>Array(N).fill(0))}
function setup(){
board=empty();
for(let r=0;r<3;r++)for(let c=0;c<N;c++)if((r+c)%2)board[r][c]=-1;
for(let r=5;r<8;r++)for(let c=0;c<N;c++)if((r+c)%2)board[r][c]=1;
sel=null;over=false;turn=1;msg='Tú: blancas · Elige ficha y casilla';st.textContent=msg
}
function inside(r,c){return r>=0&&c>=0&&r<N&&c<N}
function movesFor(r,c){
const p=board[r][c];if(!p)return[];
const side=p>0?1:-1;const king=Math.abs(p)===2;
const dirs=king?[[1,1],[1,-1],[-1,1],[-1,-1]]:side===1?[[-1,1],[-1,-1]]:[[1,1],[1,-1]];
const caps=[],steps=[];
for(const [dr,dc] of dirs){
const r1=r+dr,c1=c+dc,r2=r+2*dr,c2=c+2*dc;
if(inside(r1,c1)&&board[r1][c1]*side<0&&inside(r2,c2)&&!board[r2][c2])caps.push({r:r2,c:c2,cap:{r:r1,c:c1}});
else if(inside(r1,c1)&&!board[r1][c1])steps.push({r:r1,c:c1,cap:null});
}
return caps.length?caps:steps
}
function allMoves(side){
const m=[];
for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(board[r][c]*side>0){
const list=movesFor(r,c);for(const mv of list)m.push({fr:r,fc:c,...mv})
}
const caps=m.filter(x=>x.cap);return caps.length?caps:m
}
function apply(mv){
const p=board[mv.fr][mv.fc];board[mv.fr][mv.fc]=0;board[mv.r][mv.c]=p;
if(mv.cap)board[mv.cap.r][mv.cap.c]=0;
if(p===1&&mv.r===0)board[mv.r][mv.c]=2;
if(p===-1&&mv.r===N-1)board[mv.r][mv.c]=-2
}
function count(side){let n=0;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(board[r][c]*side>0)n++;return n}
function endCheck(){
if(count(1)===0){over=true;msg='Ganaron las negras (IA)';st.textContent=msg;return true}
if(count(-1)===0){over=true;msg='¡Ganaste!';st.textContent=msg;return true}
if(allMoves(turn).length===0){over=true;msg=turn===1?'Sin movimientos · Gana la IA':'Sin movimientos · ¡Ganaste!';st.textContent=msg;return true}
return false
}
function aiMove(){
const m=allMoves(-1);if(!m.length)return;
const caps=m.filter(x=>x.cap);
const pick=(caps.length?caps:m)[Math.floor(Math.random()*(caps.length?caps:m).length)];
apply(pick);turn=1;msg='Tu turno';st.textContent=msg;endCheck()
}
function draw(){
x.clearRect(0,0,W,H);
x.fillStyle='#1a1528';x.fillRect(0,0,W,H);
for(let r=0;r<N;r++)for(let c=0;c<N;c++){
x.fillStyle=(r+c)%2?'#3d2b1f':'#c4a574';
x.fillRect(OX+c*CS,OY+r*CS,CS+0.5,CS+0.5);
const p=board[r][c];
if(p){
const cx=OX+c*CS+CS/2,cy=OY+r*CS+CS/2;
x.beginPath();x.arc(cx,cy,CS*0.34,0,7);
x.fillStyle=p>0?'#f2f2f2':'#222';x.fill();
if(Math.abs(p)===2){x.strokeStyle=p>0?'#c9a227':'#e0b84a';x.lineWidth=2;x.beginPath();x.arc(cx,cy,CS*0.18,0,7);x.stroke()}
}
if(sel&&sel.r===r&&sel.c===c){x.strokeStyle='#6c9eff';x.lineWidth=3;x.strokeRect(OX+c*CS+2,OY+r*CS+2,CS-4,CS-4)}
}
if(sel){const ms=movesFor(sel.r,sel.c);x.fillStyle='rgba(108,158,255,.35)';for(const m of ms)x.beginPath(),x.arc(OX+m.c*CS+CS/2,OY+m.r*CS+CS/2,CS*0.12,0,7),x.fill()}
if(over){x.fillStyle='rgba(0,0,0,.5)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font='bold 18px Arial';x.fillText(msg,W/2,H/2);x.font='12px Arial';x.fillText('Toca para reiniciar',W/2,H/2+22);x.textAlign='left'}
}
c.addEventListener('pointerdown',e=>{
if(over){setup();draw();return}
if(turn!==1)return;
const rect=c.getBoundingClientRect();
const px=(e.clientX-rect.left)/rect.width*W,py=(e.clientY-rect.top)/rect.height*H;
const c0=Math.floor((px-OX)/CS),r0=Math.floor((py-OY)/CS);
if(!inside(r0,c0))return;
if(sel){
const ms=movesFor(sel.r,sel.c);
const mv=ms.find(m=>m.r===r0&&m.c===c0);
if(mv){apply({fr:sel.r,fc:sel.c,...mv});sel=null;if(endCheck()){draw();return}turn=-1;msg='Pensando…';st.textContent=msg;draw();setTimeout(()=>{aiMove();draw()},220);return}
}
if(board[r0][c0]>0){sel={r:r0,c:c0};msg='Elige casilla destino';st.textContent=msg}
else sel=null;
draw()
});
setup();draw();
</script></body>`
}
