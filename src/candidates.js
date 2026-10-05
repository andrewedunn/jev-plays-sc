import { topology, roadSuggestions, quality, cells, perimeter, neighbors } from './topology.js';
// Conservative, original placement validator. The game remains authoritative.
// Original candidate routing; no engine code, city templates, auto-clearing, or auto-placement.
export const TOOLS = {
  build_coal_power: { size: 4, cost: 3000 },
  zone_residential: { size: 3, cost: 100 },
  zone_commercial: { size: 3, cost: 100 },
  zone_industrial: { size: 3, cost: 100 },
  build_fire_station: { size: 3, cost: 500 },
  build_police_station: { size: 3, cost: 500 },
  build_road: { size: 1, cost: 10 },
  build_power_line: { size: 1, cost: 5 },
  build_park: { size: 1, cost: 10 },
  bulldoze: { size: 1, cost: 1 },
};
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const tileId = raw => raw & 1023;
export const roadTile = id => id >= 64 && id <= 206;
export const wireTile = id => id >= 208 && id <= 222 || id === 77 || id === 78;
const removable = id => id >= 21 && id <= 39 || id >= 44 && id <= 47 || id >= 208 && id <= 222;
export function validPlacement(map, action, x, y) {
  const tool = TOOLS[action];
  if (!tool || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  const offset = tool.size > 1 ? 1 : 0;
  for (let dy = -offset; dy < tool.size - offset; dy++) {
    for (let dx = -offset; dx < tool.size - offset; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= map.width || yy >= map.height) return false;
      const id = tileId(map.tiles[yy * map.width + xx]);
      if (action === 'bulldoze') { if (!removable(id)) return false; }
      else if (action === 'build_power_line') {
        // Only straight road overlays; curved/intersection roads cannot accept wire.
        const normalized = id >= 64 && id <= 206 ? (id & 15) + 64 : id;
        if (id !== 0 && normalized !== 66 && normalized !== 67) return false;
      } else if (action === 'build_road') {
        if (id !== 0 && id !== 210 && id !== 211) return false;
      } else if (id !== 0) return false;
    }
  }
  return true;
}

