// ── STATE ──────────────────────────────────────────────────────────────────────
let nodes=[], edges=[], sel=null, tool='select';
let vx=100, vy=80, vz=1;
let isPan=false, panS={x:0,y:0}, panO={x:0,y:0};
let isDrag=false, dragS={x:0,y:0}, dragO={x:0,y:0};
let cxStart=null;
let hist=[], histIdx=-1;
let uid=1;
let dirty=false;   // tracks unsaved changes
let lastSavedSnapshot='';  // JSON of last saved state

const SVG=document.getElementById('main-svg');
const NG=document.getElementById('nodes-g');
const EG=document.getElementById('edges-g');
const wrap=document.getElementById('canvas-wrap');

const THEMES = {
  dark: {
    gridLine: '#2a2a3d',
    defs: {
      entity:    {label:'ENTITY',   w:160,h:100,hdr:'#1a4480',fill:'#181825',stroke:'#89b4fa',tc:'#fff', tuple:'#cdd6f4', tuplePk:'#89b4fa',type:'rect'},
      weak_entity:{label:'WEAK',    w:160,h:100,hdr:'#155228',fill:'#181825',stroke:'#1a6b3a',tc:'#aef2c0', tuple:'#cdd6f4', tuplePk:'#aef2c0',type:'rect',weak:true},
      relationship:{label:'HAS',    w:110,h:56, fill:'#181825',stroke:'#f9e2af',tc:'#f9e2af',type:'diamond'},
      id_relationship:{label:'HAS', w:110,h:56, fill:'#181825',stroke:'#a6e3a1',tc:'#a6e3a1',type:'diamond',dbl:true},
      attribute:  {label:'attribute',rx:62,ry:20,fill:'#181825',stroke:'#cba6f7',tc:'#cba6f7',type:'ellipse'},
      pk_attribute:{label:'pk_attr',rx:62,ry:20,fill:'#181825',stroke:'#89b4fa',tc:'#89b4fa',type:'ellipse',dbl:true,ul:true},
      derived:    {label:'derived', rx:62,ry:20,fill:'#181825',stroke:'#cba6f7',tc:'#cba6f7',type:'ellipse',dash:true},
      multivalued:{label:'multi',   rx:62,ry:20,fill:'#181825',stroke:'#cba6f7',tc:'#cba6f7',type:'ellipse',dbl:true},
      note:       {label:'Note',    w:160,h:60, fill:'#181825',stroke:'#6c7086',tc:'#a6adc8',type:'note',dash:true}
    },
    edgeStroke: '#6c7086',
    edgeSel: '#cba6f7',
    edgeCardBg: '#1e1e2e',
    edgeCardText: '#f9e2af',
    selStroke: '#cba6f7'
  },
  light: {
    gridLine: '#dce0e8',
    defs: {
      entity:    {label:'ENTITY',   w:160,h:100,hdr:'#1e66f5',fill:'#ffffff',stroke:'#7287fd',tc:'#fff', tuple:'#4c4f69', tuplePk:'#1e66f5',type:'rect'},
      weak_entity:{label:'WEAK',    w:160,h:100,hdr:'#40a02b',fill:'#ffffff',stroke:'#52c837',tc:'#ffffff', tuple:'#4c4f69', tuplePk:'#40a02b',type:'rect',weak:true},
      relationship:{label:'HAS',    w:110,h:56, fill:'#ffffff',stroke:'#df8e1d',tc:'#df8e1d',type:'diamond'},
      id_relationship:{label:'HAS', w:110,h:56, fill:'#ffffff',stroke:'#40a02b',tc:'#40a02b',type:'diamond',dbl:true},
      attribute:  {label:'attribute',rx:62,ry:20,fill:'#ffffff',stroke:'#8839ef',tc:'#8839ef',type:'ellipse'},
      pk_attribute:{label:'pk_attr',rx:62,ry:20,fill:'#ffffff',stroke:'#1e66f5',tc:'#1e66f5',type:'ellipse',dbl:true,ul:true},
      derived:    {label:'derived', rx:62,ry:20,fill:'#ffffff',stroke:'#8839ef',tc:'#8839ef',type:'ellipse',dash:true},
      multivalued:{label:'multi',   rx:62,ry:20,fill:'#ffffff',stroke:'#8839ef',tc:'#8839ef',type:'ellipse',dbl:true},
      note:       {label:'Note',    w:160,h:60, fill:'#e6e9ef',stroke:'#8c8fa1',tc:'#5c5f77',type:'note',dash:true}
    },
    edgeStroke: '#9ca0b0',
    edgeSel: '#8839ef',
    edgeCardBg: '#eff1f5',
    edgeCardText: '#df8e1d',
    selStroke: '#8839ef'
  }
};

let currentTheme = 'dark';
let DEFS = THEMES.dark.defs;

// ── THEME ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  DEFS = THEMES[currentTheme].defs;
  document.querySelector('#grid-svg').innerHTML = `<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0L0 0 0 20" fill="none" stroke="${THEMES[currentTheme].gridLine}" stroke-width="0.6"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>`;
  renderAll();
}

