import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/puzzle-games.js';

const make = id => games.find(item => item.id === id).create({ THREE, root: new THREE.Group(), seed: 117 });
function tap(game, x, z) { game.pointer('down', x, z); game.pointer('up', x, z); game.sync(); }
const cell = (i, cols, rows, size, offset = 0) => ({ x:(i%cols-(cols-1)/2)*size, z:(Math.floor(i/cols)-(rows-1)/2)*size+offset });
const tapCell = (game, i, cols, rows, size, offset = 0) => { const p = cell(i,cols,rows,size,offset); tap(game,p.x,p.z); };

test('all seven named puzzle worlds have independent characters, rules, and safe snapshots', () => {
  assert.equal(games.length, 7);
  assert.equal(new Set(games.map(game => game.id)).size, 7);
  assert.equal(new Set(games.map(game => game.hero)).size, 7);
  for (const definition of games) {
    const root = new THREE.Group(), game = definition.create({ THREE, root, seed: 117 });
    assert.ok(root.children.length >= 3, `${definition.id} builds a visible world`);
    const before = game.snapshot(); assert.equal(game.restore(before), true);
    for (const bad of [null, {}, { ...before, schema: 9 }, { ...before, game: 'someone-else' }, { ...before, mode: 'oops' }, { ...before, level: 999 }]) assert.equal(game.restore(bad), false, `${definition.id} rejects corrupt data`);
    assert.deepEqual(game.snapshot(), before);
    game.pointer('down', 0, 0); game.pointer('cancel', 0, 0); game.pointer('up', 0, 0);
    assert.deepEqual(game.snapshot(), before, `${definition.id} cancels interrupted fingers`);
    assert.equal(typeof game.hud().primary, 'string'); game.dispose();
  }
});

test('Tansy can push every root home through legal adjacent walks', () => {
  const game=make('burrow-banquet');
  for(let level=1;level<=3;level++) {
    const initial=game.snapshot(), queue=[{snapshot:initial,path:[]}], seen=new Set();let solution=null;
    for(let cursor=0;cursor<queue.length && cursor<15000 && !solution;cursor++){
      const node=queue[cursor],key=`${node.snapshot.player}|${[...node.snapshot.crates].sort((a,b)=>a-b)}`;
      if(seen.has(key))continue;seen.add(key);
      const p=node.snapshot.player, x=p%5,z=Math.floor(p/5);
      for(const [dx,dz] of [[0,-1],[1,0],[0,1],[-1,0]]){
        const xx=x+dx,zz=z+dz;if(xx<0||xx>=5||zz<0||zz>=5)continue;
        assert.ok(game.restore(node.snapshot));const target=zz*5+xx;tapCell(game,target,5,5,1.75,.25);
        if(game.state.level!==level||game.state.mode==='won'){solution=[...node.path,target];break;}
        if(game.state.player!==p)queue.push({snapshot:game.snapshot(),path:[...node.path,target]});
      }
    }
    assert.ok(solution,`burrow ${level} has a solution`);assert.ok(game.restore(initial));for(const target of solution)tapCell(game,target,5,5,1.75,.25);
    assert.equal(level===3?game.state.mode:game.state.level,level===3?'won':level+1);
  }
  game.dispose();
});

test('Cleo can complete all four color-logic skies through taps', () => {
  const game=make('moon-basket'), solution=[1,2,3,4,3,4,1,2,2,1,4,3,4,3,2,1];
  for(let level=1;level<=4;level++){
    for(let i=0;i<16 && game.state.level===level && game.state.mode==='playing';i++) {
      if(!game.state.cells[i])for(let n=0;n<solution[i] && game.state.level===level;n++)tapCell(game,i,4,4,2.05,.2);
    }
    assert.equal(level===4?game.state.mode:game.state.level,level===4?'won':level+1);
  }game.dispose();
});

test('Bolo moves every tower by obeying the log-size rule', () => {
  const game=make('stack-strata'), positions=[-3.2,0,3.2];
  const solve=(n,a,b,c)=>{if(!n)return;solve(n-1,a,c,b);tap(game,positions[a],0);tap(game,positions[c],0);solve(n-1,b,a,c);};
  for(let level=1;level<=3;level++){solve(level+1,0,1,2);assert.equal(level===3?game.state.mode:game.state.level,level===3?'won':level+1);}game.dispose();
});

