/** Damas — canvas HTML vs IA estratégica, sin dependencias externas. */
export function buildDamasGameHtml(): string {
  return `<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
body{margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation}
#wrap{width:100%;max-width:620px;margin:auto}
#game{position:relative;width:100%;aspect-ratio:16/9;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden}
#g{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
#head{position:absolute;top:6px;left:10px;pointer-events:none;text-shadow:0 1px 4px #000}
#brand{font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.65)}
#title{font-size:13px;font-weight:bold;color:#fff}
#meta{font-size:8px;margin-top:2px;color:rgba(255,255,255,.72)}
#mute{position:absolute;top:7px;right:9px;width:34px;height:30px;border-radius:9px;border:1px solid rgba(255,255,255,.24);background:rgba(0,0,0,.34);color:#fff;font-size:15px;cursor:pointer;z-index:4;touch-action:none}
#mute:active{transform:scale(.96);background:rgba(255,255,255,.16)}
#st{position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:10px;color:rgba(255,255,255,.9);pointer-events:none;text-shadow:0 1px 4px #000}
</style>
<body><div id="wrap"><div id="game">
<canvas id="g" width="480" height="270"></canvas>
<div id="head"><div id="brand">GHOST NEXORA</div><div id="title">Damas · vs IA estratégica</div><div id="meta">Tú: blancas · IA: negras</div></div>
<button id="mute" aria-label="Silenciar">🔊</button>
<div id="st">Tú: blancas · Elige ficha y casilla</div>
</div></div>
<script>
(function(){
const c=document.getElementById('g'),x=c.getContext('2d'),st=document.getElementById('st'),muteB=document.getElementById('mute');
const W=c.width,H=c.height,N=8;
const S=Math.min(W,H)*0.9,OX=(W-S)/2,OY=(H-S)/2+4,CS=S/N;
let board,sel,forced,over,msg,turn,thinking=false;

let AC=null,MUTED=false;
try{MUTED=localStorage.getItem('damas_mute')==='1'}catch(e){}
function audio(){
  if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}
  if(AC&&AC.state==='suspended'){try{AC.resume()}catch(e){}}
  return AC
}
function tone(f,d,type,vol,delay,to){
  const a=audio();if(!a||MUTED)return;
  try{
    const t=a.currentTime+(delay||0),o=a.createOscillator(),g=a.createGain();
    o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+d);
    g.gain.setValueAtTime(vol||.08,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.03)
  }catch(e){}
}
function sndSelect(){tone(520,.055,'sine',.045)}
function sndMove(){tone(230,.07,'triangle',.055);tone(300,.06,'triangle',.035,.045)}
function sndCapture(){tone(150,.11,'square',.09,0,70);tone(90,.12,'triangle',.07,.04)}
function sndKing(){tone(660,.08,'sine',.07);tone(880,.10,'sine',.08,.08);tone(1100,.13,'sine',.08,.17)}
function sndWin(){[523,659,784,1047].forEach((f,i)=>tone(f,.18,'sine',.07,i*.12))}
function sndLose(){[330,277,220,165].forEach((f,i)=>tone(f,.18,'sawtooth',.055,i*.11))}
function setMuted(v){MUTED=v;muteB.textContent=MUTED?'🔇':'🔊';try{localStorage.setItem('damas_mute',MUTED?'1':'0')}catch(e){}}
setMuted(MUTED);
muteB.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();audio();setMuted(!MUTED)});

function empty(){return Array.from({length:N},()=>Array(N).fill(0))}
function clone(b){return b.map(r=>r.slice())}
function inside(r,col){return r>=0&&col>=0&&r<N&&col<N}
function dirsFor(p){
  if(Math.abs(p)===2)return [[1,1],[1,-1],[-1,1],[-1,-1]];
  return p>0?[[-1,1],[-1,-1]]:[[1,1],[1,-1]]
}
function capturesFrom(b,r,col){
  const p=b[r][col];if(!p)return[];const side=p>0?1:-1,out=[];
  for(const [dr,dc] of dirsFor(p)){
    const r1=r+dr,c1=col+dc,r2=r+2*dr,c2=col+2*dc;
    if(inside(r2,c2)&&b[r1][c1]*side<0&&!b[r2][c2])out.push({fr:r,fc:col,r:r2,c:c2,cap:{r:r1,c:c1}})
  }
  return out
}
function stepsFrom(b,r,col){
  const p=b[r][col];if(!p)return[];const out=[];
  for(const [dr,dc] of dirsFor(p)){
    const r1=r+dr,c1=col+dc;
    if(inside(r1,c1)&&!b[r1][c1])out.push({fr:r,fc:col,r:r1,c:c1,cap:null})
  }
  return out
}
function applyStep(b,mv){
  const p=b[mv.fr][mv.fc];b[mv.fr][mv.fc]=0;b[mv.r][mv.c]=p;
  if(mv.cap)b[mv.cap.r][mv.cap.c]=0;
  let promoted=false;
  if(p===1&&mv.r===0){b[mv.r][mv.c]=2;promoted=true}
  if(p===-1&&mv.r===N-1){b[mv.r][mv.c]=-2;promoted=true}
  return {captured:Boolean(mv.cap),promoted}
}
function captureSeqFrom(b,r,col,path){
  const caps=capturesFrom(b,r,col);
  if(!caps.length)return path.length?[path]:[];
  const out=[];
  for(const mv of caps){
    const nb=clone(b);applyStep(nb,mv);
    const tails=captureSeqFrom(nb,mv.r,mv.c,[...path,mv]);
    if(tails.length)out.push(...tails);else out.push([...path,mv])
  }
  return out
}
function turnSequences(b,side){
  const caps=[];
  for(let r=0;r<N;r++)for(let col=0;col<N;col++)if(b[r][col]*side>0)caps.push(...captureSeqFrom(b,r,col,[]));
  if(caps.length)return caps;
  const steps=[];
  for(let r=0;r<N;r++)for(let col=0;col<N;col++)if(b[r][col]*side>0){
    for(const mv of stepsFrom(b,r,col))steps.push([mv])
  }
  return steps
}
function legalFirstSteps(side){
  const seqs=turnSequences(board,side),seen=new Set(),out=[];
  for(const seq of seqs){const m=seq[0],k=m.fr+','+m.fc+'>'+m.r+','+m.c;if(!seen.has(k)){seen.add(k);out.push(m)}}
  return out
}
function count(side,b=board){let n=0;for(let r=0;r<N;r++)for(let col=0;col<N;col++)if(b[r][col]*side>0)n++;return n}
function evaluate(b){
  let score=0;
  for(let r=0;r<N;r++)for(let col=0;col<N;col++){
    const p=b[r][col];if(!p)continue;
    const ai=p<0,king=Math.abs(p)===2;
    let v=king?175:100;
    if(!king)v+=ai?r*5:(7-r)*5;
    if(r>=2&&r<=5&&col>=2&&col<=5)v+=8;
    if(col===0||col===7)v+=4;
    score+=ai?v:-v
  }
  score+=(turnSequences(b,-1).length-turnSequences(b,1).length)*3;
  return score
}
function terminalScore(b,depth){
  const white=count(1,b),black=count(-1,b);
  if(!black)return -100000-depth;
  if(!white)return 100000+depth;
  if(!turnSequences(b,-1).length)return -90000-depth;
  if(!turnSequences(b,1).length)return 90000+depth;
  return null
}
function applySequenceCopy(b,seq){const nb=clone(b);for(const mv of seq)applyStep(nb,mv);return nb}
function minimax(b,side,depth,alpha,beta){
  const term=terminalScore(b,depth);if(term!==null)return term;
  if(depth<=0)return evaluate(b);
  const seqs=turnSequences(b,side);
  if(side===-1){
    let best=-Infinity;
    for(const seq of seqs){best=Math.max(best,minimax(applySequenceCopy(b,seq),1,depth-1,alpha,beta));alpha=Math.max(alpha,best);if(beta<=alpha)break}
    return best
  }
  let best=Infinity;
  for(const seq of seqs){best=Math.min(best,minimax(applySequenceCopy(b,seq),-1,depth-1,alpha,beta));beta=Math.min(beta,best);if(beta<=alpha)break}
  return best
}
function chooseAiSequence(){
  const seqs=turnSequences(board,-1);if(!seqs.length)return null;
  const pieces=count(1)+count(-1),depth=pieces<=10?5:pieces<=16?4:3;
  let best=null,bestScore=-Infinity;
  for(const seq of seqs){
    const nb=applySequenceCopy(board,seq);
    let s=minimax(nb,1,depth-1,-Infinity,Infinity);
    if(seq.some(m=>m.cap))s+=4;
    const last=seq[seq.length-1],p=nb[last.r][last.c];if(Math.abs(p)===2)s+=3;
    s+=Math.random()*.35;
    if(s>bestScore){bestScore=s;best=seq}
  }
  return best
}
function setup(){
  board=empty();
  for(let r=0;r<3;r++)for(let col=0;col<N;col++)if((r+col)%2)board[r][col]=-1;
  for(let r=5;r<8;r++)for(let col=0;col<N;col++)if((r+col)%2)board[r][col]=1;
  sel=null;forced=null;over=false;turn=1;thinking=false;msg='Tu turno · Blancas';st.textContent=msg
}
function finish(text,won){over=true;thinking=false;msg=text;st.textContent=msg;if(won)sndWin();else sndLose()}
function endCheck(){
  if(count(1)===0){finish('Ganó la IA',false);return true}
  if(count(-1)===0){finish('¡Ganaste!',true);return true}
  if(!turnSequences(board,turn).length){finish(turn===1?'Sin movimientos · Gana la IA':'IA sin movimientos · ¡Ganaste!',turn!==1);return true}
  return false
}
function afterSound(result){if(result.captured)sndCapture();else sndMove();if(result.promoted)setTimeout(sndKing,90)}
function aiMove(){
  if(over)return;thinking=true;msg='IA pensando…';st.textContent=msg;draw();
  const seq=chooseAiSequence();
  if(!seq){thinking=false;finish('IA sin movimientos · ¡Ganaste!',true);draw();return}
  let i=0;
  function step(){
    if(over)return;
    const result=applyStep(board,seq[i]);afterSound(result);i++;draw();
    if(count(1)===0){finish('Ganó la IA',false);draw();return}
    if(i<seq.length){msg='IA encadena captura…';st.textContent=msg;setTimeout(step,260);return}
    thinking=false;turn=1;sel=null;forced=null;
    if(endCheck()){draw();return}
    msg='Tu turno';st.textContent=msg;draw()
  }
  setTimeout(step,280)
}
function draw(){
  x.clearRect(0,0,W,H);x.fillStyle='#171421';x.fillRect(0,0,W,H);
  for(let r=0;r<N;r++)for(let col=0;col<N;col++){
    x.fillStyle=(r+col)%2?'#3d2b1f':'#c4a574';x.fillRect(OX+col*CS,OY+r*CS,CS+.5,CS+.5);
    const p=board[r][col];
    if(p){
      const cx=OX+col*CS+CS/2,cy=OY+r*CS+CS/2;
      x.save();x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=4;x.shadowOffsetY=2;
      x.beginPath();x.arc(cx,cy,CS*.34,0,Math.PI*2);x.fillStyle=p>0?'#f4f4f5':'#18181b';x.fill();
      x.lineWidth=1.4;x.strokeStyle=p>0?'#b8b8bd':'#555';x.stroke();x.restore();
      if(Math.abs(p)===2){x.strokeStyle=p>0?'#c9a227':'#e0b84a';x.lineWidth=2.2;x.beginPath();x.arc(cx,cy,CS*.19,0,Math.PI*2);x.stroke();x.fillStyle='#d9b43b';x.font='bold '+Math.max(9,CS*.25)+'px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText('K',cx,cy);x.textAlign='left';x.textBaseline='alphabetic'}
    }
    if(sel&&sel.r===r&&sel.c===col){x.strokeStyle=forced?'#ffca55':'#6c9eff';x.lineWidth=3;x.strokeRect(OX+col*CS+2,OY+r*CS+2,CS-4,CS-4)}
  }
  const choices=turn===1&&!over?legalFirstSteps(1):[];
  if(sel){
    x.fillStyle='rgba(108,158,255,.42)';
    for(const m of choices.filter(q=>q.fr===sel.r&&q.fc===sel.c)){x.beginPath();x.arc(OX+m.c*CS+CS/2,OY+m.r*CS+CS/2,CS*.12,0,Math.PI*2);x.fill()}
  }
  x.fillStyle='rgba(0,0,0,.38)';x.fillRect(8,H-27,91,18);x.fillRect(W-99,H-27,91,18);
  x.font='bold 9px Arial';x.fillStyle='#fff';x.textAlign='left';x.fillText('TÚ  '+count(1),15,H-15);x.textAlign='right';x.fillText('IA  '+count(-1),W-15,H-15);x.textAlign='left';
  if(thinking&&!over){x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,0,W,H)}
  if(over){x.fillStyle='rgba(0,0,0,.62)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font='bold 19px Arial';x.fillText(msg,W/2,H/2-3);x.font='12px Arial';x.fillText('Toca el tablero para reiniciar',W/2,H/2+22);x.textAlign='left'}
}
c.addEventListener('pointerdown',e=>{
  e.preventDefault();audio();
  if(over){setup();sndMove();draw();return}
  if(turn!==1||thinking)return;
  const rect=c.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*W,py=(e.clientY-rect.top)/rect.height*H;
  const col=Math.floor((px-OX)/CS),r=Math.floor((py-OY)/CS);if(!inside(r,col))return;
  const choices=legalFirstSteps(1);
  if(sel){
    const mv=choices.find(m=>m.fr===sel.r&&m.fc===sel.c&&m.r===r&&m.c===col);
    if(mv){
      const result=applyStep(board,mv);afterSound(result);sel=null;
      if(count(-1)===0){finish('¡Ganaste!',true);draw();return}
      if(result.captured){
        const more=capturesFrom(board,mv.r,mv.c);
        if(more.length){forced={r:mv.r,c:mv.c};sel={r:mv.r,c:mv.c};msg='Captura obligatoria · continúa con la misma ficha';st.textContent=msg;draw();return}
      }
      forced=null;turn=-1;if(endCheck()){draw();return}msg='IA pensando…';st.textContent=msg;draw();setTimeout(aiMove,180);return
    }
  }
  if(forced){sel={...forced};msg='Debes continuar la captura';st.textContent=msg;draw();return}
  const selectable=choices.some(m=>m.fr===r&&m.fc===col);
  if(board[r][col]>0&&selectable){sel={r,c:col};msg=choices.some(m=>m.cap)?'Captura obligatoria · elige destino':'Elige casilla destino';st.textContent=msg;sndSelect()}
  else{sel=null;if(choices.some(m=>m.cap)){msg='Hay una captura obligatoria';st.textContent=msg}}
  draw()
});
setup();draw();
})();
</script></body>`
}
