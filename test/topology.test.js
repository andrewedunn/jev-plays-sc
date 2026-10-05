import test from 'node:test';
import assert from 'node:assert/strict';
import { topology, quality, roadSuggestions } from '../src/topology.js';
import { candidates, categoryPayload } from '../src/candidates.js';
function world() {
  const map={width:25,height:20,tiles:Array(500).fill(0)};
  return {map,stats:{funds:20000,demand:{residential:-2000,industrial:1500,commercial:-1500}},summary:{buildings:[{type:'coal_power',x:5,y:8,powered:true},{type:'residential',x:9,y:8,powered:true}],analysis:{}}};
}
test('a nearby isolated road is not connected street access',()=>{
  const o=world();o.map.tiles[6*25+9]=66;for(let x=15;x<22;x++)o.map.tiles[3*25+x]=66;
  assert.equal(topology(o).buildings[1].onMainRoadNetwork,false);
  assert.equal(quality(o).zonesMissingMainRoad,1);
  const next=roadSuggestions(topology(o));assert.ok(next.some(n=>n.purpose.startsWith('Connect')));
});
test('road suggestions extend a component one tile at a time rather than scattering roads',()=>{
  const o=world();for(let x=7;x<12;x++)o.map.tiles[6*25+x]=66;
  const q=quality(o);assert.equal(q.zonesMissingMainRoad,0);assert.equal(q.connectedRoadTiles,5);
  for(const p of roadSuggestions(topology(o)).filter(n=>n.action==='build_road')){
    const adjacent=[[p.x-1,p.y],[p.x+1,p.y],[p.x,p.y-1],[p.x,p.y+1]];
    assert.ok(adjacent.some(([x,y])=>o.map.tiles[y*25+x]===66));
  }
});
test('powered zones suppress redundant wires and oversupplied housing',()=>{
  const o=world();o.map.tiles[8*25+7]=210;for(let x=7;x<12;x++)o.map.tiles[6*25+x]=66;
  const menu=candidates(o);
  assert.equal(Object.values(menu).some(m=>m.action==='build_power_line'),false);
  assert.equal(Object.values(menu).some(m=>m.action==='zone_residential'),false);
  const p=categoryPayload(o,menu,{targetPopulation:5000,reserve:5000});
  assert.match(p.state.demandMeaning.industrial,/NEEDED/);assert.match(p.state.demandMeaning.residential,/OVERSUPPLIED/);
});
test('new zoning requires both existing street access and adjacent supply',()=>{
  const o=world();o.map.tiles[8*25+7]=210;for(let x=3;x<12;x++)o.map.tiles[6*25+x]=66;
  for(const m of Object.values(candidates(o)).filter(m=>m.action?.startsWith('zone_'))){assert.equal(m.connectedStreetAccess,true);assert.equal(m.powerConnection,true);}
});

test('bootstrap starts with power and prohibits simulating an empty city',()=>{
  const o=world();o.summary.buildings=[];
  const p=categoryPayload(o,candidates(o),{});
  assert.deepEqual(Object.keys(p.questions.move.criteria),['build_coal_power','stop']);
});
test('a minimal mixed settlement includes shops before endless simulation',()=>{
  const o=world();o.summary.buildings.push({type:'industrial',x:12,y:8});o.map.tiles[8*25+7]=210;for(let x=3;x<16;x++)o.map.tiles[6*25+x]=66;
  const p=categoryPayload(o,candidates(o),{});
  assert.deepEqual(Object.keys(p.questions.move.criteria),['zone_commercial']);
});

test('avenue candidates continue straight instead of filling road squares',()=>{
  const o=world();for(let x=7;x<12;x++)o.map.tiles[6*25+x]=66;
  const moves=roadSuggestions(topology(o)).filter(m=>m.action==='build_road');
  assert.ok(moves.length>0);assert.ok(moves.every(m=>m.y===6&&[6,12].includes(m.x)));
});
test('zoning cannot occupy the last available street exit',()=>{
  const o=world();o.summary.buildings=[{type:'coal_power',x:5,y:4}];o.stats.demand.residential=1000;
  o.map.tiles[6*25+9]=66;for(const [x,y]of[[8,6],[10,6],[9,7]])o.map.tiles[y*25+x]=900;
  const moves=Object.values(candidates(o));
  assert.equal(moves.some(m=>m.action==='zone_residential'&&m.x===9&&m.y===4),false);
});