// ── PROPS / SIDEBAR TOGGLE ───────────────────────────────────────────────────
function toggleProps() {
  const p = document.getElementById('props');
  const t = document.getElementById('props-toggle');
  p.classList.toggle('closed');
  if(t) {
    t.classList.toggle('closed');
    t.innerHTML = p.classList.contains('closed') ? '&lt;' : '&gt;';
  }
}
function toggleSidebar() {
  const p = document.getElementById('sidebar');
  const t = document.getElementById('sidebar-toggle');
  p.classList.toggle('closed');
  if(t) {
    t.classList.toggle('closed');
    t.innerHTML = p.classList.contains('closed') ? '&gt;' : '&lt;';
  }
}

// ── EVENT COORD ABSTRACTION ──────────────────────────────────────────────────
function getPos(e){
  if(e.touches && e.touches.length > 0) return {x:e.touches[0].clientX, y:e.touches[0].clientY};
  if(e.changedTouches && e.changedTouches.length > 0) return {x:e.changedTouches[0].clientX, y:e.changedTouches[0].clientY};
  return {x:e.clientX, y:e.clientY};
}

// ── TRANSFORM ──────────────────────────────────────────────────────────────────
function applyT(){
  SVG.style.transform=`translate(${vx}px,${vy}px) scale(${vz})`;
  document.getElementById('st-zoom').textContent='Zoom: '+Math.round(vz*100)+'%';
}
function zoom1(f){
  const rect=wrap.getBoundingClientRect();
  const cx=rect.width/2, cy=rect.height/2;
  const newVz=Math.min(Math.max(vz*f,0.15),5);
  const actualF=newVz/vz;
  vx=cx-(cx-vx)*actualF; vy=cy-(cy-vy)*actualF; vz=newVz;
  applyT();
}
function fitView(){vx=100;vy=80;vz=1;applyT();}

wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const f=e.deltaY>0?0.9:1.1;
  const rect=wrap.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const newVz=Math.min(Math.max(vz*f,0.15),5);
  const actualF=newVz/vz;
  vx=mx-(mx-vx)*actualF; vy=my-(my-vy)*actualF; vz=newVz;
  applyT();
},{passive:false});

function toCanvas(cx,cy){
  const r=wrap.getBoundingClientRect();
  return {x:(cx-r.left-vx)/vz, y:(cy-r.top-vy)/vz};
}

// ── TOOL ───────────────────────────────────────────────────────────────────────
function setTool(t){
  tool=t; cxStart=null;
  ['select','connect','pan'].forEach(k=>{
    const b=document.getElementById('btn-'+k);
    if(b) b.classList.toggle('active',k===t);
  });
  wrap.style.cursor=t==='pan'?'grab':'default';
  document.getElementById('st-tool').textContent='Tool: '+t[0].toUpperCase()+t.slice(1);
  if(t!=='connect') cxStart=null;
}

// ── PAN / DRAG ─────────────────────────────────────────────────────────────────
function handleDown(e) {
  if (e.type === 'mousedown' && e.button !== 0 && !e.ctrlKey) return;
  const pos = getPos(e);
  if(tool==='pan' || (e.ctrlKey && e.type === 'mousedown')){
    isPan=true; panS={x:pos.x, y:pos.y}; panO={x:vx, y:vy};
    if(e.cancelable) e.preventDefault();
  } else if(e.target===wrap||e.target===SVG||e.target.tagName==='svg'){
    setSel(null);
  }
}
function handleMove(e) {
  const pos = getPos(e);
  if(isPan){vx=panO.x+(pos.x-panS.x); vy=panO.y+(pos.y-panS.y); applyT();}
  if(isDrag&&sel){
    const n=nodes.find(n=>n.id===sel);
    if(n){n.x=dragO.x+(pos.x-dragS.x)/vz; n.y=dragO.y+(pos.y-dragS.y)/vz; renderAll();}
    if(e.cancelable) e.preventDefault(); // prevent scrolling while dragging
  }
}
function handleUp(e) {
  if(isDrag) saveH();
  isPan=false; isDrag=false;
}

wrap.addEventListener('mousedown', handleDown);
wrap.addEventListener('touchstart', handleDown, {passive:false});

window.addEventListener('mousemove', handleMove);
window.addEventListener('touchmove', handleMove, {passive:false});

window.addEventListener('mouseup', handleUp);
window.addEventListener('touchend', handleUp);
window.addEventListener('touchcancel', handleUp);

// ── HELPERS ────────────────────────────────────────────────────────────────────
function se(tag,attrs,txt){
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const[k,v] of Object.entries(attrs)) e.setAttribute(k,String(v));
  if(txt!==undefined) e.textContent=txt;
  return e;
}
function mkId(){return 'n'+(uid++);}

// ── ADD SHAPE ──────────────────────────────────────────────────────────────────
function addShape(type,x,y){
  const d=DEFS[type]; if(!d) return;
  const node={
    id:mkId(), type,
    x:x??500, y:y??300,
    label:d.label,
    tuples:[], // [{label,isPK,isPartial,isFk}]
    w:d.w??140, h:d.h??60,
    rx:d.rx??60, ry:d.ry??20
  };
  // default tuples for entities
  if(type==='entity') node.tuples=[{label:'id',isPK:true,isPartial:false,isFk:false},{label:'attribute1',isPK:false,isPartial:false,isFk:false}];
  if(type==='weak_entity') node.tuples=[{label:'partial_key',isPK:false,isPartial:true,isFk:false},{label:'attribute1',isPK:false,isPartial:false,isFk:false}];
  nodes.push(node);
  saveH(); renderAll(); setSel(node.id);
}

