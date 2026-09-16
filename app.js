let league;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function init(){
 league=await fetch("/api/league").then(r=>r.json());
 for(let i=1;i<=13;i++) $("#week").insertAdjacentHTML("beforeend",`<option>${i}</option>`);
 $("#week").value=Math.min(13,Math.max(1,Number(localStorage.sfgWeek||1)));
 renderTeams();renderSchedule();await renderWeek();
}
async function renderWeek(){
 const w=Number($("#week").value); localStorage.sfgWeek=w;
 $("#bonus").textContent=league.bonuses[w]||"PLAYOFF FOOTBALL";
 $("#status").textContent=`WEEK ${w}`;
 $("#matchups").innerHTML="<div class=card>Dialing the stats superhighway…</div>";
 try{
  const d=await fetch(`/api/score?week=${w}`).then(async r=>{if(!r.ok)throw Error((await r.json()).error);return r.json()});
  $("#matchups").innerHTML=d.matchups.map(([a,b])=>`<article class=card>${team(a)}<div class=versus>VS.</div>${team(b)}</article>`).join("");
  $("#dataNote").textContent=`Stats feed connected • ${d.season} Week ${w} • refreshed ${new Date().toLocaleTimeString()}`;
 }catch(e){
  $("#matchups").innerHTML=(league.schedule[w]||[]).map(([a,b])=>`<article class=card>${team(league.teams.find(x=>x.id===a),false)}<div class=versus>VS.</div>${team(league.teams.find(x=>x.id===b),false)}</article>`).join("");
  $("#dataNote").textContent=`Stats feed unavailable (${e.message}). Schedule still loaded.`;
 }
}
function team(t,scored=true){return `<div class=teamline><div><b>${esc(t.name)}</b><div class=owner>${esc(t.owner)}</div></div>${scored&&t.total!=null?`<span class=score>${t.total.toFixed(1)}</span>`:""}</div>`}
function renderTeams(){$("#teamGrid").innerHTML=league.teams.map(t=>`<article class=card><div class=versus>#${t.id}</div><h3>${esc(t.name)}</h3><div class=owner>OWNER: ${esc(t.owner)}</div><hr><div class=roster>${Object.entries(t.roster).map(([p,n])=>`<b>${p}</b> — ${esc(n)}`).join("<br>")}</div></article>`).join("")}
function renderSchedule(){$("#sched").innerHTML=Object.entries(league.schedule).map(([w,ms])=>`<div class=weekrow><b>WEEK ${w}</b><br>${ms.map(([a,b])=>`${esc(league.teams[a-1].name)} vs ${esc(league.teams[b-1].name)}`).join("<br>")}</div>`).join("")}
document.addEventListener("click",e=>{if(e.target.dataset.view){document.querySelectorAll("main>section").forEach(s=>s.hidden=true);$("#"+e.target.dataset.view).hidden=false}})
$("#refresh").onclick=renderWeek;$("#week").onchange=renderWeek;init().catch(e=>{$("#dataNote").textContent=e.message});