function points(map, predicate) {
  return map.tiles.flatMap((raw, i) => predicate(tileId(raw)) ? [{ x: i % map.width, y: Math.floor(i / map.width) }] : []);
}
function nearest(point, list) {
  if (!list.length) return null;
  return Math.min(...list.map(other => distance(point, other)));
}
export function candidates(observation, { reserve = 5000, perTool = 10, monthsRemaining = 120, blocked = new Set(), survival = false } = {}) {
  const { map, stats, summary } = observation;
  if (!Number.isFinite(stats.funds) || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.tiles.length !== map.width * map.height) throw new Error('Invalid game observation');
  const state = topology(observation), buildings = summary.buildings ?? [], moves = [];
  const hasPlant = buildings.some(b => ['coal_power','nuclear_power'].includes(b.type));
  const roads = points(map, roadTile);
  const anchor = {x:Math.floor(map.width/2),y:Math.floor(map.height/2)};
  const affordable = action => stats.funds - TOOLS[action].cost >= reserve;
  if (!survival) {
    const routes = roadSuggestions(state);
    const options = routes.length ? routes : !buildings.length ? perimeter(map,anchor).map(i=>({action:'build_road',x:i%map.width,y:Math.floor(i/map.width),purpose:'Seed a future street',routeLength:1})) : [];
    for (const p of options.filter(p=>affordable(p.action)&&!blocked.has(`${p.action}:${p.x}:${p.y}`)).slice(0,perTool*2)) moves.push({kind:'place',...p,cost:TOOLS[p.action].cost,footprint:1});
    for (const [action, tool] of Object.entries(TOOLS)) {
      if (['build_road','bulldoze'].includes(action) || !affordable(action)) continue;
      // Suppress pointless infrastructure and premature expansion, not legal moves generally.
      if (action==='build_coal_power' && hasPlant) continue;
      if (action==='build_power_line' && (!hasPlant || state.unpoweredZones.length===0)) continue;
      if (action.startsWith('zone_') && (state.disconnectedZones.length || state.unpoweredZones.length)) continue;
      const type=action.replace('zone_','');
      if (action.startsWith('zone_') && (stats.demand?.[type]??0)<0 && buildings.some(b=>b.type===type)) continue;
      let positions=[];
      for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++) {
        if(!validPlacement(map,action,x,y)||blocked.has(`${action}:${x}:${y}`))continue;
        const p={x,y}, footprint=cells(map,p,tool.size), access=tool.size===3?perimeter(map,p):[];
        const onStreet=access.some(i=>state.mainRoad.includes(i));
        const powerAdjacent=footprint.some(i=>neighbors(map,i).some(n=>state.supplied.has(n)));
        if(action.startsWith('zone_') && (!onStreet || !powerAdjacent)) continue;
        if(action.startsWith('zone_')){
          // Preserve at least one legal next street tile after this footprint is occupied.
          const occupied=new Set([...state.occupied,...footprint]);
          const exit=state.mainRoad.some(i=>neighbors(map,i).some(n=>!occupied.has(n)&&[0,210,211].includes(tileId(map.tiles[n]))));
          if(!exit)continue;
        }
        if(action==='build_power_line') {
          const i=y*map.width+x;
          if(!neighbors(map,i).some(n=>state.supplied.has(n)))continue;
          const targets=state.unpoweredZones.flatMap(b=>cells(map,b));
          const before=Math.min(...targets.map(t=>Math.min(...[...state.supplied].map(s=>Math.abs(s%map.width-t%map.width)+Math.abs(Math.floor(s/map.width)-Math.floor(t/map.width))))));
          const after=Math.min(...targets.map(t=>Math.abs(x-t%map.width)+Math.abs(y-Math.floor(t/map.width))));
          if(after>=before)continue;
        }
        let openLand=0;for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<map.width&&yy<map.height&&tileId(map.tiles[yy*map.width+xx])===0)openLand++;}
        const distanceToRoad=nearest(p,roads);
        positions.push({...p,buildingDistance:nearest(p,buildings.length?buildings:[anchor]),roadDistance:distanceToRoad,connectedStreetAccess:onStreet,powerConnection:powerAdjacent,openLand,
          purpose:action.startsWith('zone_')?`Add ${type} on an existing connected street with adjacent power`:action==='build_power_line'?'Extend existing power supply towards a disconnected zone':action==='build_coal_power'?'Place first power plant with room for a settlement':'Add a neighborhood amenity',
          rank:action==='build_coal_power'?openLand-(Math.abs(x-anchor.x)+Math.abs(y-anchor.y))*0.1:onStreet?100-(distanceToRoad??100):-(nearest(p,buildings.length?buildings:[anchor])??100)});
      }
      positions.sort((a,b)=>b.rank-a.rank);
      for(const p of positions.slice(0,perTool)){const {rank,...facts}=p;moves.push({kind:'place',action,...facts,cost:tool.cost,footprint:tool.size});}
    }
    for(const tax_rate of [5,7,9,11])if(tax_rate!==stats.budget?.taxRate)moves.push({kind:'budget',settings:{tax_rate},cost:0});
  }
  if (hasPlant && state.mainRoad.length>=16 && state.disconnectedZones.length===0 && moves.some(m=>m.action?.startsWith('zone_'))) {
    // Build on serviced frontage before extending an empty street indefinitely.
    for(let i=moves.length-1;i>=0;i--)if(moves[i].action==='build_road')moves.splice(i,1);
  }
  if(monthsRemaining>=1)moves.push({kind:'advance',months:1,cost:0});
  moves.push({kind:'stop',cost:0});
  return Object.fromEntries(moves.map((move,i)=>[`m${i}`,move]));
}

export function decisionPayload(observation, menu, { targetPopulation, reserve, recent = [], survival = false, mutationsSinceAdvance = 0 }) {
  return {
    state: {
      goal: { targetPopulation, reserve, survival },
      stats: observation.stats,
      quality: quality(observation),
      demandMeaning: Object.fromEntries(Object.entries(observation.stats.demand ?? {}).map(([type,value])=>[type,value>0?'MORE '+type.toUpperCase()+' NEEDED':value<0?'OVERSUPPLIED: do not add more '+type:'balanced or not yet simulated'])),
      buildings: connectivityFacts(observation),
      infrastructure: observation.summary.infrastructure,
      analysis: observation.summary.analysis,
      recent,
      mutationsSinceAdvance,
      simulationNote: 'Population, demand, and building powered flags update when months advance. New infrastructure may be connected even while powered flags still show false.',
    },
    questions: { move: {
      type: 'choice',
      instructions: 'Choose exactly one next move to build a prosperous, attractive, connected city. Each option is a complete move. Start a compact settlement, provide power and roads, balance homes and jobs with demand, keep industry away from homes where possible, and add services and parks when affordable. Buildings conduct electricity when adjacent; roads alone do not. Roads and wires require cardinal adjacency. Distances are Manhattan distances to tile or building-center coordinates, not proof of connectivity. Advance one month to update power and population; avoid endless building without simulation. Tax choices balance growth and revenue. Stop if further play is unproductive. During survival, choose advance while solvent. Do not repeat a recent ineffective budget change. No auto-building is available.',
      criteria: menu,
    } },
  };
}

