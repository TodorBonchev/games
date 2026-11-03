import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {existsSync} from 'node:fs';import {writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const port=5197,base=process.env.GAMES_TEST_URL||`http://127.0.0.1:${port}`,server=process.env.GAMES_TEST_URL?null:spawn(process.execPath,['scripts/serve.mjs','--port',String(port)],{stdio:['ignore','pipe','pipe']});let browser;const errors=[];
function monitor(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});}
try{if(server)await new Promise((res,rej)=>{server.stdout.once('data',res);server.once('error',rej);setTimeout(()=>rej(Error('server timeout')),10000).unref();});await mkdir('test-results/upside',{recursive:true});
browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--enable-unsafe-swiftshader']});
// iPhone landscape with touch
const phone=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await phone.newPage();monitor(page);
await page.goto(`${base}/upside.html?debug=1`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:60000});
await page.screenshot({path:'test-results/upside/title-phone.png'});
await page.locator('[data-primary]').tap();assert.equal(await page.evaluate(()=>window.__upside.game.state.mode),'playing');
assert.ok(await page.locator('#jumpBtn').isVisible()&&await page.locator('#flipBtn').isVisible(),'touch buttons visible on phone');
const flipped0=await page.evaluate(()=>window.__upside.game.state.player.flipped);await page.locator('#flipBtn').dispatchEvent('pointerdown');await page.waitForTimeout(100);await page.locator('#flipBtn').dispatchEvent('pointerup');await page.waitForTimeout(900);
assert.notEqual(await page.evaluate(()=>window.__upside.game.state.player.flipped),flipped0,'flip button flips gravity');
await page.screenshot({path:'test-results/upside/flipped-phone.png'});
// joystick drag moves Nib forward
const cdp=await phone.newCDPSession(page),z0=await page.evaluate(()=>window.__upside.game.state.player.z);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:260,id:1}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:260-i*10,id:1}]});await page.waitForTimeout(500);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
assert.ok(await page.evaluate(()=>window.__upside.game.state.player.z)<z0-1,'joystick moves forward');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.locator('#pauseBtn').tap();assert.equal(await page.evaluate(()=>window.__upside.game.state.mode),'paused');await page.locator('[data-action=resume]').tap();assert.equal(await page.evaluate(()=>window.__upside.game.state.mode),'playing');
await phone.close();
// desktop keyboard
const desk=await browser.newContext({viewport:{width:1280,height:720}});const d=await desk.newPage();monitor(d);await d.goto(`${base}/upside.html?debug=1`);await d.waitForFunction(()=>document.body.dataset.ready==='true');
await d.keyboard.press('Enter');assert.equal(await d.evaluate(()=>window.__upside.game.state.mode),'playing');
await d.keyboard.down('KeyW');await d.waitForTimeout(700);await d.keyboard.press('Space');await d.waitForTimeout(500);await d.keyboard.up('KeyW');
assert.ok(await d.evaluate(()=>-window.__upside.game.state.player.z)>2,'keyboard runs forward');
await d.keyboard.press('KeyP');assert.equal(await d.evaluate(()=>window.__upside.game.state.mode),'paused');await d.keyboard.press('KeyP');
await d.evaluate(()=>{const p=window.__upside.game.state.player;p.z=-8;p.x=0;});await d.waitForTimeout(400);await d.screenshot({path:'test-results/upside/desktop.png'});
if(!process.env.UPSIDE_SKIP_CAPTURE){await d.setViewportSize({width:960,height:600});await d.evaluate(()=>{window.__upside.begin(2);const p=window.__upside.game.state.player;p.z=-13;p.y=9.4;p.flipped=true;});await d.waitForTimeout(1200);await d.addStyleTag({content:'.hud,.flash{display:none!important}'});await d.waitForTimeout(100);
 const png=await d.screenshot();const images=await d.evaluate(async data=>{const im=new Image();im.src=`data:image/png;base64,${data}`;await im.decode();return [480,960].map(w=>{const c=document.createElement('canvas');c.width=w;c.height=w*.625;c.getContext('2d').drawImage(im,0,0,c.width,c.height);return {w,data:c.toDataURL('image/webp',.86).split(',')[1]};});},png.toString('base64'));for(const i of images)await writeFile(`assets/upside-preview-${i.w}.webp`,Buffer.from(i.data,'base64'));}
await desk.close();assert.deepEqual(errors,[]);console.log('Upside browser: phone touch flip/joystick/pause, desktop keyboard, screenshots passed.');
}finally{await browser?.close();server?.kill();}
