import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const ROOT = path.join(config.dataDir, 'llm')
const CORPUS_DIR = path.join(ROOT, 'corpus')
const LIVE_FILE = path.join(ROOT, 'live_corpus.txt')
const VOCAB_FILE = path.join(ROOT, 'vocab.json')
const MODEL_FILE = path.join(ROOT, 'model.bin')
const VECTORS_FILE = path.join(ROOT, 'corpus.bin')
const STATE_FILE = path.join(ROOT, 'state.json')

const DIM = 128
const HEADS = 4
const HEAD_DIM = DIM / HEADS
const VOCAB_LIMIT = 8000
const MAX_CONTEXT = 64
const MAX_CHUNK = 900
const TOP_K = 5
const MAX_TRAIN_RECORDS = 5000
const AUTO_TRAIN_EVERY_MS = 30 * 60 * 1000
const MIN_AUTO_TRAIN_MESSAGES = 20
const MIN_MODEL_TRAIN_STEPS_FOR_GENERATION = 250
const MAGIC = Buffer.from('NXLLM2\\0', 'ascii')

type LlmState = {
  startedAt: string
  totalDocuments: number
  totalChunks: number
  totalMessages: number
  trainedMessages: number
  trainRuns: number
  trainSteps: number
  modelVersion: number
  lastTrainAt: string | null
  lastTrainDurationMs: number
  lastLoss: number | null
  bestLoss: number | null
  learning: boolean
  autoTrainEnabled: boolean
  currentProgress: number
  currentStep: number
  currentTotalSteps: number
  currentEpoch: number
  currentTotalEpochs: number
  currentMessage: string
}