// ── RENDER ─────────────────────────────────────────────────────────────────────
function renderAll(){
  NG.innerHTML=''; EG.innerHTML='';
  edges.forEach(renderEdge);
  nodes.forEach(renderNode);
  document.getElementById('st-nodes').textContent='Nodes: '+nodes.length;
  document.getElementById('st-edges').textContent='Edges: '+edges.length;
}

function nodeSize(node){
  const d=DEFS[node.type]||DEFS.entity;
  if(d.type==='rect'||d.type==='note'){
    const tuples=node.tuples||[];
    const hdrH = d.weak ? 34 : 26;
    const minH=Math.max(node.h||60, tuples.length>0 ? hdrH+12+tuples.length*17 : hdrH+24);
    return {w:node.w||160, h:minH};
  }
  return {w:node.rx*2||120,h:node.ry*2||40};
}

function renderNode(node){
  const th = THEMES[currentTheme];
  const d=DEFS[node.type]||DEFS.entity;
  const g=se('g',{'class':'node-g'+(sel===node.id?' sel':''),'data-id':node.id});
  const {w,h}=nodeSize(node);

  if(d.type==='rect'||d.type==='note'){
    const x=node.x-w/2, y=node.y-h/2;
    // outer double border for weak
    if(d.weak){
      g.appendChild(se('rect',{x:x-4,y:y-4,width:w+8,height:h+8,rx:3,fill:'none',stroke:d.stroke,'stroke-width':1.5,'class':'nb'}));
    }
    // main box
    const box=se('rect',{x,y,width:w,height:h,rx:2,fill:d.fill,stroke:sel===node.id?th.selStroke:d.stroke,'stroke-width':sel===node.id?2.5:2,'class':'nb','stroke-dasharray':d.dash?'6 3':'none'});
    g.appendChild(box);

    if(d.type==='rect'){
      const hdrH = d.weak ? 34 : 26;
      // header
      const hbar=se('rect',{x,y,width:w,height:hdrH,rx:2,fill:d.hdr});
      g.appendChild(hbar);
      // title
      const tit=se('text',{x:node.x,y:d.weak ? y+11 : y+14,'text-anchor':'middle','dominant-baseline':'central','font-size':11,'font-weight':700,fill:d.tc,'font-family':'Segoe UI,sans-serif'});
      tit.textContent=node.label;
      g.appendChild(tit);
      // weak sub-label
      if(d.weak){
        const sub=se('text',{x:node.x,y:y+24,'text-anchor':'middle','dominant-baseline':'central','font-size':8,fill:d.tc,'font-family':'Segoe UI,sans-serif'});
        sub.textContent='(Weak Entity)';
        g.appendChild(sub);
      }
      // divider
      g.appendChild(se('line',{x1:x,y1:y+hdrH,x2:x+w,y2:y+hdrH,stroke:d.stroke,'stroke-width':1}));
      // tuples
      const tuples=node.tuples||[];
      tuples.forEach((t,i)=>{
        const ty=y+hdrH+12+i*17;
        g.appendChild(se('text',{x:x+10,y:ty,'font-size':10,fill:th.edgeStroke,'font-family':'Segoe UI,sans-serif'},'•'));
        const lbl=(t.isPK?'🔑 ':'')+(t.isFk?'🔗 ':'')+t.label+(t.isPK?' (PK)':t.isPartial?' (Partial Key)':t.isFk?' (FK)':'');
        const tt=se('text',{x:x+20,y:ty,'font-size':10,fill:t.isPK||t.isPartial?d.tuplePk:d.tuple,
          'font-weight':t.isPK||t.isPartial?700:400,
          'text-decoration':t.isPK||t.isPartial?'underline':'none',
          'font-family':'Segoe UI,sans-serif'});
        tt.textContent=lbl;
        g.appendChild(tt);
      });
    } else {
      // note
      const tit=se('text',{x:node.x,y:node.y,'text-anchor':'middle','dominant-baseline':'central','font-size':10,fill:d.tc,'font-family':'Segoe UI,sans-serif'});
      tit.textContent=node.label;
      g.appendChild(tit);
    }
  } else if(d.type==='diamond'){
    const hw=node.w/2, hh=node.h/2;
    const pts=`${node.x},${node.y-hh} ${node.x+hw},${node.y} ${node.x},${node.y+hh} ${node.x-hw},${node.y}`;
    if(d.dbl){
      const op=`${node.x},${node.y-hh-5} ${node.x+hw+7},${node.y} ${node.x},${node.y+hh+5} ${node.x-hw-7},${node.y}`;
      g.appendChild(se('polygon',{points:op,fill:'none',stroke:d.stroke,'stroke-width':1.5}));
    }
    g.appendChild(se('polygon',{points:pts,fill:d.fill,stroke:sel===node.id?th.selStroke:d.stroke,'stroke-width':sel===node.id?2.5:2,'class':'nb'}));
    const tit=se('text',{x:node.x,y:node.y,'text-anchor':'middle','dominant-baseline':'central','font-size':11,'font-weight':700,fill:d.tc,'font-family':'Segoe UI,sans-serif'});
    tit.textContent=node.label;
    g.appendChild(tit);
  } else {
    // ellipse
    const rx=node.rx??60, ry=node.ry??20;
    if(d.dbl) g.appendChild(se('ellipse',{cx:node.x,cy:node.y,rx:rx+4,ry:ry+4,fill:'none',stroke:d.stroke,'stroke-width':1.2}));
    g.appendChild(se('ellipse',{cx:node.x,cy:node.y,rx,ry,fill:d.fill,stroke:sel===node.id?th.selStroke:d.stroke,
      'stroke-width':sel===node.id?2.5:1.5,'class':'nb','stroke-dasharray':d.dash?'5 3':'none'}));
    const tit=se('text',{x:node.x,y:node.y,'text-anchor':'middle','dominant-baseline':'central','font-size':10,
      fill:d.tc,'font-weight':d.ul?700:400,'text-decoration':d.ul?'underline':'none','font-family':'Segoe UI,sans-serif'});
    tit.textContent=node.label;
    g.appendChild(tit);
  }

  // invisible hit area
  const {w:sw,h:sh}=nodeSize(node);
  const hit=se('rect',{x:node.x-sw/2,y:node.y-sh/2,width:sw,height:sh,fill:'transparent',stroke:'none'});
  g.appendChild(hit);

  g.addEventListener('mousedown',e=>onNodeDown(e,node));
  g.addEventListener('touchstart',e=>onNodeDown(e,node), {passive:false});
  g.addEventListener('dblclick',e=>{e.stopPropagation(); promptLabel(node);});
  NG.appendChild(g);
}

