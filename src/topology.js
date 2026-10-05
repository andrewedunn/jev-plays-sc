// Original graph analysis and route suggestions. Suggestions never execute paths.
const id = t => t & 1023;
export const road = t => id(t) >= 64 && id(t) <= 206;
export const wire = t => id(t) >= 208 && id(t) <= 222;
export const zone = b => ['residential', 'commercial', 'industrial'].includes(b.type);
export const sizeOf = b => ['coal_power','nuclear_power','seaport','stadium'].includes(b.type) ? 4 : b.type === 'airport' ? 6 : 3;
export function cells(map, b, size = sizeOf(b)) {
  const out=[];
  for(let dy=-1;dy<size-1;dy++) for(let dx=-1;dx<size-1;dx++) {
    const x=b.x+dx,y=b.y+dy;
    if(x>=0&&y>=0&&x<map.width&&y<map.height) out.push(y*map.width+x);
  }
  return out;
}
export function neighbors(map, i) {
  const x=i%map.width,y=Math.floor(i/map.width);
  return [x>0?i-1:-1,x+1<map.width?i+1:-1,y>0?i-map.width:-1,y+1<map.height?i+map.width:-1].filter(n=>n>=0);
}
export function perimeter(map, b) {
  // Actual twelve traffic-access positions around a 3x3 zone, excluding corners.
  const out=[];
  for(const [dx,dy] of [[-1,-2],[0,-2],[1,-2],[2,-1],[2,0],[2,1],[1,2],[0,2],[-1,2],[-2,1],[-2,0],[-2,-1]]) {
    const x=b.x+dx,y=b.y+dy;if(x>=0&&y>=0&&x<map.width&&y<map.height)out.push(y*map.width+x);
  }
  return out;
}
function components(map, predicate) {
  const labels = new Int32Array(map.tiles.length).fill(-1), groups=[];
  map.tiles.forEach((t,i)=>{
    if(!predicate(t)||labels[i]>=0)return;
    const group=[], stack=[i], label=groups.length;labels[i]=label;
    while(stack.length){const n=stack.pop();group.push(n);for(const next of neighbors(map,n))if(labels[next]<0&&predicate(map.tiles[next])){labels[next]=label;stack.push(next);}}
    groups.push(group);
  });
  return {labels,groups};
}
export function topology({map,summary}) {
  const buildings=summary.buildings??[], graph=components(map,road);
  let main=-1;graph.groups.forEach((g,i)=>{if(main<0||g.length>graph.groups[main].length)main=i;});
  const conductive=new Set();map.tiles.forEach((t,i)=>{if(wire(t)||id(t)===77||id(t)===78)conductive.add(i);});
  const plants=buildings.filter(b=>['coal_power','nuclear_power'].includes(b.type));
  buildings.forEach(b=>cells(map,b).forEach(i=>conductive.add(i)));
  const supplied=new Set(plants.flatMap(b=>cells(map,b))), stack=[...supplied];
  while(stack.length){const i=stack.pop();for(const n of neighbors(map,i))if(conductive.has(n)&&!supplied.has(n)){supplied.add(n);stack.push(n);}}
  const facts=buildings.map(b=>{
    const access=zone(b)?perimeter(map,b).filter(i=>road(map.tiles[i])):[];
    const onMain=access.some(i=>graph.labels[i]===main);
    return {...b, geometricPowerConnection:cells(map,b).some(i=>supplied.has(i)), roadAccess:access.length>0, onMainRoadNetwork:onMain, roadComponents:[...new Set(access.map(i=>graph.labels[i]))]};
  });
  const occupied = new Set(buildings.flatMap(b=>cells(map,b)));
  return {map,buildings:facts,mainRoad:main<0?[]:graph.groups[main],roadLabels:graph.labels,roadComponents:graph.groups.length,supplied,occupied,
    disconnectedZones:facts.filter(b=>zone(b)&&!b.onMainRoadNetwork),
    unpoweredZones:facts.filter(b=>zone(b)&&!b.geometricPowerConnection)};
}
const buildableRoad = t => id(t)===0 || id(t)===210 || id(t)===211;
const clearable = t => id(t)>=21&&id(t)<=39 || id(t)>=44&&id(t)<=47 || wire(t);