export function connectivityFacts(observation) { return topology(observation).buildings; }

export function categoryPayload(observation, menu, config) {
  const payload = decisionPayload(observation, menu, config);
  const descriptions = {
    build_coal_power: 'Establish or expand electricity generation; a plant is expensive and unnecessary if existing capacity suffices.',
    zone_residential: 'Add homes. Essential for population; an empty city with power but no homes cannot grow.',
    zone_commercial: 'Add shops and commercial jobs when needed.',
    zone_industrial: 'Add industrial jobs to support residents; separate from homes where practical.',
    build_road: 'Place one road tile to extend transport access to homes and jobs.',
    build_power_line: 'Place one wire tile or a compatible road crossing to connect electricity.',
    build_park: 'Improve neighborhood appeal with one park tile.',
    build_fire_station: 'Provide fire protection when affordable and needed.',
    build_police_station: 'Provide police protection when affordable and needed.',
    bulldoze: 'Clear exactly one tree, rubble, or redundant wire tile to make construction possible.',
    budget: 'Adjust the tax rate to balance growth and cash flow.',
    advance: 'Simulate one month. Power and population update during simulation; waiting cannot grow a city with no zones.',
    stop: 'End the session if further play is unproductive.',
  };
  let keys = [...new Set(Object.values(menu).map(m => m.action ?? m.kind))];
  const buildings=observation.summary.buildings??[];
  if(!config.survival && !buildings.some(b=>['coal_power','nuclear_power'].includes(b.type)) && keys.includes('build_coal_power'))keys=keys.filter(k=>['build_coal_power','stop'].includes(k));
  if(!config.survival && !buildings.some(b=>['residential','commercial','industrial'].includes(b.type)))keys=keys.filter(k=>k!=='advance');
  const zoneTypes=new Set(buildings.map(b=>b.type));
  if(!config.survival && zoneTypes.has('residential') && zoneTypes.has('industrial') && !zoneTypes.has('commercial') && keys.includes('zone_commercial'))keys=keys.filter(k=>k==='zone_commercial');
  const consecutiveAdvances=[...(config.recent??[])].reverse().findIndex(r=>r.move.kind!=='advance');
  const advanceCount=consecutiveAdvances<0?(config.recent??[]).length:consecutiveAdvances;
  if(!config.survival && advanceCount>=3 && keys.some(k=>k.startsWith('zone_')))keys=keys.filter(k=>k!=='advance');
  payload.questions.move.criteria = Object.fromEntries(keys.map(key => [key, {description:descriptions[key], immediateEffects: Object.values(menu).filter(m=>(m.action??m.kind)===key).slice(0,3).map(m=>m.purpose??m.settings??m.kind)}]));
  payload.questions.move.instructions = 'Choose one immediate action that fixes the largest concrete deficit. A road network is essential: prefer connecting existing zones to the main street before expanding. Follow demandMeaning: when industry is needed and housing is oversupplied, add industrial jobs, not more homes. Do not repeatedly advance while disconnected zones or job shortages block growth. Candidate purposes describe real next-step effects. Choose a street extension to create room for serviced zones when no zone placement is offered. Roads/wires are single tiles and each next tile will be chosen separately. Choose the most useful next action category for this city. Grow a balanced settlement: electricity, homes, jobs, roads, and power connections. Do not keep advancing an empty city with no residential zones. Existing empty zones may need jobs, connections, or time rather than more zones. Avoid redundant power plants. Powered flags and demand are stale after construction until advance. geometricPowerConnection predicts existing cardinal connections to a plant; if true, adding more wires is unnecessary unless expanding. After several construction moves, advance to measure actual power and growth before blindly adding more wire. Consider mutationsSinceAdvance, demand, budget, buildings, infrastructure problems, and recent ineffective actions. During survival choose advance while solvent. This question chooses what to do; a separate question selects the exact location.';
  return payload;
}