function renderEdge(edge){
  const th = THEMES[currentTheme];
  const n1=nodes.find(n=>n.id===edge.from), n2=nodes.find(n=>n.id===edge.to);
  if(!n1||!n2) return;
  const g=se('g',{'class':'edge-g','data-id':edge.id});
  const isSel=sel===edge.id;
  const isId=edge.dashed;

  // line
  const ln=se('line',{x1:n1.x,y1:n1.y,x2:n2.x,y2:n2.y,
    stroke:isSel?th.selStroke:th.edgeStroke,'stroke-width':isSel?2:1.5,
    'stroke-dasharray':isId?'8 4':'none'});
  g.appendChild(ln);

  // cardinality labels — near diamond
  let cText='';
  if(edge.card1&&edge.card2) cText=edge.card1+':'+edge.card2;
  else if(edge.card1) cText=edge.card1;
  else if(edge.card2) cText=edge.card2;

  if(cText){
    let t = 0.5;
    const t1 = (DEFS[n1.type]||{}).type, t2 = (DEFS[n2.type]||{}).type;
    if(t1 === 'diamond' && t2 !== 'diamond') t = 0.28;
    else if(t2 === 'diamond' && t1 !== 'diamond') t = 0.72;
    const cx=n1.x+(n2.x-n1.x)*t, cy=n1.y+(n2.y-n1.y)*t;
    const cw=cText.length>1?32:20;
    const bg=se('rect',{x:cx-cw/2,y:cy-10,width:cw,height:20,rx:10,fill:th.edgeCardBg,stroke:isSel?th.selStroke:th.edgeStroke,'stroke-width':1});
    g.appendChild(bg);
    const ct=se('text',{x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'central',
      'font-size':11,'font-weight':700,fill:isSel?th.selStroke:th.edgeCardText,'font-family':'Segoe UI,sans-serif'});
    ct.textContent=cText;
    g.appendChild(ct);
  }

  // hit area
  g.appendChild(se('line',{x1:n1.x,y1:n1.y,x2:n2.x,y2:n2.y,stroke:'transparent','stroke-width':14}));
  g.addEventListener('mousedown',e=>{e.stopPropagation(); setSel(edge.id); showEdgeProps(edge);});
  g.addEventListener('touchstart',e=>{e.stopPropagation(); setSel(edge.id); showEdgeProps(edge);}, {passive:false});
  EG.appendChild(g);
}

// ── SELECTION ──────────────────────────────────────────────────────────────────
function setSel(id){
  sel=id; renderAll();
  if(!id){document.getElementById('props-body').innerHTML='<p class="empty-msg">Click a shape to edit it.<br><br>Double-click to rename.</p>'; return;}
  const node=nodes.find(n=>n.id===id);
  const edge=edges.find(e=>e.id===id);
  if(node) showNodeProps(node);
  if(edge) showEdgeProps(edge);
}

function onNodeDown(e,node){
  e.stopPropagation();
  if(e.cancelable && e.type === 'touchstart') e.preventDefault();
  if(tool==='connect'){
    if(!cxStart){cxStart=node.id; document.getElementById('st-tool').textContent='Connect → tap target';}
    else if(cxStart!==node.id){
      const isId=DEFS[nodes.find(n=>n.id===cxStart)?.type]?.weak||DEFS[node.type]?.weak;
      const edge={id:mkId(),from:cxStart,to:node.id,card1:'',card2:'',dashed:false};
      edges.push(edge); cxStart=null; saveH(); renderAll(); setSel(edge.id);
      document.getElementById('st-tool').textContent='Tool: Connect';
    }
    return;
  }
  setSel(node.id);
  const pos=getPos(e);
  isDrag=true; dragS={x:pos.x,y:pos.y}; dragO={x:node.x,y:node.y};
}