export function roadSuggestions(state) {
  const {map,buildings,mainRoad}=state, suggestions=new Map();
  const add=(i,purpose,routeLength=1)=>{
    if(road(map.tiles[i]))return;
    const t=id(map.tiles[i]);if(!buildableRoad(t)&&!clearable(t))return;
    const action=buildableRoad(t)?'build_road':'bulldoze';
    // Preserve geometric supply when clearing existing wire.
    if(action==='bulldoze'&&wire(t)){
      const copy={...map,tiles:[...map.tiles]};copy.tiles[i]=0;
      const after=topology({map:copy,summary:{buildings}});
      if(after.unpoweredZones.length>state.unpoweredZones.length)return;
    }
    const prior=suggestions.get(i);
    const candidate={action,x:i%map.width,y:Math.floor(i/map.width),purpose,routeLength,roadNetworkExtension:mainRoad.length>0};
    if(!prior || purpose.startsWith('Connect') && (!prior.purpose.startsWith('Connect') || candidate.routeLength<prior.routeLength))suggestions.set(i,candidate);
  };
  if(!mainRoad.length){
    const anchors=buildings.filter(zone).length?buildings.filter(zone):buildings;
    for(const b of anchors)for(const i of perimeter(map,b))add(i,`Start a street by ${b.type} at ${b.x},${b.y}`);
    return [...suggestions.values()];
  }
  // Multi-source BFS: one model decision for one next tile, never a path macro.
  const parents=new Int32Array(map.tiles.length).fill(-2),queue=[...mainRoad];
  mainRoad.forEach(i=>{parents[i]=-1;});
  for(let head=0;head<queue.length;head++){
    const i=queue[head];for(const n of neighbors(map,i))if(parents[n]===-2&&(road(map.tiles[n])||buildableRoad(map.tiles[n])||clearable(map.tiles[n]))){parents[n]=i;queue.push(n);}
  }
  for(const b of buildings.filter(zone).filter(b=>!b.onMainRoadNetwork)){
    let best=null;
    for(const target of perimeter(map,b)){
      if(parents[target]===-2)continue;
      const path=[];let p=target;while(parents[p]>=0){path.push(p);p=parents[p];}
      if(path.length&&(!best||path.length<best.length))best=path.reverse();
    }
    if(best)add(best.find(i=>!road(map.tiles[i]))??best[0],`Connect ${b.type} at ${b.x},${b.y} to the main street`,best.length);
  }
  // Give Jev expansion choices even when every existing zone is connected.
  for(const i of mainRoad)for(const n of neighbors(map,i))if(!state.occupied.has(n))add(n,'Extend the connected street to open a new serviced block');
  let choices=[...suggestions.values()];
  const straight=choices.filter(p=>{
    const i=p.y*map.width+p.x;
    return neighbors(map,i).some(n=>road(map.tiles[n]) && neighbors(map,n).includes(2*n-i) && road(map.tiles[2*n-i]));
  });
  // Continue an avenue before creating tiny zigzags or filling road squares.
  if(straight.length)choices=choices.filter(p=>p.purpose.startsWith('Connect')||straight.includes(p));
  return choices.sort((a,b)=>Number(b.purpose.startsWith('Connect'))-Number(a.purpose.startsWith('Connect'))||a.routeLength-b.routeLength);
}

export function quality(observation) {
  const state=topology(observation), zones=state.buildings.filter(zone);
  const counts=Object.fromEntries(['residential','commercial','industrial'].map(t=>[t,zones.filter(b=>b.type===t).length]));
  return {zoneCounts:counts, connectedRoadTiles:state.mainRoad.length, roadComponents:state.roadComponents,
    totalRoadTiles:observation.map.tiles.filter(road).length, wireTiles:observation.map.tiles.filter(wire).length,
    zonesOnMainRoad:zones.filter(b=>b.onMainRoadNetwork).length, totalZones:zones.length,
    zonesMissingMainRoad:state.disconnectedZones.length, zonesMissingGeometricPower:state.unpoweredZones.length,
    geometricRoadCoverage:zones.length?zones.filter(b=>b.onMainRoadNetwork).length/zones.length:0,
    note:'Geometry checks street adjacency and component membership; simulation employment and growth are separate outcomes.'};
}
