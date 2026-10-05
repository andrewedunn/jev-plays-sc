import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const lines = path => existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

export function report(dir) {
  const data = { manifest: read(join(dir, 'manifest.json')), metrics: read(join(dir, 'metrics.json')), observations: lines(join(dir, 'observations.jsonl')), actions: lines(join(dir, 'actions.jsonl')), decisions: lines(join(dir, 'decisions.jsonl')) };
  // Escaping prevents a city name or model text closing the data script element.
  const json = JSON.stringify(data).replaceAll('<', '\\u003c');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev Plays SimCity · Run replay</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#101510;color:#e9eee4}*{box-sizing:border-box}body{max-width:1300px;margin:auto;padding:32px}header{border-bottom:1px solid #3c4b36;padding-bottom:24px}h1{font:600 clamp(28px,5vw,52px) system-ui;margin:8px 0}p{line-height:1.6;color:#b8c7ad}a{color:#bdeb88}.eyebrow{font-size:12px;letter-spacing:2px;color:#bdeb88}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card{border:1px solid #3c4b36;padding:16px}.card span{font-size:12px;color:#b8c7ad}.card strong{display:block;font-size:24px;margin-top:8px}.layout{display:grid;grid-template-columns:1.5fr 1fr;gap:24px}canvas{width:100%;image-rendering:pixelated;background:#20281d;border:1px solid #3c4b36}.controls{display:flex;gap:12px;align-items:center;margin:16px 0}button,select{background:#bdeb88;color:#101510;padding:10px;border:0;font:inherit;cursor:pointer}input{flex:1;min-width:50px}pre{white-space:pre-wrap;word-break:break-word;max-height:350px;overflow:auto;font-size:12px;padding:16px;background:#1b2318}details{margin:16px 0}#caption{min-height:45px}footer{border-top:1px solid #3c4b36;margin-top:24px;font-size:12px}#warning{color:#ffcd7b}@media(max-width:800px){body{padding:16px}.layout{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,1fr)}}
</style>
<header><div class="eyebrow">JEV PLAYS SIMCITY / EVERY PLACEMENT RECORDED</div><h1 id="title">City replay</h1><p id="subtitle"></p><p id="warning"></p><a id="city" hidden>Watch the public city</a></header>
<div class="cards"><div class="card"><span>Elapsed at this frame</span><strong id="elapsed">—</strong></div><div class="card"><span>Estimated Jev inference</span><strong id="cost">—</strong></div><div class="card"><span>Population</span><strong id="population">—</strong></div><div class="card"><span>City funds</span><strong id="funds">—</strong></div></div>
<main class="layout"><section><canvas id="map" aria-label="City tile map replay"></canvas><div class="controls"><button id="play">Play</button><input id="frame" type="range" min="0" value="0" aria-label="Replay frame"><select id="speed" aria-label="Playback speed"><option value="500">2×</option><option value="1000">1×</option><option value="100">10×</option></select></div><p id="caption"></p><p>Green: homes · blue: shops · amber: industry · gray: roads · yellow: power · dark green: trees</p></section><section><div class="eyebrow">SELECTED MOVE / VERIFIED RESULT</div><pre id="action"></pre><details open><summary>Jev choice and confidence</summary><pre id="answer"></pre></details><details><summary>Full request and candidate menu</summary><pre id="request"></pre></details><details><summary>Run metrics and limits</summary><pre id="metrics"></pre></details></section></main><footer><p>Development tokens and cost are separate and unavailable unless imported. Inference cost uses returned token counts and the manifest price. Unknown billed requests are excluded and explicitly counted. Playback uses saved observations; it does not call a model or mutate a city.</p></footer>
<script type="application/json" id="data">${json}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),$=id=>document.getElementById(id);
$('title').textContent=data.manifest.city?.name||'Jev city experiment';
$('subtitle').textContent=data.manifest.model+' · '+data.metrics.status+' · '+data.metrics.decisions+' decisions · '+data.metrics.placements+' successful placements';
if(data.manifest.mode!=='live')$('warning').textContent='SYNTHETIC DEMO — no real Jev calls or city results. All tokens, timings, and city state below are illustrative.';
else if(data.metrics.usageUnknownRequests)$('warning').textContent='Cost incomplete: '+data.metrics.usageUnknownRequests+' requests have unknown usage.';
const cityUrl=data.manifest.city?.url;try{const u=new URL(cityUrl);if(u.protocol==='https:'&&u.hostname==='hallucinatingsplines.com'&&u.pathname.startsWith('/cities/')){$('city').href=u.href;$('city').hidden=false;}}catch{}
$('metrics').textContent=JSON.stringify(data.metrics,null,2);let index=0,timer;
$('frame').max=Math.max(0,data.observations.length-1);
function color(raw){const t=raw&1023;if(t===0)return '#8c704b';if(t<21)return '#377a9b';if(t<=39)return '#41663f';if(t>=64&&t<=206)return '#92958c';if(t>=208&&t<=222)return '#edce57';if(t>=240&&t<423)return '#88be64';if(t>=423&&t<612)return '#749dd5';if(t>=612&&t<693)return '#cf9851';if(t>=840&&t<=843)return '#568a45';return '#b8b1a0';}
function render(){const f=data.observations[index];if(!f){$('caption').textContent='No map observation was captured. See metrics for the run status.';$('play').disabled=true;return;}
const m=f.observation.map,ctx=$('map').getContext('2d');$('map').width=m.width;$('map').height=m.height;
m.tiles.forEach((t,i)=>{ctx.fillStyle=color(t);ctx.fillRect(i%m.width,Math.floor(i/m.width),1,1)});
$('elapsed').textContent=(f.elapsedMs/1000).toFixed(1)+'s';$('cost').textContent='$'+(f.estimatedInferenceUsd||0).toFixed(5);$('population').textContent=f.observation.stats.population.toLocaleString();$('funds').textContent='$'+f.observation.stats.funds.toLocaleString();$('frame').value=index;
const action=data.actions.find(a=>a.decisionId===f.decisionId&&['result','unconfirmed'].includes(a.kind));const answer=data.decisions.find(d=>d.decisionId===f.decisionId&&d.kind==='response');const request=data.decisions.find(d=>d.decisionId===f.decisionId&&d.kind==='request');
$('caption').textContent='Frame '+(index+1)+' / '+data.observations.length+' · '+(f.decisionId||'Initial state')+' · simulated '+f.observation.stats.year+'/'+f.observation.stats.month;
$('action').textContent=JSON.stringify(action||{kind:'initial_observation'},null,2);$('answer').textContent=JSON.stringify(answer?.response||{},null,2);$('request').textContent=JSON.stringify(request?.payload||{},null,2);}
function pause(){clearInterval(timer);timer=null;$('play').textContent='Play';}
function play(){if(timer){pause();return;}if(index>=data.observations.length-1)index=0;$('play').textContent='Pause';timer=setInterval(()=>{if(index>=data.observations.length-1){pause();return;}index++;render()},Number($('speed').value));}
$('play').onclick=play;$('frame').oninput=()=>{pause();index=Number($('frame').value);render()};$('speed').onchange=()=>{if(timer){pause();play()}};render();
</script></html>`;
  writeFileSync(join(dir, 'report.html'), html);
  return join(dir, 'report.html');
}