// ── PROPS: NODE ────────────────────────────────────────────────────────────────
function showNodeProps(node){
  const d=DEFS[node.type]||{};
  const isEllipse=['attribute','pk_attribute','derived','multivalued'].includes(node.type);
  const isEntity=['entity','weak_entity'].includes(node.type);
  const tuples=node.tuples||[];

  let tuplesHTML='';
  if(isEntity){
    tuplesHTML=`
    <div class="pr">
      <label>Attributes (one per line)</label>
      <div style="font-size:9px;color:#6c7086;margin-bottom:3px">
        Prefix with <b>PK:</b> for Primary Key, <b>FK:</b> for Foreign Key, <b>P:</b> for Partial Key<br>
        e.g. <code style="color:#cba6f7">PK: id</code> or <code style="color:#cba6f7">FK: room_id</code>
      </div>
      <textarea id="tuple-ta" rows="8" style="font-family:monospace">${tuples.map(t=>(t.isPK?'PK: ':t.isPartial?'P: ':t.isFk?'FK: ':'')+t.label).join('\n')}</textarea>
      <button class="pbtn primary" style="margin-top:4px" onclick="applyTuples('${node.id}')">Apply Attributes</button>
    </div>`;
  }

  document.getElementById('props-body').innerHTML=`
    <div class="pr">
      <label>Type</label>
      <select onchange="changeType('${node.id}',this.value)">
        ${Object.keys(DEFS).map(t=>`<option value="${t}"${t===node.type?' selected':''}>${t.replace(/_/g,' ')}</option>`).join('')}
      </select>
    </div>
    <div class="pr">
      <label>Label / Name</label>
      <input type="text" value="${node.label}" oninput="setProp('${node.id}','label',this.value)"/>
    </div>
    ${isEllipse?`
    <div class="pr"><label>Radius X</label><input type="number" value="${node.rx}" oninput="setProp('${node.id}','rx',+this.value)"/></div>
    <div class="pr"><label>Radius Y</label><input type="number" value="${node.ry}" oninput="setProp('${node.id}','ry',+this.value)"/></div>
    `:`
    <div class="pr"><label>Width</label><input type="number" value="${node.w}" oninput="setProp('${node.id}','w',+this.value)"/></div>
    `}
    ${tuplesHTML}
    <button class="pbtn danger" onclick="deleteSelected()">Delete Shape</button>
  `;
}

function applyTuples(id){
  const node=nodes.find(n=>n.id===id); if(!node) return;
  const raw=document.getElementById('tuple-ta').value;
  node.tuples=raw.split('\n').filter(l=>l.trim()).map(l=>{
    const isPK=l.startsWith('PK:');
    const isP=l.startsWith('P:');
    const isFk=l.startsWith('FK:');
    const label=l.replace(/^(PK:|P:|FK:)\s*/,'').trim();
    return {label,isPK,isPartial:isP,isFk};
  });
  saveH(); renderAll(); showNodeProps(node);
}

function setProp(id,key,val){
  const n=nodes.find(n=>n.id===id); if(!n) return;
  n[key]=val; renderAll();
}

function changeType(id,type){
  const n=nodes.find(n=>n.id===id); if(!n) return;
  const d=DEFS[type]; n.type=type;
  if(d.w) n.w=d.w; if(d.h) n.h=d.h;
  if(d.rx) n.rx=d.rx; if(d.ry) n.ry=d.ry;
  if(type==='entity'&&!n.tuples?.length) n.tuples=[{label:'id',isPK:true,isPartial:false,isFk:false}];
  if(type==='weak_entity'&&!n.tuples?.length) n.tuples=[{label:'partial_key',isPK:false,isPartial:true,isFk:false}];
  saveH(); renderAll(); showNodeProps(n);
}

function promptLabel(node){
  const v=prompt('Rename:',node.label);
  if(v!==null){node.label=v; saveH(); renderAll(); showNodeProps(node);}
}

