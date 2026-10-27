// All six skill games are completed by physical touch gestures.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.GAMES_TEST_URL || 'http://127.0.0.1:5203';
const server=process.env.GAMES_TEST_URL ? null : spawn(process.execPath,['scripts/serve.mjs','--port','5203'],{stdio:['ignore','pipe','pipe']});
if(server) await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`server exited ${code}`)));});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']});
const ids=['tidehook','bellwood-beats','parcel-parade','wobble-bakery','mothlight','cloud-potter'];
try{for(const id of ids){
  const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2}),p=await c.newPage(),cdp=await c.newCDPSession(p),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${base}/arcade.html?game=${id}&debug=1`);await p.waitForFunction(()=>document.body.dataset.ready==='true');await p.locator('[data-action=start]').tap();await p.evaluate(()=>__arcade.setRealtime(false));
  async function point(x,z){return p.evaluate(async({x,z})=>{const THREE=await import('three'),r=document.querySelector('#arcadeStage').getBoundingClientRect(),v=new THREE.Vector3(x,0,z).project(__arcade.camera);return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};},{x,z});}
  async function touch(type,x,z){const q=type==='touchEnd'?null:await point(x,z);await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:q?[{...q,id:1}]:[]});}
  async function tap(x,z){await touch('touchStart',x,z);await p.waitForTimeout(50);await touch('touchEnd');await p.waitForTimeout(25);}
  async function advance(n){await p.evaluate(n=>__arcade.advance(n),n);}
  async function state(){return p.evaluate(()=>({...__arcade.game.state}));}
  if(id==='tidehook'){
    for(let n=0;n<8;n++){let s=await state();await touch('touchStart',s.fishX,0);let caught=false;for(let k=0;k<130;k++){await advance(.05);s=await state();await touch('touchMove',s.fishX,0);if(Math.abs(s.depth-s.fishZ)<.2){await p.waitForTimeout(30);await touch('touchEnd');caught=true;break;}}assert.ok(caught);assert.equal((await state()).caught,n+1);}
  }else if(id==='bellwood-beats'){
    for(const seq of [[0,1,2],[2,0,1,2],[1,2,0,2,1]]){await tap(0,0);await advance(4);assert.equal((await state()).phase,'repeat');for(const note of seq)await tap([-3,0,3][note],0);}
  }else if(id==='parcel-parade'){
    for(const color of [0,2,1,0,1,2,0,2,1]){const s=await state();await touch('touchStart',0,s.z);await p.waitForTimeout(35);await touch('touchMove',[-3.4,0,3.4][color],-3.65);await p.waitForTimeout(35);await touch('touchEnd');}
  }else if(id==='wobble-bakery'){
    await touch('touchStart',0,0);for(let i=0;i<160&&(await state()).mode==='playing';i++){let s=await state();await touch('touchMove',s.cake,0);await advance(.2);}await touch('touchEnd');
  }else if(id==='mothlight'){
    const ends=[[3.7,-2.8],[-3.7,-2.8],[1.2,-2.7],[-1.2,-2.7]];let s=await state();await touch('touchStart',s.mothX,s.mothZ);for(let i=0;i<650&&(s=await state()).mode==='playing';i++){const [x,z]=ends[s.delivered],dx=x-s.mothX,dz=z-s.mothZ,d=Math.hypot(dx,dz)||1;await touch('touchMove',s.mothX+dx/d*1.15,s.mothZ+dz/d*1.15);await advance(.18);}await touch('touchEnd');
  }else if(id==='cloud-potter'){
    const rows=[-2.65,-1.05,.55,2.15],goals=[[1,3,2,1],[2,2,3,1],[1,2,3,2]];for(let round=0;round<3;round++)for(let row=0;row<4;row++){let s;while((s=await state()).mode==='playing'&&s.round===round&&s.widths[row]!==goals[round][row]){let dir=Math.sign(goals[round][row]-s.widths[row]);await touch('touchStart',2,rows[row]);await p.waitForTimeout(40);await touch('touchMove',2+dir*.8,rows[row]);await p.waitForTimeout(30);await touch('touchEnd');}}
  }
  assert.equal((await state()).mode,'won',`${id}: all controls work with real touch`);
  assert.equal(await p.evaluate(()=>__arcade.mode),'won',`${id}: result remains open after the last finger lifts`);
  assert.ok(await p.locator('[data-action=restart]').isVisible());
  const wins=await p.evaluate(id=>JSON.parse(localStorage.getItem(`games:arcade:${id}:record`)).wins,id);
  await p.reload();await p.waitForFunction(()=>document.body.dataset.ready==='true');await p.locator('[data-action=continue]').tap();
  assert.equal(await p.evaluate(()=>__arcade.mode),'won',`${id}: completed game resumes at its result`);
  assert.equal(await p.evaluate(id=>JSON.parse(localStorage.getItem(`games:arcade:${id}:record`)).wins,id),wins,'continuing does not duplicate a win');
  if(id==='bellwood-beats'){await p.locator('[data-action=restart]').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>__arcade.mode),'playing','keyboard can activate the result immediately');}
  assert.deepEqual(errors,[]);console.log(id,'complete using touch');await c.close();
}}finally{await browser.close();if(server)server.kill();}
