import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {existsSync} from 'node:fs';import {writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const port=5197,base=process.env.GAMES_TEST_URL||`http://127.0.0.1:${port}`,server=process.env.GAMES_TEST_URL?null:spawn(process.execPath,['scripts/serve.mjs','--port',String(port)],{stdio:['ignore','pipe','pipe']});let browser;const errors=[];
const shots=process.env.UPSIDE_SHOTS||'test-results/upside';
function monitor(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});}
const st=(p,f)=>p.evaluate(f);
try{if(server)await new Promise((res,rej)=>{server.stdout.once('data',res);server.once('error',rej);setTimeout(()=>rej(Error('server timeout')),10000).unref();});await mkdir(shots,{recursive:true});
browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true});
// ---- iPhone landscape with touch ----
const phone=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});const page=await phone.newPage();monitor(page);
await page.goto(`${base}/upside.html?debug=1`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:30000});
await page.screenshot({path:`${shots}/upside-title-phone.png`});
// canvas is integer-scaled pixel art
const px=await st(page,()=>{const c=document.getElementById('screen'),r=c.getBoundingClientRect();return {ratio:r.height*devicePixelRatio/c.height,smooth:c.getContext('2d').imageSmoothingEnabled,rows:c.height/16};});
assert.ok(Math.abs(px.ratio-Math.round(px.ratio))<.01&&px.ratio>=1,`integer scale ${px.ratio}`);assert.equal(px.smooth,false);assert.ok(px.rows>=15);
await page.locator('[data-primary]').tap();assert.equal(await st(page,()=>window.__upside.game.state.mode),'playing');
for(const id of ['jumpBtn','flipBtn','runBtn','dpad'])assert.ok(await page.locator('#'+id).isVisible(),id+' visible on phone');
// d-pad right (CDP touch) moves Nib, RUN makes him faster
const cdp=await phone.newCDPSession(page),box=await page.locator('#dpad').boundingBox(),x0=await st(page,()=>window.__upside.game.state.player.x);
const tp=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
await tp('touchStart',[{x:box.x+box.width-20,y:box.y+box.height/2,id:1}]);await page.waitForTimeout(700);
const x1=await st(page,()=>window.__upside.game.state.player.x);assert.ok(x1>x0+1.5,`d-pad moves right ${x0}->${x1}`);
const rb=await page.locator('#runBtn').boundingBox();await tp('touchStart',[{x:box.x+box.width-20,y:box.y+box.height/2,id:1},{x:rb.x+rb.width/2,y:rb.y+rb.height/2,id:2}]);await page.waitForTimeout(700);
const vx=await st(page,()=>window.__upside.game.state.player.vx);await tp('touchEnd',[]);assert.ok(vx>7,`run speed ${vx}`);
// jump button
await st(page,()=>{const g=window.__upside.game,p=g.state.player;p.x=4;p.vx=0;});await page.waitForTimeout(200);
await page.locator('#jumpBtn').dispatchEvent('pointerdown',{pointerId:5});await page.waitForTimeout(150);
const vy=await st(page,()=>window.__upside.game.state.player.y);await page.locator('#jumpBtn').dispatchEvent('pointerup',{pointerId:5});assert.ok(vy<12,'jump button jumps');
await page.waitForTimeout(900);
// flip button flips gravity and Nib lands on the ceiling world
await st(page,()=>{const p=window.__upside.game.state.player;p.x=97;p.y=12.1;p.vx=0;p.ground=true;});await page.waitForTimeout(300);
await page.locator('#flipBtn').dispatchEvent('pointerdown',{pointerId:6});await page.waitForTimeout(80);await page.locator('#flipBtn').dispatchEvent('pointerup',{pointerId:6});await page.waitForTimeout(900);
const fl=await st(page,()=>{const s=window.__upside.game.state,p=s.player;return {g:p.g,ground:p.ground,y:p.y,x:p.x,mode:s.mode,lives:s.lives};});assert.equal(fl.g,-1,'flip button flips gravity');assert.ok(fl.ground&&fl.y<2.5,'landed on ceiling '+JSON.stringify(fl));
await page.screenshot({path:`${shots}/upside-ceiling-phone.png`});
assert.equal(await st(page,()=>document.documentElement.scrollWidth>innerWidth),false);
// safe-area layout: controls do not overlap each other
const bb=async id=>page.locator(id).boundingBox(),d=await bb('#dpad'),j=await bb('#jumpBtn');assert.ok(d.x+d.width<j.x,'dpad left of buttons');
await page.locator('#pauseBtn').tap();assert.equal(await st(page,()=>window.__upside.game.state.mode),'paused');await page.locator('[data-action=resume]').tap();assert.equal(await st(page,()=>window.__upside.game.state.mode),'playing');
// gameplay shot on the floor world with a power-up
await st(page,()=>{const g=window.__upside;g.begin(1);const p=g.game.state.player;p.x=16;});await page.waitForTimeout(1200);await page.screenshot({path:`${shots}/upside-phone-landscape.png`});
await phone.close();
// ---- desktop keyboard ----
const desk=await browser.newContext({viewport:{width:1280,height:720}});const d2=await desk.newPage();monitor(d2);await d2.goto(`${base}/upside.html?debug=1`);await d2.waitForFunction(()=>document.body.dataset.ready==='true');
await d2.keyboard.press('Enter');assert.equal(await st(d2,()=>window.__upside.game.state.mode),'playing');
await d2.keyboard.down('ArrowRight');await d2.keyboard.down('KeyX');await d2.waitForTimeout(600);await d2.keyboard.press('Space');await d2.waitForTimeout(500);await d2.keyboard.up('ArrowRight');await d2.keyboard.up('KeyX');
assert.ok(await st(d2,()=>window.__upside.game.state.player.x)>6,'keyboard runs right');
await d2.keyboard.press('KeyP');assert.equal(await st(d2,()=>window.__upside.game.state.mode),'paused');await d2.keyboard.press('KeyP');assert.equal(await st(d2,()=>window.__upside.game.state.mode),'playing');
await d2.keyboard.press('KeyC');await d2.waitForTimeout(100);assert.equal(await st(d2,()=>window.__upside.game.state.player.g),-1,'C flips');
await st(d2,()=>{window.__upside.begin(1);const p=window.__upside.game.state.player;p.x=17.5;});await d2.waitForTimeout(1200);await d2.screenshot({path:`${shots}/upside-desktop.png`});
if(!process.env.UPSIDE_SKIP_CAPTURE){await d2.setViewportSize({width:960,height:600});await st(d2,()=>{window.__upside.begin(1);const g=window.__upside.game,p=g.state.player;p.x=112;p.y=2;p.g=-1;p.power=1;p.h=1.75;});await d2.waitForTimeout(1500);
 const png=await d2.screenshot();await writeFile(`${shots}/upside-hub-source.png`,png);const images=await d2.evaluate(async data=>{const im=new Image();im.src=`data:image/png;base64,${data}`;await im.decode();return [480,960].map(w=>{const c=document.createElement('canvas');c.width=w;c.height=w*.625;const x=c.getContext('2d');x.imageSmoothingEnabled=w>=960?false:true;x.drawImage(im,0,0,c.width,c.height);return {w,data:c.toDataURL('image/webp',.9).split(',')[1]};});},png.toString('base64'));for(const i of images)await writeFile(`assets/upside-preview-${i.w}.webp`,Buffer.from(i.data,'base64'));}
await desk.close();assert.deepEqual(errors,[]);console.log('Upside browser: integer pixel scale, phone d-pad/run/jump/flip/pause, desktop keyboard, screenshots passed.');
}finally{await browser?.close();server?.kill();}
