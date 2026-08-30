/** Gato / Tres en raya — canvas HTML vs IA */
export function buildGatoGameHtml(): string {
  return `<style>*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}</style>
<body style="margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation">
<div style="width:100%;max-width:620px;margin:auto;box-sizing:border-box">
<div style="position:relative;width:100%;aspect-ratio:16/9;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden">
<canvas id="g" width="480" height="270" style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>
<div style="position:absolute;top:8px;left:12px;pointer-events:none;text-shadow:0 1px 4px #000">
<div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.65)">GHOST NEXORA</div>
<div style="font-size:14px;font-weight:bold;color:#fff">Gato · Tres en raya</div>
</div>
<div id="st" style="position:absolute;bottom:8px;left:0;right:0;text-align:center;font-size:11px;color:rgba(255,255,255,.85);pointer-events:none;text-shadow:0 1px 4px #000">Tú eres X · Toca una casilla</div>
</div></div>
<script>
const c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('st');
const W=c.width,H=c.height;
const S=Math.min(W,H)*0.72,OX=(W-S)/2,OY=(H-S)/2+6,CS=S/3;
let board,turn,over,msg;
function reset(){board=Array(9).fill(0);turn=1;over=false;msg='Tú eres X · Toca una casilla';st.textContent=msg;draw()}
function lines(){return[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]}
function winner(b){for(const [a,c,d] of lines()){if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a]}return b.every(v=>v)?3:0}
function empties(b){const e=[];for(let i=0;i<9;i++)if(!b[i])e.push(i);return e}
function minimax(b,maxi){
const w=winner(b);if(w===2)return{s:10};if(w===1)return{s:-10};if(w===3)return{s:0};
let best=maxi?{s:-99,i:-1}:{s:99,i:-1};
for(const i of empties(b)){b[i]=maxi?2:1;const r=minimax(b,!maxi);b[i]=0;r.i=i;if(maxi?r.s>best.s:r.s<best.s)best=r}
return best
}
function ai(){const m=minimax(board.slice(),true);if(m.i>=0)board[m.i]=2}
function draw(){
x.clearRect(0,0,W,H);
const bg=x.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#12182a');bg.addColorStop(1,'#1a1030');
x.fillStyle=bg;x.fillRect(0,0,W,H);
x.strokeStyle='rgba(255,255,255,.25)';x.lineWidth=3;
for(let i=1;i<3;i++){x.beginPath();x.moveTo(OX+i*CS,OY);x.lineTo(OX+i*CS,OY+S);x.stroke();x.beginPath();x.moveTo(OX,OY+i*CS);x.lineTo(OX+S,OY+i*CS);x.stroke()}
for(let i=0;i<9;i++){
const r=Math.floor(i/3),col=i%3,cx=OX+col*CS+CS/2,cy=OY+r*CS+CS/2;
if(board[i]===1){x.strokeStyle='#6c9eff';x.lineWidth=4;x.beginPath();x.moveTo(cx-18,cy-18);x.lineTo(cx+18,cy+18);x.moveTo(cx+18,cy-18);x.lineTo(cx-18,cy+18);x.stroke()}
if(board[i]===2){x.strokeStyle='#f6a0c0';x.lineWidth=4;x.beginPath();x.arc(cx,cy,20,0,7);x.stroke()}
}
if(over){x.fillStyle='rgba(0,0,0,.45)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font='bold 20px Arial';x.fillText(msg,W/2,H/2);x.font='12px Arial';x.fillText('Toca para jugar de nuevo',W/2,H/2+22);x.textAlign='left'}
}
function play(i){
if(over||board[i]||turn!==1)return;
board[i]=1;
let w=winner(board);
if(w){over=true;msg=w===1?'¡Ganaste!':w===2?'Ganó la IA':'Empate';st.textContent=msg;draw();return}
turn=2;ai();
w=winner(board);
if(w){over=true;msg=w===1?'¡Ganaste!':w===2?'Ganó la IA':'Empate';st.textContent=msg}
else{turn=1;msg='Tu turno (X)';st.textContent=msg}
draw()
}
c.addEventListener('pointerdown',e=>{
if(over){reset();return}
const r=c.getBoundingClientRect();
const px=(e.clientX-r.left)/r.width*W,py=(e.clientY-r.top)/r.height*H;
if(px<OX||py<OY||px>OX+S||py>OY+S)return;
const col=Math.floor((px-OX)/CS),row=Math.floor((py-OY)/CS);
play(row*3+col)
});
reset();
</script></body>`
}