type RecordItem = { id: number; vector: Float32Array; text: string }
type Result = { text: string; score: number }
type Model = { vocabSize:number; dim:number; heads:number; embeddings:Float32Array; wq:Float32Array; wk:Float32Array; wv:Float32Array; wo:Float32Array; output:Float32Array; bias:Float32Array }
const DEFAULT_STATE: LlmState = { startedAt:new Date().toISOString(), totalDocuments:0,totalChunks:0,totalMessages:0,trainedMessages:0,trainRuns:0,trainSteps:0,modelVersion:2,lastTrainAt:null,lastTrainDurationMs:0,lastLoss:null,bestLoss:null,learning:false,autoTrainEnabled:true,currentProgress:0,currentStep:0,currentTotalSteps:0,currentEpoch:0,currentTotalEpochs:0,currentMessage:'En espera' }
function ensureDirs(){fs.mkdirSync(CORPUS_DIR,{recursive:true});if(!fs.existsSync(STATE_FILE))fs.writeFileSync(STATE_FILE,JSON.stringify(DEFAULT_STATE,null,2))}
function getState():LlmState{ensureDirs();try{return {...DEFAULT_STATE,...(JSON.parse(fs.readFileSync(STATE_FILE,'utf8')) as Partial<LlmState>)}}catch{return {...DEFAULT_STATE}}}
function saveState(value:LlmState){ensureDirs();const tmp=`${STATE_FILE}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,STATE_FILE)}
function updateProgress(patch:Partial<LlmState>){saveState({...getState(),...patch})}
function clean(text:string){return text.normalize('NFKC').replace(/\r/g,'\n').replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function splitChunks(text:string){const value=clean(text);if(!value)return[] as string[];const out:string[]=[];for(const p of value.split(/\n{2,}/))for(let i=0;i<p.length;i+=MAX_CHUNK)out.push(p.slice(i,i+MAX_CHUNK).trim());return out.filter(Boolean)}
function hashVector(text:string){const v=new Float32Array(DIM),lower=text.toLowerCase();for(let i=0;i<lower.length;i++){const a=lower.charCodeAt(i),b=i+1<lower.length?lower.charCodeAt(i+1):0,slot=(a*31+b*17+i*13)%DIM;v[slot]+=((a%97)+1)/100}let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;for(let i=0;i<DIM;i++)v[i]/=n;return v}
function appendBinary(records:RecordItem[]){if(!records.length)return;ensureDirs();if(!fs.existsSync(VECTORS_FILE)||fs.statSync(VECTORS_FILE).size===0)fs.writeFileSync(VECTORS_FILE,MAGIC);const fd=fs.openSync(VECTORS_FILE,'a');try{for(const item of records){const tb=Buffer.from(item.text,'utf8').subarray(0,65535),h=Buffer.alloc(6);h.writeUInt32LE(item.id,0);h.writeUInt16LE(tb.length,4);fs.writeSync(fd,h);fs.writeSync(fd,Buffer.from(item.vector.buffer,item.vector.byteOffset,item.vector.byteLength));fs.writeSync(fd,tb)}}finally{fs.closeSync(fd)}}
function readBinary(){ensureDirs();if(!fs.existsSync(VECTORS_FILE))return[] as RecordItem[];const buf=fs.readFileSync(VECTORS_FILE);if(buf.length<MAGIC.length||!buf.subarray(0,MAGIC.length).equals(MAGIC))return[] as RecordItem[];const out:RecordItem[]=[];let o=MAGIC.length;while(o+6<=buf.length){const id=buf.readUInt32LE(o),len=buf.readUInt16LE(o+4);o+=6;const bytes=DIM*4;if(o+bytes+len>buf.length)break;const vector=new Float32Array(DIM);for(let i=0;i<DIM;i++)vector[i]=buf.readFloatLE(o+i*4);o+=bytes;const text=buf.subarray(o,o+len).toString('utf8');o+=len;out.push({id,vector,text})}return out}
function cosine(a:Float32Array,b:Float32Array){let d=0,na=0,nb=0;for(let i=0;i<DIM;i++){d+=a[i]! * b[i]!;na+=a[i]! * a[i]!;nb+=b[i]! * b[i]!}return d/((Math.sqrt(na)*Math.sqrt(nb))||1)}
function tokenize(text:string){return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu)??[]}
function normalizeTerms(text:string){return tokenize(text).filter(v=>v.length>=2)}
function lexicalScore(query:string,text:string){const terms=normalizeTerms(query);if(!terms.length)return 0;const hay=new Set(normalizeTerms(text));let m=0;for(const t of new Set(terms))if(hay.has(t))m++;return m/new Set(terms).size}
function search(query:string,topK=TOP_K){const q=hashVector(query);return readBinary().map(item=>({text:item.text,score:.55*cosine(q,item.vector)+.45*lexicalScore(query,item.text)})).sort((a,b)=>b.score-a.score).slice(0,topK)}
function readVocab(){try{return (JSON.parse(fs.readFileSync(VOCAB_FILE,'utf8')) as {vocab?:string[]}).vocab??[]}catch{return[]}}
function trainVocab(texts:string[]){const old=readVocab(),seen=new Set(old),counts=new Map<string,number>();for(const text of texts)for(const token of tokenize(text))if(!seen.has(token))counts.set(token,(counts.get(token)??0)+1);const additions=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([t])=>t).filter(t=>!seen.has(t)).slice(0,Math.max(0,VOCAB_LIMIT-old.length));const vocab=[...old,...additions];if(vocab.length<old.length)throw new Error(`INVARIANTE VIOLADA: vocab nuevo ${vocab.length} < vocab anterior ${old.length}. Entrenamiento abortado.`);fs.writeFileSync(VOCAB_FILE,JSON.stringify({version:2,vocab,generatedAt:new Date().toISOString()},null,2));return vocab}
function positional(position:number,index:number){const angle=position/Math.pow(10000,(2*Math.floor(index/2))/DIM);return index%2===0?Math.sin(angle):Math.cos(angle)}
function seeded(seed:number){const x=Math.sin(seed*12.9898)*43758.5453;return x-Math.floor(x)}
function initModel(vocabSize:number):Model{const size=Math.max(4,vocabSize),make=(len:number,scale:number,salt:number)=>{const a=new Float32Array(len);for(let i=0;i<len;i++)a[i]=(seeded(i+salt)-.5)*scale;return a};return{vocabSize:size,dim:DIM,heads:HEADS,embeddings:make(size*DIM,.08,11),wq:make(DIM*DIM,.04,101),wk:make(DIM*DIM,.04,202),wv:make(DIM*DIM,.04,303),wo:make(DIM*DIM,.04,404),output:make(size*DIM,.04,505),bias:new Float32Array(size)}}
function saveModel(m:Model,file=MODEL_FILE){const h=Buffer.from(JSON.stringify({version:2,vocabSize:m.vocabSize,dim:m.dim,heads:m.heads})+'\n'),p=[m.embeddings,m.wq,m.wk,m.wv,m.wo,m.output,m.bias].map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength));const tmp=`${file}.tmp`;fs.writeFileSync(tmp,Buffer.concat([h,...p]));fs.renameSync(tmp,file)}
function loadModel(vocabSize:number):Model{try{const b=fs.readFileSync(MODEL_FILE),nl=b.indexOf(10);if(nl<0)return initModel(vocabSize);const meta=JSON.parse(b.subarray(0,nl).toString('utf8')) as {version?:number;vocabSize?:number;dim?:number;heads?:number};if(meta.version!==2||meta.dim!==DIM||meta.heads!==HEADS||typeof meta.vocabSize!=='number')return initModel(vocabSize);if(meta.vocabSize===vocabSize){let o=nl+1;const rd=(n:number)=>{const a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=b.readFloatLE(o+i*4);o+=n*4;return a};return{vocabSize,dim:DIM,heads:HEADS,embeddings:rd(vocabSize*DIM),wq:rd(DIM*DIM),wk:rd(DIM*DIM),wv:rd(DIM*DIM),wo:rd(DIM*DIM),output:rd(vocabSize*DIM),bias:rd(vocabSize)}}if(meta.vocabSize>vocabSize)throw new Error(`MODELO REGRESIVO: model.bin=${meta.vocabSize} > vocab=${vocabSize}`);let o=nl+1;const rd=(n:number)=>{const a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=b.readFloatLE(o+i*4);o+=n*4;return a};const old=meta.vocabSize,emb=rd(old*DIM),wq=rd(DIM*DIM),wk=rd(DIM*DIM),wv=rd(DIM*DIM),wo=rd(DIM*DIM),out=rd(old*DIM),bias=rd(old),m=initModel(vocabSize);m.wq.set(wq);m.wk.set(wk);m.wv.set(wv);m.wo.set(wo);m.embeddings.set(emb);m.output.set(out);m.bias.set(bias);return m}catch(error){throw new Error(`No se pudo cargar model.bin sin reinicializarlo: ${error instanceof Error?error.message:String(error)}`)}}
function matVec(matrix:Float32Array,input:Float32Array,rows:number,cols:number){const out=new Float32Array(rows);for(let r=0;r<rows;r++){let s=0,base=r*cols;for(let c=0;c<cols;c++)s+=matrix[base+c]! * input[c]!;out[r]=s}return out}
function relu(x:number){return x>0?x:0}
function forward(model:Model,ids:number[]){const t=ids.slice(-MAX_CONTEXT),states:Float32Array[]=[];for(let p=0;p<t.length;p++){const h=new Float32Array(DIM),base=t[p]! * DIM;for(let i=0;i<DIM;i++)h[i]=model.embeddings[base+i]!+positional(p,i);states.push(h)}const residual=states.map((h,pos)=>{const q=matVec(model.wq,h,DIM,DIM),ctx=new Float32Array(DIM);for(let head=0;head<HEADS;head++){const start=head*HEAD_DIM,s:number[]=[];for(let j=0;j<=pos;j++){const k=matVec(model.wk,states[j]!,DIM,DIM);let d=0;for(let x=0;x<HEAD_DIM;x++)d+=q[start+x]! * k[start+x]!;s.push(d/Math.sqrt(HEAD_DIM))}let max=-Infinity;for(const x of s)if(x>max)max=x;let total=0;for(let i=0;i<s.length;i++){s[i]=Math.exp(s[i]! - max);total+=s[i]!}for(let j=0;j<=pos;j++){const w=s[j]!/Math.max(total,1e-9),v=matVec(model.wv,states[j]!,DIM,DIM);for(let d=0;d<HEAD_DIM;d++)ctx[start+d]+=w*v[start+d]!}}const projected=matVec(model.wo,ctx,DIM,DIM);for(let i=0;i<DIM;i++)projected[i]=relu(projected[i]!+h[i]!);return projected});const last=residual.at(-1)!,logits=new Float32Array(model.vocabSize);let max=-Infinity;for(let i=0;i<model.vocabSize;i++){let v=model.bias[i]!;const base=i*DIM;for(let j=0;j<DIM;j++)v+=model.output[base+j]! * last[j]!;logits[i]=v;if(v>max)max=v}let sum=0;for(let i=0;i<logits.length;i++){logits[i]=Math.exp(Math.max(-30,logits[i]! - max));sum+=logits[i]!}for(let i=0;i<logits.length;i++)logits[i]/=Math.max(sum,1e-9);return{hidden:last,probs:logits}}
function trainStep(model:Model,ids:number[],lr=.001){if(ids.length<2)return null;const target=ids.at(-1)!,input=ids.slice(0,-1),pass=forward(model,input),prob=Math.max(pass.probs[target]!,1e-9),loss=-Math.log(prob);for(let i=0;i<model.vocabSize;i++){const g=pass.probs[i]!- (i===target?1:0),base=i*DIM;for(let j=0;j<DIM;j++)model.output[base+j]-=lr*g*pass.hidden[j]!;model.bias[i]-=lr*g}const base=target*DIM;for(let j=0;j<DIM;j++)model.embeddings[base+j]+=lr*.1*pass.hidden[j]!;return loss}
function sample(probs:Float32Array,temp=.65,topK=16){const items=[...probs].map((v,i)=>({value:Math.pow(Math.max(v,1e-12),1/Math.max(temp,.1)),index:i})).sort((a,b)=>b.value-a.value).slice(0,topK);const total=items.reduce((s,x)=>s+x.value,0);let c=Math.random()*total;for(const item of items){c-=item.value;if(c<=0)return item.index}return items[0]?.index??0}
function vectorSearchAnswer(q:string){const hits=search(q,3);return hits.length?hits.map((h,i)=>`${i+1}. ${h.text.slice(0,700)}`).join('\n\n'):'No tengo conocimiento local suficiente todavía.'}
function bestExtractiveAnswer(query:string,hits:Result[]){const terms=new Set(normalizeTerms(query)),c:{sentence:string;score:number}[]=[];for(const hit of hits)for(const sentence of hit.text.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>=20)){const st=new Set(normalizeTerms(sentence));let overlap=0;for(const t of terms)if(st.has(t))overlap++;const score=overlap/Math.max(terms.size,1)+hit.score*.25;if(score>0)c.push({sentence,score})}c.sort((a,b)=>b.score-a.score);return [...new Set(c.map(x=>x.sentence))].slice(0,3)}
function addLive(text:string){const value=clean(text);if(!value)return;ensureDirs();fs.appendFileSync(LIVE_FILE,`${new Date().toISOString()}\t${value}\n`);const parts=splitChunks(value),records=readBinary(),start=records.length?Math.max(...records.map(x=>x.id))+1:1;appendBinary(parts.map((part,i)=>({id:start+i,vector:hashVector(part),text:part})));trainVocab(parts);const s=getState();s.totalMessages++;s.totalChunks+=parts.length;saveState(s)}
async function train(reason='manual'){const initial=getState();if(initial.learning)return{started:false,reason:'already_running' as const};const vocab=readVocab(),records=readBinary().slice(-MAX_TRAIN_RECORDS),seq=records.map(x=>tokenize(x.text).map(t=>vocab.indexOf(t)).filter(id=>id>=0)).filter(ids=>ids.length>=2);if(!vocab.length||!seq.length)return{started:false,reason:'no_training_data' as const};const epochs=2,totalSteps=seq.reduce((s,ids)=>s+Math.max(1,ids.length-1),0)*epochs;updateProgress({learning:true,currentProgress:0,currentStep:0,currentTotalSteps:totalSteps,currentEpoch:0,currentTotalEpochs:epochs,currentMessage:`Preparando ${seq.length} secuencias`});const model=loadModel(vocab.length);let lossTotal=0,steps=0;const started=Date.now();try{for(let epoch=1;epoch<=epochs;epoch++){updateProgress({currentEpoch:epoch,currentMessage:`Entrenando época ${epoch}/${epochs}`});for(const ids of seq){for(let i=1;i<ids.length;i++){const loss=trainStep(model,ids.slice(Math.max(0,i-MAX_CONTEXT),i+1));if(loss!==null){lossTotal+=loss;steps++}const s=getState();s.currentStep++;s.currentProgress=Math.min(100,Math.round(s.currentStep/Math.max(s.currentTotalSteps,1)*100));if(steps%25===0)s.currentMessage=`Loss medio: ${(lossTotal/steps).toFixed(5)}`;saveState(s);if(steps%25===0)await new Promise<void>(r=>setImmediate(r))}}}saveModel(model);const run=getState();run.trainRuns++;run.trainSteps+=steps;run.trainedMessages=run.totalMessages;run.modelVersion++;run.lastTrainAt=new Date().toISOString();run.lastTrainDurationMs=Date.now()-started;run.lastLoss=steps?lossTotal/steps:null;run.bestLoss=run.lastLoss!==null&&(run.bestLoss===null||run.lastLoss<run.bestLoss)?run.lastLoss:run.bestLoss;run.learning=false;run.currentProgress=100;run.currentMessage=`Completado: ${steps} pasos`;saveState(run);return{started:true,reason,steps,loss:run.lastLoss,durationMs:run.lastTrainDurationMs}}catch(error){updateProgress({learning:false,currentMessage:'Entrenamiento detenido por error'});throw error}}
function stats(){const s=getState();let storageBytes=0;for(const f of [STATE_FILE,VOCAB_FILE,VECTORS_FILE,MODEL_FILE,LIVE_FILE])try{storageBytes+=fs.statSync(f).size}catch{}return{...s,pendingMessages:Math.max(0,s.totalMessages-s.trainedMessages),vectorRecords:readBinary().length,vocabSize:readVocab().length,storageBytes}}
function listDocuments(){ensureDirs();const files:string[]=[];const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(txt|md|csv|tsv|json|xml|html?|pdf|docx)$/i.test(entry.name))files.push(full)}};walk(CORPUS_DIR);return files.map(file=>{const st=fs.statSync(file);return{name:path.relative(CORPUS_DIR,file),size:st.size}})}
function answer(query:string){const hits=search(query,4),vocab=readVocab(),s=getState();if(!hits.length)return'No tengo conocimiento local suficiente todavía.';const extractive=bestExtractiveAnswer(query,hits),ready=Boolean(vocab.length&&s.trainSteps>=MIN_MODEL_TRAIN_STEPS_FOR_GENERATION);if(extractive.length&&!ready)return`${extractive.join(' ')}\n\nFuente local:\n${hits.slice(0,2).map((h,i)=>`${i+1}. ${h.text.slice(0,450)}`).join('\n\n')}`;if(!vocab.length)return vectorSearchAnswer(query);const ids=tokenize(query).map(t=>vocab.indexOf(t)).filter(id=>id>=0);if(!ids.length)return vectorSearchAnswer(query);const model=loadModel(vocab.length),generated=[...ids];for(let i=0;i<24;i++){const next=sample(forward(model,generated).probs);generated.push(next);if(next===2)break}const text=generated.slice(ids.length).map(id=>vocab[id]??'').filter(Boolean).join(' ').trim();return text.length>=8?`${text}\n\nContexto local:\n${hits.slice(0,2).map((h,i)=>`${i+1}. ${h.text.slice(0,500)}`).join('\n\n')}`:vectorSearchAnswer(query)}
function startAutoTrain(){ensureDirs();setInterval(()=>{const s=getState();if(s.autoTrainEnabled&&!s.learning&&s.totalMessages-s.trainedMessages>=MIN_AUTO_TRAIN_MESSAGES)void train('auto').catch(()=>undefined)},AUTO_TRAIN_EVERY_MS)}
export const miniLLM={ROOT,addLive,train,stats,listDocuments,answer,search,startAutoTrain,constants:{DIM,HEADS,VOCAB_LIMIT,AUTO_TRAIN_EVERY_MS,MIN_AUTO_TRAIN_MESSAGES}}
