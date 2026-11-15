(function(){
'use strict';
const P = window.PLACES || [];
const CENTER = [17.9667, 102.6100];
// 앱 택시 대략 요금: 기본 20,000킵 + 도로 1km당 9,000킵 (2026 비엔티안 앱 택시 체감 시세 기준 추정)
const FARE_BASE = 20000, FARE_KM = 9000;
const KIP_PER_KRW = 15.4; // 1원 ≈ 15.4킵 (대략)
const $ = s => document.querySelector(s);
const state = { tab:'r', filter:'전체', sort:'rank', me:null, map:null, markers:{}, meMarker:null, mapF:'all' };
const STAR = '★ 별표';

/* ---------- 별표 (내 기기에 저장) + 추천 링크 (?picks=) ---------- */
const VALID = new Set(P.map(p=>p.id));
const stars = new Set((()=>{ try{ return JSON.parse(localStorage.getItem('vte_stars')||'[]'); }catch(e){ return []; } })().filter(id=>VALID.has(id)));
const qs = new URLSearchParams(location.search);
const shared = new Set((qs.get('picks')||'').split(',').filter(id=>VALID.has(id)));
const sharedFrom = (qs.get('from')||'').slice(0,20);
function saveStars(){ try{ localStorage.setItem('vte_stars', JSON.stringify([...stars])); }catch(e){} }
const isPick = id => stars.has(id) || shared.has(id);
function toggleStar(id){
  if(stars.has(id)){ stars.delete(id); toast('별표를 뺐어요'); }
  else { stars.add(id); toast('★ 내 추천에 담았어요'); }
  saveStars(); refreshStars(id);
}
function refreshStars(id){
  renderFilters(); renderList(); renderStarBar(); repaintPins();
  const sb=document.querySelector('.sh-star'); if(sb && sb.dataset.star===id) paintSheetStar(sb,id);
}
function paintSheetStar(b,id){ const on=stars.has(id); b.setAttribute('aria-pressed',on); b.innerHTML = on ? '★ 내 추천에 담김' : '☆ 내 추천에 담기'; }
function shareUrl(name){
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('picks', [...stars].join(','));
  if(name) u.searchParams.set('from', name);
  return u.toString();
}
function renderStarBar(){
  const bar=$('#starBar'); const n=stars.size;
  let html='';
  if(shared.size){
    const inMine=[...shared].every(id=>stars.has(id));
    html += `<div class="sb-row sb-friend"><span><b>${sharedFrom?esc(sharedFrom)+'님':'친구'}이 추천한 ${shared.size}곳</b>에 "친구 추천" 표시가 붙어 있어요.</span>
      <span class="sb-btns"><button class="chip" type="button" data-act="showpicks">추천만 보기</button>${inMine?'':`<button class="chip" type="button" data-act="adopt">내 별표에 담기</button>`}</span></div>`;
  }
  html += n ? `<div class="sb-row"><span><b>★ 내 별표 ${n}곳</b> · 이 기기에 저장돼요</span><span class="sb-btns"><button class="chip" type="button" data-act="showpicks">별표만 보기</button><button class="chip pri" type="button" data-act="share">추천 링크 보내기</button></span></div>`
    : (shared.size ? '' : `<div class="sb-row sb-hint">사진 오른쪽 위 <b>☆</b>를 눌러 추천할 곳에 별표하고, 링크로 친구에게 보내 보세요.</div>`);
  bar.innerHTML = html;
}

/* ---------- 거리·요금 ---------- */
function hav(a,b){const R=6371,t=Math.PI/180;const dLa=(b[0]-a[0])*t,dLo=(b[1]-a[1])*t;const x=Math.sin(dLa/2)**2+Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function trip(p){
  if(!state.me) return null;
  const straight = hav(state.me,[p.lat,p.lng]);
  const road = straight*1.35 + 0.2;
  const carMin = Math.max(3, Math.round(road/20*60 + 3));
  const walkMin = Math.round(road/4.6*60);
  const fare = FARE_BASE + FARE_KM*road;
  const lo = Math.round(fare*0.85/1000)*1000, hi = Math.round(fare*1.2/1000)*1000;
  return {straight, road, carMin, walkMin, lo, hi};
}
const kip = n => n.toLocaleString('ko-KR');
const krw = n => '약 '+(Math.round(n/KIP_PER_KRW/100)*100).toLocaleString('ko-KR')+'원';
const km = d => d<1 ? Math.round(d*1000)+'m' : d.toFixed(1)+'km';
const mins = m => m>=60 ? Math.floor(m/60)+'시간 '+(m%60)+'분' : m+'분';

/* ---------- 목록 ---------- */
function items(){
  let a = P.filter(p => p.type===state.tab);
  if(state.filter===STAR) a = a.filter(p => isPick(p.id));
  else if(state.filter!=='전체') a = a.filter(p => p.group===state.filter);
  if(state.sort==='near' && state.me) a = a.slice().sort((x,y)=>hav(state.me,[x.lat,x.lng])-hav(state.me,[y.lat,y.lng]));
  else a = a.slice().sort((x,y)=>x.rank-y.rank);
  return a;
}
function photo(p, eager){
  const ini = p.name.replace(/^(The|Le|La|Cafe|Café)\s+/i,'').charAt(0);
  return `<div class="ph"><div class="ph-fallback" aria-hidden="true">${ini}</div>${p.img?`<img src="${p.img}" alt="${esc(p.name)} 사진" ${eager?'':'loading="lazy"'} onerror="this.remove()">`:''}`;
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function renderFilters(){
  const nPick = P.filter(p=>p.type===state.tab && isPick(p.id)).length;
  const groups = ['전체', ...(nPick?[STAR]:[]), ...new Set(P.filter(p=>p.type===state.tab).map(p=>p.group))];
  if(state.filter===STAR && !nPick) state.filter='전체';
  const html = groups.map(g=>`<button class="chip${g===STAR?' chip-star':''}" type="button" aria-pressed="${g===state.filter}" data-g="${esc(g)}">${esc(g===STAR?STAR+' '+nPick:g)}</button>`).join('');
  $('#filters').innerHTML = html;
}
function renderList(){
  const a = items();
  $('#secTitle').textContent = (state.tab==='r'?'식당 ':'카페 ') + P.filter(p=>p.type===state.tab).length;
  if(!a.length){ $('#list').innerHTML = `<p class="empty">아직 이 탭에 별표한 곳이 없어요. 사진 오른쪽 위 ☆를 눌러 보세요.</p>`; return; }
  $('#list').innerHTML = a.map((p,i)=>{
    const t = trip(p); const mine = stars.has(p.id), fr = shared.has(p.id);
    const badge = mine ? '<span class="pick-badge">★ 내 추천</span>' : fr ? '<span class="pick-badge fr">친구 추천</span>' : '';
    return `<div class="cardw${mine||fr?' picked':''}"><button class="card" type="button" data-id="${p.id}">
      ${photo(p, i<2)}<span class="rank">${state.tab==='r'?'식당':'카페'} ${String(p.rank).padStart(2,'0')}</span>${badge}${t?`<span class="dist">${km(t.road)} · 택시 ${mins(t.carMin)}</span>`:''}</div>
      <div class="card-b">
        <div class="card-t"><h3>${esc(p.name)}</h3><span class="stars">★ ${p.rating.toFixed(1)} <small>(${kip(p.count)})</small></span></div>
        <div class="meta">${esc(p.cat)}${p.price?' · '+esc(p.price):''}${p.area?' · '+esc(p.area):''}</div>
        <div class="why">${esc(p.oneLine)}</div>
      </div></button>
      <button class="star-btn" type="button" data-star="${p.id}" aria-pressed="${mine}" aria-label="${esc(p.name)} ${mine?'별표 빼기':'별표하기'}">${mine?'★':'☆'}</button></div>`;
  }).join('');
}

/* ---------- 상세 시트 ---------- */
function openSheet(id){
  const p = P.find(x=>x.id===id); if(!p) return;
  const t = trip(p);
  const dest = `${p.lat},${p.lng}`;
  const gq = encodeURIComponent(p.name+' Vientiane');
  const origin = state.me ? `&origin=${state.me[0]},${state.me[1]}` : '';
  const dirCar = `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=driving`;
  const dirWalk = `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=walking`;
  const view = p.href || `https://www.google.com/maps/search/?api=1&query=${gq}`;
  const tripHtml = t ? `
    <div class="trip-grid">
      <div class="tg"><small>거리</small><b>${km(t.road)}</b><em>직선 ${km(t.straight)}</em></div>
      <div class="tg"><small>택시·차</small><b>${mins(t.carMin)}</b><em>시내 기준</em></div>
      <div class="tg"><small>걸어서</small><b>${t.walkMin>90?'비추천':mins(t.walkMin)}</b><em>${t.walkMin>90?'너무 멀어요':'평지 기준'}</em></div>
    </div>
    <div class="tg" style="text-align:left"><small>예상 택시비 (앱 택시)</small><b>₭${kip(t.lo)} ~ ${kip(t.hi)}</b><em>${krw(t.lo)} ~ ${krw(t.hi).replace('약 ','')} · 툭툭은 흥정, 보통 이보다 조금 비쌈</em></div>
    <p class="trip-note">${tripAdvice(t)}</p>`
  : `<p class="trip-note">위의 <b>내 위치 켜기</b>를 누르면 지금 있는 곳에서 거리·택시비·소요시간이 계산돼요. 위치를 켜지 않아도 아래 버튼으로 구글 지도 길찾기는 열 수 있어요.</p>
     <button class="btn pri wide" type="button" data-act="loc">내 위치 켜고 계산하기</button>`;
  $('#shBody').innerHTML = `
    ${photo(p, true)}</div>
    <div class="sh-b">
      <div>
        <div class="eyebrow" style="color:var(--saffron)">${p.type==='r'?'식당':'카페'} ${String(p.rank).padStart(2,'0')} · ${esc(p.cat)}</div>
        <h2 id="shName" style="margin-top:6px">${esc(p.name)}</h2>
        <div class="sh-sub"><span class="stars">★ ${p.rating.toFixed(1)}</span> 구글 리뷰 ${kip(p.count)}개${p.price?' · '+esc(p.price):''}</div>
        ${shared.has(p.id)?`<div class="sh-friend">${sharedFrom?esc(sharedFrom)+'님':'친구'}이 추천한 곳이에요</div>`:''}
        <button class="btn sh-star" type="button" data-star="${p.id}"></button>
      </div>
      <ul class="reasons">${p.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
      ${p.tags&&p.tags.length?`<div class="tags">${p.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:''}
      <section class="trip"><h4>여기까지 가는 법</h4>${tripHtml}
        <div class="trip-cta">
          <a class="btn pri" href="${dirCar}" target="_blank" rel="noopener">차·택시 길찾기</a>
          <a class="btn" href="${dirWalk}" target="_blank" rel="noopener">걸어서 길찾기</a>
          <a class="btn wide" href="${view}" target="_blank" rel="noopener">구글 지도에서 사진·리뷰 더 보기</a>
        </div>
      </section>
      <dl class="info">
        ${p.addr?`<div><dt>주소</dt><dd>${esc(p.addr)} <button class="tag" type="button" data-copy="${esc(p.addr)}">복사</button></dd></div>`:''}
        ${p.hours?`<div><dt>영업</dt><dd>${esc(p.hours)}</dd></div>`:''}
        ${p.tip?`<div><dt>팁</dt><dd>${esc(p.tip)}</dd></div>`:''}
      </dl>
    </div>`;
  paintSheetStar($('.sh-star'), p.id);
  showSheet();
  try{ history.replaceState(null,'',location.search+'#'+p.id); }catch(e){}
}
function showSheet(){
  const sh = $('#sheet'); sh.hidden = false; sh.scrollTop = 0;
  requestAnimationFrame(()=>{ sh.classList.add('show'); $('#scrim').classList.add('show'); });
}
/* 추천 링크 보내기 */
function openShare(){
  if(!stars.size){ toast('먼저 ☆를 눌러 추천할 곳을 골라 주세요'); return; }
  let name=''; try{ name=localStorage.getItem('vte_name')||''; }catch(e){}
  const list=P.filter(p=>stars.has(p.id));
  $('#shBody').innerHTML = `<div class="sh-b" style="padding-top:28px">
    <div><div class="eyebrow" style="color:var(--saffron)">추천 링크 보내기</div><h2 id="shName" style="margin-top:6px">내 추천 ${list.length}곳</h2>
    <div class="sh-sub">링크를 받은 친구는 이 ${list.length}곳에 "친구 추천" 표시가 붙은 화면을 보게 돼요.</div></div>
    <ul class="pick-list">${list.map(p=>`<li><span>${p.type==='r'?'식당':'카페'} · <b>${esc(p.name)}</b></span><button class="tag" type="button" data-star="${p.id}">빼기</button></li>`).join('')}</ul>
    <label class="field">보내는 사람 이름 (선택)<input id="fromName" type="text" maxlength="20" placeholder="예: 민수" value="${esc(name)}"></label>
    <div class="trip-cta"><button class="btn pri wide" type="button" data-act="doshare">카톡·메시지로 보내기</button>
    <button class="btn wide" type="button" data-act="copylink">링크만 복사</button></div>
    <p class="trip-note" id="shareOut" style="word-break:break-all"></p></div>`;
  showSheet();
}
function currentShareUrl(){
  const n=($('#fromName')?.value||'').trim(); try{ localStorage.setItem('vte_name',n); }catch(e){}
  return shareUrl(n);
}
async function doShare(){
  const url=currentShareUrl(); const n=($('#fromName')?.value||'').trim();
  const text=`${n?n+'의 ':''}비엔티안 추천 맛집 ${stars.size}곳`;
  if(navigator.share){ try{ await navigator.share({title:text, text, url}); return; }catch(e){ if(e&&e.name==='AbortError') return; } }
  copyLink(url);
}
function copyLink(url){
  url = url || currentShareUrl();
  $('#shareOut').textContent = url;
  (navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(()=>toast('링크를 복사했어요. 카톡에 붙여넣기 하세요')).catch(()=>toast('아래 링크를 길게 눌러 복사하세요'));
}
function tripAdvice(t){
  if(t.road < 0.9) return '가까워요. 걸어가도 충분합니다. 낮 12~4시엔 햇볕이 강하니 그늘 길로.';
  if(t.road < 2.5) return '걸어서도 되지만 더운 시간이면 앱 택시·툭툭이 편해요. 툭툭은 타기 전에 요금을 먼저 정하세요.';
  return '앱 택시(LOCA·인드라이브)를 부르는 게 편하고 요금도 미리 확정돼요. 툭툭은 타기 전에 꼭 흥정.';
}
function closeSheet(){
  const sh=$('#sheet'); sh.classList.remove('show'); $('#scrim').classList.remove('show');
  setTimeout(()=>{ if(!sh.classList.contains('show')) sh.hidden=true; },300);
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
}

/* ---------- 지도 ---------- */
function ensureMap(){
  if(state.map || !window.L) return;
  const m = L.map('map',{zoomControl:false, attributionControl:true}).setView(CENTER, 14);
  L.control.zoom({position:'bottomright'}).addTo(m);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19, subdomains:'abcd', attribution:'© OpenStreetMap · © CARTO'}).addTo(m);
  state.map = m;
  P.forEach(p=>{
    const mk = L.marker([p.lat,p.lng],{icon:pinIcon(p), title:p.name}).addTo(m);
    mk.bindTooltip(`${p.name} ★${p.rating.toFixed(1)}`,{direction:'top', offset:[0,-28]});
    mk.on('click',()=>openSheet(p.id));
    state.markers[p.id]=mk;
  });
  renderMapFilters();
  drawMe();
}
function pinIcon(p){
  const pk=isPick(p.id);
  return L.divIcon({className:'', html:`<div class="pin ${p.type}${pk?' pk':''}"><span>${pk?'★':p.rank}</span></div>`, iconSize:[30,30], iconAnchor:[15,30]});
}
function repaintPins(){
  if(!state.map) return;
  P.forEach(p=>{ const mk=state.markers[p.id]; mk.setIcon(pinIcon(p)); mk.setZIndexOffset(isPick(p.id)?500:0); });
  renderMapFilters(); mapFilter(state.mapF);
}
function renderMapFilters(){
  const n=P.filter(p=>isPick(p.id)).length;
  if(state.mapF==='star' && !n) state.mapF='all';
  $('#mapFilters').innerHTML = [['all','전체 40'],['r','식당만'],['c','카페만'],...(n?[['star','★ 별표 '+n]]:[])].map(([k,l])=>`<button class="chip${k==='star'?' chip-star':''}" type="button" data-mf="${k}" aria-pressed="${k===state.mapF}">${l}</button>`).join('') + `<button class="chip" type="button" data-act="loc">내 위치</button>`;
}
function mapFilter(k){
  state.mapF=k;
  P.forEach(p=>{ const mk=state.markers[p.id]; const show = k==='all'||(k==='star'?isPick(p.id):p.type===k); if(show) mk.addTo(state.map); else mk.remove(); });
  document.querySelectorAll('[data-mf]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.mf===k));
}
function drawMe(){
  if(!state.map || !state.me) return;
  if(!state.meMarker) state.meMarker = L.marker(state.me,{icon:L.divIcon({className:'',html:'<div class="me-dot"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:1000}).addTo(state.map).bindTooltip('내 위치');
  else state.meMarker.setLatLng(state.me);
}

/* ---------- 탭 ---------- */
function setTab(t){
  document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab===t));
  if(t==='m'){
    $('#mapView').hidden=false; ensureMap();
    setTimeout(()=>{ state.map&&state.map.invalidateSize(); if(state.me&&state.map) state.map.setView(state.me,14); },60);
  } else {
    $('#mapView').hidden=true;
    state.tab=t; state.filter='전체'; renderFilters(); renderList();
    window.scrollTo({top: Math.min(window.scrollY, $('.locbar').offsetTop), behavior:'smooth'});
  }
}

/* ---------- 위치 ---------- */
function locate(){
  if(!navigator.geolocation){ toast('이 브라우저는 위치를 지원하지 않아요'); return; }
  $('#locMsg').textContent='위치 찾는 중…';
  navigator.geolocation.getCurrentPosition(pos=>{
    state.me=[pos.coords.latitude,pos.coords.longitude];
    const far = hav(state.me,CENTER) > 40;
    const b=$('#locBtn'); b.classList.add('on'); b.querySelector('span').textContent='위치 켜짐';
    $('#locMsg').textContent = far ? '지금 비엔티안 밖이에요. 거리는 현재 위치 기준이라 크게 나옵니다.' : '내 위치 기준으로 거리·택시비를 계산했어요';
    state.sort='near'; $('#sortSel').value='near';
    renderList(); drawMe();
    if($('#sheet').classList.contains('show')){ const id=location.hash.slice(1); if(id) openSheet(id); }
  }, err=>{
    $('#locMsg').textContent = err.code===1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트 위치를 허용해 주세요.' : '위치를 못 찾았어요. 잠시 뒤 다시 눌러 주세요.';
  }, {enableHighAccuracy:true, timeout:12000, maximumAge:60000});
}

/* ---------- 날씨 (Open-Meteo, 키 없음) ---------- */
const WMO = {0:['맑음','☀️'],1:['대체로 맑음','🌤️'],2:['구름 조금','⛅'],3:['흐림','☁️'],45:['안개','🌫️'],48:['안개','🌫️'],51:['약한 이슬비','🌦️'],53:['이슬비','🌦️'],55:['강한 이슬비','🌧️'],61:['약한 비','🌦️'],63:['비','🌧️'],65:['강한 비','🌧️'],80:['소나기','🌦️'],81:['소나기','🌧️'],82:['강한 소나기','⛈️'],95:['뇌우','⛈️'],96:['우박 동반 뇌우','⛈️'],99:['우박 동반 뇌우','⛈️']};
function fetchT(u,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return fetch(u,{signal:c.signal}).finally(()=>clearTimeout(t));}
function wttrCode(c){c=+c;if(c===113)return 0;if(c===116)return 2;if(c===119)return 3;if(c===122)return 3;if([143,248,260].includes(c))return 45;if([200,386,389,392,395].includes(c))return 95;if([299,302,305,308,356,359].includes(c))return 63;if([176,263,266,281,284,293,296,311,314,353].includes(c))return 61;return 2;}
function to24(s){const m=/(\d+):(\d+)\s*(AM|PM)/i.exec(s||'');if(!m)return s||'';let h=+m[1]%12;if(/pm/i.test(m[3]))h+=12;return String(h).padStart(2,'0')+':'+m[2];}
async function weatherWttr(){
  const r=await fetchT('https://wttr.in/Vientiane?format=j1',9000); const d=JSON.parse(await r.text());
  const c=d.current_condition[0], day=d.weather[0];
  const code=wttrCode(c.weatherCode); const w=WMO[code]||['—',''];
  $('#wxTemp').textContent=c.temp_C+'°';
  $('#wxDesc').textContent=`${w[1]} ${w[0]} · 체감 ${c.FeelsLikeC}°`;
  $('#wxMeta').innerHTML=`현지 <span id="clock"></span> · 습도 ${c.humidity}% · 최고 ${day.maxtempC}° / 최저 ${day.mintempC}° · 일몰 ${to24(day.astronomy[0].sunset)}`;
  tick();
  const nowH=+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',hour12:false}).format(new Date());
  const hrs=[...d.weather[0].hourly.map(h=>({...h,day:0})),...(d.weather[1]?d.weather[1].hourly.map(h=>({...h,day:1})):[])].filter(h=>h.day===1||(+h.time/100)>=nowH-1).slice(0,6);
  let maxRain=0;
  $('#wxHours').innerHTML=hrs.map(h=>{const pr=+h.chanceofrain;maxRain=Math.max(maxRain,pr);const ww=WMO[wttrCode(h.weatherCode)]||['',''];return `<div class="wx-h">${h.day?'내일 ':''}${String(+h.time/100).padStart(2,'0')}시<b>${h.tempC}°</b>${ww[1]}<div class="rain">${pr}%</div></div>`}).join('');
  tipFor(maxRain,+c.uvIndex,+c.FeelsLikeC);
}
function tipFor(maxRain,uv,feels){
  $('#wxTip').textContent = maxRain>=50 ? `앞으로 몇 시간 안에 비 올 확률 ${maxRain}%. 우산 챙기고 실내 카페 위주로.` :
    uv>=7 ? `자외선 강함(UV ${Math.round(uv)}). 낮엔 택시 이동, 걷기는 해 질 녘 메콩강변 추천.` :
    feels>=33 ? '체감 33도 이상. 걸어서 10분 넘는 곳은 택시가 편해요.' : '걷기 좋은 날씨예요. 가까운 곳은 걸어서 다녀 보세요.';
}
async function weather(){
  try{
    const u='https://api.open-meteo.com/v1/forecast?latitude=17.9757&longitude=102.6331&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,sunset&timezone=Asia%2FBangkok&forecast_days=2';
    // 라오스 통신망에서 open-meteo가 막혀 있어 wttr.in을 먼저 쓰고, 실패하면 open-meteo로
    try{ await weatherWttr(); return; }catch(_){}
    const r = await fetchT(u,8000); if(!r.ok) throw 0; const d = await r.json();
    const c=d.current; const w=WMO[c.weather_code]||['—',''];
    $('#wxTemp').textContent = Math.round(c.temperature_2m)+'°';
    $('#wxDesc').textContent = `${w[1]} ${w[0]} · 체감 ${Math.round(c.apparent_temperature)}°`;
    const ss = d.daily.sunset[0].slice(11,16);
    $('#wxMeta').innerHTML = `현지 <span id="clock"></span> · 습도 ${c.relative_humidity_2m}% · 최고 ${Math.round(d.daily.temperature_2m_max[0])}° / 최저 ${Math.round(d.daily.temperature_2m_min[0])}° · 일몰 ${ss}`;
    tick();
    const now = c.time.slice(0,13);
    let i = d.hourly.time.findIndex(t=>t.slice(0,13)===now); if(i<0) i=0;
    let maxRain=0, html='';
    for(let k=i;k<i+12&&k<d.hourly.time.length;k++){
      const pr=d.hourly.precipitation_probability[k]??0; if(k<i+6) maxRain=Math.max(maxRain,pr);
      const ww=WMO[d.hourly.weather_code[k]]||['',''];
      html+=`<div class="wx-h">${k===i?'지금':d.hourly.time[k].slice(11,13)+'시'}<b>${Math.round(d.hourly.temperature_2m[k])}°</b>${ww[1]}<div class="rain">${pr}%</div></div>`;
    }
    $('#wxHours').innerHTML=html;
    tipFor(maxRain, c.uv_index??0, c.apparent_temperature);
  }catch(e){
    $('#wxDesc').textContent='날씨를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.';
  }
}
function tick(){
  const el=document.getElementById('clock'); if(!el) return;
  el.textContent = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
}
let toastT; function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200);}

/* ---------- 이벤트 ---------- */
document.addEventListener('click',e=>{
  const st=e.target.closest('[data-star]'); if(st){ e.preventDefault(); toggleStar(st.dataset.star); if(st.closest('.pick-list')){ stars.size?openShare():closeSheet(); } return; }
  const act=e.target.closest('[data-act]')?.dataset.act;
  if(act==='share'){ openShare(); return; }
  if(act==='doshare'){ doShare(); return; }
  if(act==='copylink'){ copyLink(); return; }
  if(act==='showpicks'){ state.filter=STAR; if(!P.some(p=>p.type===state.tab&&isPick(p.id))) setTab(state.tab==='r'?'c':'r'); state.filter=STAR; renderFilters(); renderList(); $('#listView').scrollIntoView({behavior:'smooth'}); return; }
  if(act==='adopt'){ shared.forEach(id=>stars.add(id)); saveStars(); refreshStars(); toast(`${shared.size}곳을 내 별표에 담았어요`); return; }
  const card=e.target.closest('.card'); if(card){ openSheet(card.dataset.id); return; }
  const tab=e.target.closest('.tab'); if(tab){ setTab(tab.dataset.tab); return; }
  const chip=e.target.closest('[data-g]'); if(chip){ state.filter=chip.dataset.g; renderFilters(); renderList(); return; }
  const mf=e.target.closest('[data-mf]'); if(mf){ mapFilter(mf.dataset.mf); return; }
  if(e.target.closest('[data-act="loc"]')){ locate(); return; }
  const cp=e.target.closest('[data-copy]'); if(cp){ const v=cp.dataset.copy; (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(()=>toast('주소를 복사했어요. 택시 기사님께 보여주세요')).catch(()=>toast(v)); return; }
});
$('#locBtn').addEventListener('click',locate);
$('#sortSel').addEventListener('change',e=>{ state.sort=e.target.value; if(state.sort==='near'&&!state.me){ locate(); } renderList(); });
$('#scrim').addEventListener('click',closeSheet);
$('#shClose').addEventListener('click',closeSheet);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheet(); });
// 시트 아래로 끌어 닫기
(()=>{ let y0=null; const sh=$('#sheet');
  sh.addEventListener('touchstart',e=>{ y0 = sh.scrollTop<=0 ? e.touches[0].clientY : null; },{passive:true});
  sh.addEventListener('touchmove',e=>{ if(y0===null) return; const dy=e.touches[0].clientY-y0; if(dy>0) sh.style.transform=`translateY(${dy}px)`; },{passive:true});
  sh.addEventListener('touchend',e=>{ if(y0===null) return; const dy=e.changedTouches[0].clientY-y0; sh.style.transform=''; y0=null; if(dy>110) closeSheet(); });
})();

if(shared.size){ if(!P.some(p=>p.type==='r'&&shared.has(p.id))){ state.tab='c'; document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab==='c')); } state.filter=STAR; }
renderStarBar(); renderFilters(); renderList(); weather(); tick(); setInterval(tick, 30000);
if(location.hash.length>1 && P.some(p=>p.id===location.hash.slice(1))) openSheet(location.hash.slice(1));
})();