// ── PROPS: EDGE ────────────────────────────────────────────────────────────────
function showEdgeProps(edge){
  const n1=nodes.find(n=>n.id===edge.from), n2=nodes.find(n=>n.id===edge.to);
  document.getElementById('props-body').innerHTML=`
    <div class="pr"><label>From</label><input readonly value="${n1?.label||edge.from}"/></div>
    <div class="pr"><label>To</label><input readonly value="${n2?.label||edge.to}"/></div>
    <div class="pr">
      <label>Cardinality</label>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:4px">
        <select id="ec1" onchange="setEdgeProp('${edge.id}','card1',this.value)">
          ${['','1','N','M'].map(v=>`<option${edge.card1===v?' selected':''}>${v}</option>`).join('')}
        </select>
        <span style="font-size:11px;color:#6c7086">:</span>
        <select id="ec2" onchange="setEdgeProp('${edge.id}','card2',this.value)">
          ${['','1','N','M'].map(v=>`<option${edge.card2===v?' selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div style="font-size:9px;color:#6c7086">Left = near "${n1?.label||'from'}" side</div>
    </div>
    <div class="pr">
      <label>Line Style</label>
      <select onchange="setEdgeProp('${edge.id}','dashed',this.value==='true')">
        <option value="false"${!edge.dashed?' selected':''}>Solid (regular)</option>
        <option value="true"${edge.dashed?' selected':''}>Dashed (identifying)</option>
      </select>
    </div>
    <div style="background:var(--bg-main);border:1px solid var(--border);border-radius:5px;padding:8px;margin-bottom:8px;font-size:10px;color:var(--text-legend)">
      <b style="color:var(--text-main)">Cardinality guide:</b><br>
      <b>1:1</b> — One booking has one guest<br>
      <b>1:N</b> — One room type has many units<br>
      <b>M:N</b> — Students enroll in many subjects
    </div>
    <button class="pbtn danger" onclick="deleteSelected()">Delete Edge</button>
  `;
}

function setEdgeProp(id,key,val){
  const e=edges.find(e=>e.id===id); if(!e) return;
  e[key]=val; saveH(); renderAll(); showEdgeProps(e);
}

// ── DELETE ─────────────────────────────────────────────────────────────────────
function deleteSelected(){
  if(!sel) return;
  nodes=nodes.filter(n=>n.id!==sel);
  edges=edges.filter(e=>e.id!==sel&&e.from!==sel&&e.to!==sel);
  sel=null; saveH(); renderAll();
  document.getElementById('props-body').innerHTML='<p class="empty-msg">Click a shape to edit it.</p>';
}

// ── HISTORY ────────────────────────────────────────────────────────────────────
function saveH(){
  const s=JSON.stringify({nodes,edges});
  hist=hist.slice(0,histIdx+1); hist.push(s); histIdx=hist.length-1;
  markDirty();
}
function undo(){
  if(histIdx>0){histIdx--; const s=JSON.parse(hist[histIdx]); nodes=s.nodes; edges=s.edges; sel=null; renderAll(); markDirty();}
}

// ── DIRTY TRACKING ────────────────────────────────────────────────────────────
function markDirty(){
  const current = JSON.stringify({nodes,edges});
  dirty = current !== lastSavedSnapshot;
  updateTitle();
}

function updateTitle(){
  const base = 'Chen ER Diagram Editor';
  document.title = dirty ? '● ' + base + ' (unsaved)' : base;
}

// ── SAVE / LOAD (JSON) ────────────────────────────────────────────────────────
function saveProject(){
  const data = JSON.stringify({nodes, edges, uid, theme: currentTheme}, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'er_diagram.json';
  a.click();
  URL.revokeObjectURL(a.href);
  lastSavedSnapshot = JSON.stringify({nodes,edges});
  dirty = false;
  updateTitle();
}

function openProject(){
  document.getElementById('file-input').click();
}

function handleFileLoad(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    try {
      const data = JSON.parse(ev.target.result);
      if(data.nodes && data.edges){
        nodes = data.nodes;
        edges = data.edges;
        if(data.uid) uid = data.uid;
        if(data.theme && THEMES[data.theme]){
          currentTheme = data.theme;
          document.documentElement.setAttribute('data-theme', currentTheme);
          DEFS = THEMES[currentTheme].defs;
          document.querySelector('#grid-svg').innerHTML = `<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0L0 0 0 20" fill="none" stroke="${THEMES[currentTheme].gridLine}" stroke-width="0.6"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>`;
        }
        sel = null;
        hist = []; histIdx = -1;
        saveH();
        lastSavedSnapshot = JSON.stringify({nodes,edges});
        dirty = false;
        updateTitle();
        renderAll();
        fitView();
      } else {
        alert('Invalid file: missing nodes or edges data.');
      }
    } catch(err){
      alert('Error reading file: ' + err.message);
    }
  };
  reader.readAsText(file);
  // reset input so same file can be loaded again
  e.target.value = '';
}

function newProject(){
  if(dirty){
    const choice = confirm('You have unsaved changes. Do you want to discard them and start a new project?');
    if(!choice) return;
  }
  nodes = []; edges = []; sel = null; uid = 1;
  hist = []; histIdx = -1;
  saveH();
  lastSavedSnapshot = JSON.stringify({nodes,edges});
  dirty = false;
  updateTitle();
  renderAll();
}

// ── CLEAR ──────────────────────────────────────────────────────────────────────
function clearAll(){
  if(!nodes.length||confirm('Clear the canvas?')){nodes=[];edges=[];sel=null;saveH();renderAll();}
}

// ── EXPORT ─────────────────────────────────────────────────────────────────────
function doExport(){
  const s=SVG.cloneNode(true);
  s.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const blob=new Blob([s.outerHTML],{type:'image/svg+xml'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='er_diagram.svg'; a.click();
}

// ── KEYBOARD ───────────────────────────────────────────────────────────────────
window.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if(e.key==='Delete'||e.key==='Backspace') deleteSelected();
  if(e.key==='v'||e.key==='V') setTool('select');
  if(e.key==='c'||e.key==='C') setTool('connect');
  if(e.key===' '){e.preventDefault(); setTool('pan');}
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault(); undo();}
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault(); saveProject();}
});
window.addEventListener('keyup',e=>{if(e.key===' ') setTool('select');});

