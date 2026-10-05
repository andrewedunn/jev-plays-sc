import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
registerHooks({
 resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL && !specifier.match(/\.[a-z]+$/i)) {
   const url = new URL(specifier + '.ts', context.parentURL); if (existsSync(fileURLToPath(url))) return {url:url.href, shortCircuit:true};
  }
  return nextResolve(specifier, context);
 },
 load(url, context, nextLoad) {
  if(url.endsWith('/engine/traffic.js') && process.argv.includes('--patched')) {const source=readFileSync(fileURLToPath(url),'utf8').replace('new Position(startPos)','new Position(startPos.x, startPos.y)').replace('Position.move(pos, dir)','Position.move(drivePos, dir)').replace('new Position(drivePos)','new Position(drivePos.x, drivePos.y)');return {format:'module',source,shortCircuit:true};}
  if(url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return nextLoad(url,context);
 }
});

const root=resolve(process.argv[2]||'../hallucinatingsplines');
const {Traffic}=await import(pathToFileURL(resolve(root,'src/engine/traffic.js')).href);
const {Position}=await import(pathToFileURL(resolve(root,'src/engine/position.ts')).href);
// A deterministic two-tile road, destination alongside the second tile.
const values=new Map([['2,2',66],['3,2',66],['3,1',612]]);
const map={width:8,height:8,getTileValue:(x,y)=>values.get(x+','+y)||0,getTileFromMapOrDefault:(p,d,fallback)=>{const q=Position.move(p,d);return values.get(q.x+','+q.y)??fallback;}};
const traffic=new Traffic(map,{getSprite:()=>null});
const found=traffic.tryDrive(new Position(2,2),tile=>tile===612);
const patched=process.argv.includes('--patched');
assert.equal(found,patched);
console.log(JSON.stringify({patched,routeFound:found,expectedRoute:true,conclusion:patched?'Three corrections restore this route in memory; source files unchanged.':'Known reachable destination was missed by the local engine.'}));
