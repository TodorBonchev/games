// Real native controls; debug helpers only locate clear ground/outposts and
// reach recovery. No manufactured inputs, cooldowns, wins or DOM visibility.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const port=Number(process.env.MOBILE_HUD_PORT)||5352,base=process.env.GAMES_TEST_URL||`http://127.0.0.1:${port}`,output='test-results/mobile-hud';
let server,browser,page;const errors=[];
async function gameTime(seconds){const start=await page.evaluate(()=>__game.time);await page.waitForFunction(({start,seconds})=>__game.time>=start+seconds,{start,seconds},{timeout:60000});}
async function bounds(name,insets){
 const data=await page.evaluate(()=>{
  const ids=['hud','expeditionJournal','cameraBtn','pauseBtn','mobileContextDock','stick','fireBtn','jumpBtn','orbBtn','evadeBtn'];
  return ids.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return{id,x:r.x,y:r.y,w:r.width,h:r.height,visible:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})};});
 });const size=page.viewportSize();
 for(const b of data){assert.ok(b.visible,`${name}: ${b.id} visible`);assert.ok(b.x>=insets.left-.5&&b.x+b.w<=size.width-insets.right+.5&&b.y>=insets.top-.5&&b.y+b.h<=size.height-insets.bottom+.5,`${name}: ${b.id} exceeds safe area ${JSON.stringify(b)}`);if(!['hud','mobileContextDock'].includes(b.id))assert.ok(b.w>=44&&b.h>=44,`${b.id} target size`);}
 for(let i=0;i<data.length;i++)for(let j=i+1;j<data.length;j++){const a=data[i],b=data[j];assert.ok(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5||a.y+a.h<=b.y+.5||b.y+b.h<=a.y+.5,`${name}: ${a.id} overlaps ${b.id} ${JSON.stringify([a,b])}`);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: horizontal overflow`);
 const buttons=await page.locator('#recoveryPanel button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return[r.width,r.height]}));for(const[w,h]of buttons)assert.ok(w>=44&&h>=44);
 await page.screenshot({path:`${output}/${name}.png`});
}
async function handed(value){
 await page.locator('#pauseBtn').tap();await page.waitForFunction(()=>__game.paused);assert.equal(await page.locator('#mobileHud').isVisible(),false);
 await page.locator('#pauseSettingsBtn').tap();const group=page.locator('#survival-pref-leftHanded').locator('xpath=ancestor::details[1]');if(!await group.evaluate(el=>el.open))await group.locator('summary').tap();await page.locator('#survival-pref-leftHanded').setChecked(value);await page.locator('#setClose').tap();await page.waitForFunction(()=>!__game.paused);await gameTime(.08);
}
try{
 if(!process.env.GAMES_TEST_URL){server=spawn(process.execPath,['scripts/serve.mjs','--port',String(port)],{stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`server ${code}`)));});}
 await mkdir(output,{recursive:true});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await context.addInitScript(()=>{let seed=4211;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);});page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.goto(`${base}/soldier.html?debug=1&q=low&noscale=1`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});assert.equal(await page.locator('#mobileHud').isVisible(),false);
 await page.locator('#startBtn').tap();await page.waitForFunction(()=>__game.mode==='intro');await page.locator('#skipBtn').tap();await page.waitForFunction(()=>__game.mode==='play'&&!__game.paused);await page.locator('#mobileHud').waitFor({state:'visible'});
 // Every native action remains reachable in the new four-button cluster.
 await page.evaluate(()=>{__game.clearWave();__game.setPos(0,0);__game.setView(0,0);});await page.locator('#recoveryHold').tap();await page.waitForFunction(()=>__game.recoveryHeld);await gameTime(.1);
 const cdp=await context.newCDPSession(page),fire=await page.locator('#fireBtn').boundingBox();const beforeShots=await page.evaluate(()=>__game.combat.shots);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:31,x:fire.x+fire.width/2,y:fire.y+fire.height/2}]});await gameTime(.3);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await page.evaluate(shots=>__game.combat.shots>shots,beforeShots));
 await page.locator('#orbBtn').tap();await page.waitForFunction(()=>__game.frozenOrb.cooldown>0);assert.match(await page.locator('#orbCooldown').textContent(),/s|\d/);
 const ground=await page.evaluate(()=>__game.alt);await page.locator('#jumpBtn').tap();await page.waitForFunction(y=>__game.alt>y+.2,ground);await gameTime(1.1);await page.evaluate(()=>__game.setPos(0,0));await gameTime(.3);
 const beforeDash=await page.evaluate(()=>__game.pos);await page.locator('#evadeBtn').tap();await page.waitForFunction(()=>__game.evasion.cooldown>0);await gameTime(.4);const afterDash=await page.evaluate(()=>__game.pos);assert.ok(Math.hypot(afterDash[0]-beforeDash[0],afterDash[2]-beforeDash[2])>.5,'native evade moves player');
 const camera=await page.evaluate(()=>__game.cameraMode);await page.locator('#cameraBtn').tap();await page.waitForFunction(value=>__game.cameraMode!==value,camera);await page.locator('#cameraBtn').tap();
 await page.locator('#expeditionJournal').tap();await page.waitForFunction(()=>__game.activities.host.phase==='journal');assert.equal(await page.locator('#mobileHud').isVisible(),false);await page.locator('#activityLeave').tap();await page.waitForFunction(()=>!__game.activities.host.active);await page.locator('#mobileHud').waitFor({state:'visible'});
 await page.evaluate(()=>{const s=__game.activities.world.stations.find(s=>s.id==='prism');__game.setPos(s.x,s.z);});await page.locator('#activityInteract').waitFor({state:'visible'});await page.locator('#activityInteract').tap();await page.waitForFunction(()=>__game.activities.host.phase==='brief');assert.equal(await page.locator('#mobileHud').isVisible(),false);await page.locator('#activityBegin').tap();await page.waitForFunction(()=>__game.activities.host.phase==='playing',null,{timeout:60000});await page.locator('#activityLeave').tap();await page.waitForFunction(()=>!__game.activities.host.active);await page.locator('#mobileHud').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>__game.paused),false);
 console.log('Native fire, jump, orb, evade, camera, journal and minigame round trip passed.');
 // The second finger often receives pointerup without click. Utilities must
 // activate once while the movement thumb remains down, including modal opens.
 for(const id of ['cameraBtn','expeditionJournal','pauseBtn']){
  const stick=await page.locator('#stick').boundingBox(),button=await page.locator(`#${id}`).boundingBox();
  const neutral={id:61,x:stick.x+stick.width/2,y:stick.y+stick.height/2},move={...neutral,y:neutral.y-30},action={id:62,x:button.x+button.width/2,y:button.y+button.height/2};
  const before=await page.evaluate(()=>({position:__game.pos,camera:__game.cameraMode}));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[neutral]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[move]});await gameTime(.1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move,action]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[action]});
  if(id==='cameraBtn'){
   await page.waitForFunction(value=>__game.cameraMode!==value,before.camera);await gameTime(.2);
   assert.notEqual(await page.evaluate(()=>__game.cameraMode),before.camera,'camera changes exactly once');
   const position=await page.evaluate(()=>__game.pos);assert.ok(Math.hypot(position[0]-before.position[0],position[2]-before.position[2])>.3,'camera action retains held movement');
  }else if(id==='expeditionJournal')await page.waitForFunction(()=>__game.activities.host.phase==='journal');
  else await page.waitForFunction(()=>__game.paused);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  if(id!=='cameraBtn')assert.equal(await page.locator('#mobileHud').isVisible(),false);
  if(id==='expeditionJournal'){await page.locator('#activityLeave').tap();await page.waitForFunction(()=>!__game.activities.host.active);}
  else if(id==='pauseBtn'){await page.locator('#resumeBtn').tap();await page.waitForFunction(()=>!__game.paused);}
  else await page.locator('#cameraBtn').tap();
  await page.locator('#mobileHud').waitFor({state:'visible'});
 }
 await page.evaluate(()=>{const s=__game.activities.world.stations.find(s=>s.id==='prism');__game.setPos(s.x,s.z);});await gameTime(.1);
 console.log('Native second-finger camera, map and pause taps passed without click-through.');
 for(const left of[false,true]){
  await handed(left);
  for(const[width,height]of[[320,568],[360,740],[390,844],[430,932],[667,375],[844,390]]){
   await page.setViewportSize({width,height});const insets=width>height?{top:0,bottom:21,left:44,right:44}:{top:47,bottom:34,left:0,right:0};await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});await gameTime(.1);
   assert.equal(await page.evaluate(()=>__game.recoveryHeld),true,'rotation preserves held recovery');await bounds(`${width}x${height}-${left?'left':'right'}`,insets);
  }
  console.log(`${left?'Left':'Right'} handed: all six viewport/safe-area layouts passed.`);
 }
 // Recovery actions remain native after all resizes and handedness changes.
 await page.locator('#recoveryReady').tap();await page.waitForFunction(()=>__game.mode==='upgrade');assert.equal(await page.locator('#mobileHud').isVisible(),false);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__game.mode),'upgrade');
 for(const[width,height]of[[320,568],[390,844],[667,375]]){
  await page.setViewportSize({width,height});const insets=width>height?{top:0,bottom:21,left:44,right:44}:{top:47,bottom:34,left:0,right:0};await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const buttons=await page.locator('#upgradePanel button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{id:node.id||node.dataset.choice,x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const b of buttons)assert.ok(b.x>=insets.left-.5&&b.x+b.w<=width-insets.right+.5&&b.y>=insets.top-.5&&b.y+b.h<=height-insets.bottom+.5&&b.w>=44&&b.h>=44,`upgrade ${width}x${height}: ${JSON.stringify(b)} outside safe area`);
  await page.screenshot({path:`${output}/upgrade-${width}x${height}.png`});
  await page.locator('#upgradeSaveBtn').tap();await page.waitForFunction(()=>__game.mode==='menu');await page.locator('#continueBtn').tap();await page.waitForFunction(()=>__game.mode==='upgrade');assert.equal(await page.locator('#mobileHud').isVisible(),false);
 }
 console.log('Small and notched upgrade actions fit; native Save & return / Continue retains the pending choice.');
 await cdp.detach();await context.close();assert.deepEqual(errors,[]);console.log('Mobile HUD: all layout and native lifecycle checks passed.');
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});console.error('State',await page.evaluate(()=>({mode:__game?.mode,paused:__game?.paused,body:document.body.className,context:document.getElementById('mobileContextDock')?.dataset,active:document.activeElement?.id})).catch(()=>null));}console.error('Browser errors',errors);throw error;}finally{await browser?.close();server?.kill();}