// ── UNSAVED CHANGES WARNING ───────────────────────────────────────────────────
window.addEventListener('beforeunload', e=>{
  if(dirty){
    e.preventDefault();
    e.returnValue = '';
  }
});

// ── SIDEBAR DRAG ───────────────────────────────────────────────────────────────
document.querySelectorAll('.shape-btn[data-type]').forEach(btn=>{
  function startSidebarDrag(e) {
    if(e.cancelable && e.type === 'touchstart') e.preventDefault();
    const type=btn.dataset.type;
    function onUp(mu){
      window.removeEventListener('mouseup',onUp);
      window.removeEventListener('touchend',onUp);
      const posE = getPos(mu);
      const r=wrap.getBoundingClientRect();
      if(posE.x>r.left&&posE.x<r.right&&posE.y>r.top&&posE.y<r.bottom){
        const pos=toCanvas(posE.x,posE.y);
        addShape(type,pos.x,pos.y);
      }
    }
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchend',onUp);
  }
  btn.addEventListener('mousedown', startSidebarDrag);
  btn.addEventListener('touchstart', startSidebarDrag, {passive:false});
});

// ── FILE INPUT LISTENER ───────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', handleFileLoad);

// ── HOTEL SAMPLE ──────────────────────────────────────────────────────────────
function loadSample(){
  clearAll(); uid=300;
  nodes=[
    {id:'s1',type:'entity',label:'BOOKINGS',x:520,y:350,w:190,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'reservation_number',isPK:false,isPartial:false,isFk:false},
      {label:'room_type_id',isPK:false,isPartial:false,isFk:true},
      {label:'room_unit_id',isPK:false,isPartial:false,isFk:true},
      {label:'adults',isPK:false,isPartial:false,isFk:false},
      {label:'kids',isPK:false,isPartial:false,isFk:false},
      {label:'chargeable_kids',isPK:false,isPartial:false,isFk:false},
      {label:'check_in',isPK:false,isPartial:false,isFk:false},
      {label:'check_in_at',isPK:false,isPartial:false,isFk:false},
      {label:'check_out',isPK:false,isPartial:false,isFk:false},
      {label:'check_out_at',isPK:false,isPartial:false,isFk:false},
      {label:'extension_hours',isPK:false,isPartial:false,isFk:false},
      {label:'extension_fee',isPK:false,isPartial:false,isFk:false},
      {label:'nights',isPK:false,isPartial:false,isFk:false},
      {label:'total_price',isPK:false,isPartial:false,isFk:false},
      {label:'booking_status',isPK:false,isPartial:false,isFk:false},
      {label:'deleted_at',isPK:false,isPartial:false,isFk:false},
      {label:'deleted_by_admin_id',isPK:false,isPartial:false,isFk:true},
      {label:'deleted_reason',isPK:false,isPartial:false,isFk:false},
      {label:'deleted_previous_status',isPK:false,isPartial:false,isFk:false},
      {label:'special_requests',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
      {label:'updated_at',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s2',type:'entity',label:'ROOM_TYPES',x:180,y:150,w:180,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'room_name',isPK:false,isPartial:false,isFk:false},
      {label:'max_guests',isPK:false,isPartial:false,isFk:false},
      {label:'bedrooms',isPK:false,isPartial:false,isFk:false},
      {label:'bathrooms',isPK:false,isPartial:false,isFk:false},
      {label:'base_price',isPK:false,isPartial:false,isFk:false},
      {label:'extra_person_charge',isPK:false,isPartial:false,isFk:false},
      {label:'description',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s3',type:'weak_entity',label:'ROOM_UNITS',x:180,y:550,w:180,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'room_type_id',isPK:false,isPartial:false,isFk:true},
      {label:'unit_number',isPK:false,isPartial:true,isFk:false},
      {label:'status',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s4',type:'entity',label:'ADMIN_USERS',x:870,y:150,w:180,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'username',isPK:false,isPartial:false,isFk:false},
      {label:'password_hash',isPK:false,isPartial:false,isFk:false},
      {label:'full_name',isPK:false,isPartial:false,isFk:false},
      {label:'email',isPK:false,isPartial:false,isFk:false},
      {label:'role',isPK:false,isPartial:false,isFk:false},
      {label:'is_active',isPK:false,isPartial:false,isFk:false},
      {label:'last_login',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
      {label:'updated_at',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s5',type:'weak_entity',label:'PAYMENTS',x:870,y:400,w:180,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'booking_id',isPK:false,isPartial:false,isFk:true},
      {label:'amount_paid',isPK:false,isPartial:false,isFk:false},
      {label:'cash_received',isPK:false,isPartial:false,isFk:false},
      {label:'change_amount',isPK:false,isPartial:false,isFk:false},
      {label:'payment_type',isPK:false,isPartial:false,isFk:false},
      {label:'payment_method',isPK:false,isPartial:false,isFk:false},
      {label:'payment_status',isPK:false,isPartial:false,isFk:false},
      {label:'reference_number',isPK:false,isPartial:false,isFk:false},
      {label:'payment_date',isPK:false,isPartial:false,isFk:false},
      {label:'notes',isPK:false,isPartial:false,isFk:false},
      {label:'created_by',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s6',type:'weak_entity',label:'GUESTS',x:870,y:700,w:180,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'booking_id',isPK:false,isPartial:false,isFk:true},
      {label:'full_name',isPK:false,isPartial:false,isFk:false},
      {label:'contact_number',isPK:false,isPartial:false,isFk:false},
      {label:'email',isPK:false,isPartial:false,isFk:false},
      {label:'age',isPK:false,isPartial:false,isFk:false},
      {label:'id_type',isPK:false,isPartial:false,isFk:false},
      {label:'id_number',isPK:false,isPartial:false,isFk:false},
      {label:'address',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
      {label:'updated_at',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s7',type:'entity',label:'ACTIVITY_LOGS',x:1200,y:150,w:180,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'user_id',isPK:false,isPartial:false,isFk:true},
      {label:'admin_username',isPK:false,isPartial:false,isFk:false},
      {label:'action_type',isPK:false,isPartial:false,isFk:false},
      {label:'reference_type',isPK:false,isPartial:false,isFk:false},
      {label:'reference_id',isPK:false,isPartial:false,isFk:false},
      {label:'description',isPK:false,isPartial:false,isFk:false},
      {label:'ip_address',isPK:false,isPartial:false,isFk:false},
      {label:'user_agent',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
    ]},
    {id:'s8',type:'entity',label:'APP_RUNTIME_STATE',x:180,y:750,w:200,h:50,tuples:[
      {label:'id',isPK:true,isPartial:false,isFk:false},
      {label:'last_lifecycle_run_at',isPK:false,isPartial:false,isFk:false},
      {label:'last_observed_app_time',isPK:false,isPartial:false,isFk:false},
      {label:'last_observed_mysql_time',isPK:false,isPartial:false,isFk:false},
      {label:'lifecycle_paused',isPK:false,isPartial:false,isFk:false},
      {label:'lifecycle_pause_reason',isPK:false,isPartial:false,isFk:false},
      {label:'lifecycle_pause_detected_at',isPK:false,isPartial:false,isFk:false},
      {label:'clock_drift_seconds',isPK:false,isPartial:false,isFk:false},
      {label:'php_timezone',isPK:false,isPartial:false,isFk:false},
      {label:'mysql_timezone',isPK:false,isPartial:false,isFk:false},
      {label:'created_at',isPK:false,isPartial:false,isFk:false},
      {label:'updated_at',isPK:false,isPartial:false,isFk:false},
    ]},
    // relationships
    {id:'r1',type:'relationship',label:'HAS',x:350,y:250,w:110,h:55},
    {id:'r2',type:'id_relationship',label:'ASSIGNED',x:350,y:450,w:120,h:55},
    {id:'r3',type:'id_relationship',label:'HAS',x:690,y:400,w:110,h:55},
    {id:'r4',type:'id_relationship',label:'HAS',x:690,y:550,w:110,h:55},
    {id:'r5',type:'relationship',label:'DELETES',x:690,y:250,w:120,h:55},
    {id:'r6',type:'relationship',label:'GENERATES',x:1030,y:150,w:130,h:55},
    {id:'r7',type:'id_relationship',label:'HAS',x:180,y:350,w:110,h:55},
  ];
  edges=[
    {id:'e1',from:'s2',to:'r1',card1:'1',card2:'',dashed:false},
    {id:'e2',from:'r1',to:'s1',card1:'',card2:'N',dashed:false},
    {id:'e3',from:'s3',to:'r2',card1:'1',card2:'',dashed:true},
    {id:'e4',from:'r2',to:'s1',card1:'',card2:'N',dashed:false},
    {id:'e5',from:'s1',to:'r4',card1:'1',card2:'',dashed:false},
    {id:'e6',from:'r4',to:'s6',card1:'',card2:'1',dashed:true},
    {id:'e7',from:'s1',to:'r3',card1:'1',card2:'',dashed:false},
    {id:'e8',from:'r3',to:'s5',card1:'',card2:'N',dashed:true},
    {id:'e9',from:'s4',to:'r5',card1:'1',card2:'',dashed:false},
    {id:'e10',from:'r5',to:'s1',card1:'',card2:'N',dashed:false},
    {id:'e11',from:'s4',to:'r6',card1:'1',card2:'',dashed:false},
    {id:'e12',from:'r6',to:'s7',card1:'',card2:'N',dashed:false},
    {id:'e13',from:'s2',to:'r7',card1:'1',card2:'',dashed:false},
    {id:'e14',from:'r7',to:'s3',card1:'',card2:'N',dashed:true},
  ];
  saveH(); renderAll(); fitView();
  lastSavedSnapshot = JSON.stringify({nodes,edges});
  dirty = false;
  updateTitle();
}

// ── INIT ───────────────────────────────────────────────────────────────────────
SVG.setAttribute('width',4000); SVG.setAttribute('height',3000);
saveH(); applyT(); loadSample();