test('Mona can light each constellation with the actual neighbor toggles', () => {
  const game=make('jelly-lanterns'), solutions=[[0,4],[1,5,6],[0,2,4,7],[1,2,3,6,8]];
  for(let level=1;level<=4;level++){for(const i of solutions[level-1]){if(game.state.level!==level||game.state.mode!=='playing')break;tapCell(game,i,3,3,2.6,.2);}assert.equal(level===4?game.state.mode:game.state.level,level===4?'won':level+1);}game.dispose();
});

test('Fenn discovers each pair by revealing and remembering tiles', () => {
  const game=make('dream-duos');
  for(let level=1;level<=3;level++){
    const known=new Map();let tries=0;
    while(game.state.level===level&&game.state.mode==='playing'&&tries++<200){
      const s=game.state,rows=Math.ceil(s.deck.length/4),available=s.deck.map((_,i)=>i).filter(i=>!s.matched.includes(i));
      let a=-1,b=-1;
      for(const i of available){if(!known.has(i))continue;const match=available.find(j=>j!==i&&known.get(j)===known.get(i));if(match!==undefined){a=i;b=match;break;}}
      if(a<0){a=available.find(i=>!known.has(i))??available[0];b=available.find(i=>i!==a&&!known.has(i))??available.find(i=>i!==a);}
      tapCell(game,a,4,rows,2.05,.3); if(game.state.level!==level)break;known.set(a,game.state.deck[a]);
      tapCell(game,b,4,rows,2.05,.3);if(game.state.level!==level||game.state.mode==='won')break;known.set(b,game.state.deck[b]);
      if(game.state.delay)for(let i=0;i<18;i++)game.update(.05);
    }
    assert.ok(tries<200);assert.equal(level===3?game.state.mode:game.state.level,level===3?'won':level+1);
  }game.dispose();
});

test('Kiko can reverse the corner turns and restore all four mosaics', () => {
  const game=make('flock-shift'), scrambles=[[[0,0]],[[0,0],[1,1]],[[0,0],[1,1],[0,1]],[[0,0],[1,1],[0,1],[1,0]]];
  for(let level=1;level<=4;level++){
    for(const [row,col] of [...scrambles[level-1]].reverse())for(let n=0;n<3;n++){if(game.state.level!==level||game.state.mode!=='playing')break;tap(game,col?-1.15*-1:-1.15,row?1.20:-1.10);}
    assert.equal(level===4?game.state.mode:game.state.level,level===4?'won':level+1);
  }game.dispose();
});

function sortSolution(jars,cap) {
  const initial=JSON.stringify(jars),queue=[{jars,path:[]}],seen=new Set([initial]);
  for(let cursor=0;cursor<queue.length;cursor++){
    const node=queue[cursor];
    if(node.jars.every(j=>!j.length||j.length===cap&&j.every(v=>v===j[0])))return node.path;
    for(let a=0;a<jars.length;a++)for(let b=0;b<jars.length;b++){
      if(a===b||!node.jars[a].length||node.jars[b].length>=cap)continue;
      const color=node.jars[a].at(-1);if(node.jars[b].length&&node.jars[b].at(-1)!==color)continue;
      const next=node.jars.map(j=>[...j]);while(next[a].at(-1)===color&&next[b].length<cap)next[b].push(next[a].pop());
      const key=JSON.stringify(next);if(!seen.has(key)){seen.add(key);queue.push({jars:next,path:[...node.path,[a,b]]});}
    }
  }
  return null;
}
test('Mallow sorts each recipe through legal pours', () => {
  const game=make('kelp-kitchen');
  for(let level=1;level<=3;level++){
    const cap=level===3?3:2,solution=sortSolution(game.state.jars,cap);assert.ok(solution,`recipe ${level} is solvable`);
    const centers=game.state.jars.length===4?[-3.3,-1.1,1.1,3.3]:[-4,-2,0,2,4];
    for(const [a,b] of solution){if(game.state.level!==level||game.state.mode!=='playing')break;tap(game,centers[a],0);tap(game,centers[b],0);}
    assert.equal(level===3?game.state.mode:game.state.level,level===3?'won':level+1);
  }game.dispose();
});
