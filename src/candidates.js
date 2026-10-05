// Conservative, original placement validator. The game remains authoritative.
// No engine code, pathfinding, city templates, auto-clearing, or auto-placement.
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
const removable = id => id >= 21 && id <= 39 || id >= 44 && id <= 47;
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
function sampleSpatially(list, count) {
  if (list.length <= count) return list;
  const chosen = [list[0]];
  const pool = list.slice(1);
  while (chosen.length < count && pool.length) {
    let index = 0, best = -Infinity;
    pool.forEach((p, i) => { const score = nearest(p, chosen); if (score > best) { best = score; index = i; } });
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}
export function candidates(observation, { reserve = 5000, perTool = 10, monthsRemaining = 120, blocked = new Set(), survival = false } = {}) {
  const { map, stats, summary } = observation;
  if (!Number.isFinite(stats.funds) || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.tiles.length !== map.width * map.height) throw new Error('Invalid game observation');
  const buildings = summary.buildings ?? [];
  const roads = points(map, roadTile), wires = points(map, wireTile);
  const power = buildings.filter(b => ['coal_power', 'nuclear_power'].includes(b.type));
  const anchors = buildings.length ? buildings : [{ x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) }];
  const moves = [];
  if (!survival) for (const [action, tool] of Object.entries(TOOLS)) {
    if (stats.funds - tool.cost < reserve) continue;
    let positions = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (!validPlacement(map, action, x, y) || blocked.has(`${action}:${x}:${y}`)) continue;
      const p = { x, y }, buildingDistance = nearest(p, anchors);
      // Publish these search-space restrictions: focus within 12 tiles of development.
      if (buildings.length && buildingDistance > 12) continue;
      positions.push({ ...p, buildingDistance, roadDistance: nearest(p, roads), wireDistance: nearest(p, [...wires, ...power]), nearestIndustry: nearest(p, buildings.filter(b => b.type === 'industrial')), nearestPowerPlant: nearest(p, power) });
    }
    positions.sort((a, b) => a.buildingDistance - b.buildingDistance || a.y - b.y || a.x - b.x);
    // Keep nearby candidates plus geographically diverse alternatives.
    const nearby = positions.slice(0, Math.ceil(perTool / 2));
    const diverse = sampleSpatially(positions.slice(nearby.length), perTool - nearby.length);
    for (const p of [...nearby, ...diverse]) moves.push({ kind: 'place', action, ...p, cost: tool.cost, footprint: tool.size });
  }
  if (!survival) for (const tax_rate of [5, 7, 9, 11]) {
    if (tax_rate !== stats.budget?.taxRate) moves.push({ kind: 'budget', settings: { tax_rate }, cost: 0 });
  }
  if (monthsRemaining >= 1) moves.push({ kind: 'advance', months: 1, cost: 0 });
  moves.push({ kind: 'stop', cost: 0 });
  return Object.fromEntries(moves.map((move, i) => [`m${i}`, move]));
}

export function decisionPayload(observation, menu, { targetPopulation, reserve, recent = [], survival = false, mutationsSinceAdvance = 0 }) {
  return {
    state: {
      goal: { targetPopulation, reserve, survival },
      stats: observation.stats,
      buildings: observation.summary.buildings,
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
    bulldoze: 'Clear exactly one tree or rubble tile to make construction possible.',
    budget: 'Adjust the tax rate to balance growth and cash flow.',
    advance: 'Simulate one month. Power and population update during simulation; waiting cannot grow a city with no zones.',
    stop: 'End the session if further play is unproductive.',
  };
  const keys = [...new Set(Object.values(menu).map(m => m.action ?? m.kind))];
  payload.questions.move.criteria = Object.fromEntries(keys.map(key => [key, descriptions[key]]));
  payload.questions.move.instructions = 'Choose the most useful next action category for this city. Grow a balanced settlement: electricity, homes, jobs, roads, and power connections. Do not keep advancing an empty city with no residential zones. Existing empty zones may need jobs, connections, or time rather than more zones. Avoid redundant power plants. Powered flags and demand are stale after construction until advance. After several construction moves, advance to measure actual power and growth before blindly adding more wire. Consider mutationsSinceAdvance, demand, budget, buildings, infrastructure problems, and recent ineffective actions. During survival choose advance while solvent. This question chooses what to do; a separate question selects the exact location.';
  return payload;
}
