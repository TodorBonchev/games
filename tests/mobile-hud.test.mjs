import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {chooseMobileContext,createMobileHud} from '../mobile-hud.js';

function setup(t){
 const dom=new JSDOM(`<body class="touch playing"><div id="hud"><div class="threat-stat"><span>HOSTILES</span><strong id="enemies">7</strong></div></div><nav id="originalUtilities"><button id="cameraBtn"></button><button id="pauseBtn"></button></nav><aside class="expedition-hud"><button id="expeditionJournal"><span id="expeditionCount">2 / 30 restored</span></button><div id="expeditionWaypoint">Prism · 20 m</div></aside><button id="activityInteract" hidden>Enter Prism</button><div id="fieldObjective" data-state="searching">Uplink</div><div id="combatDirector"><div id="lastEnemy" hidden>Last hostile</div><div id="muzzleBlocked" hidden>Blocked</div></div><div id="eliteHud" class="hide">Commander</div><section id="recoveryPanel" hidden><button id="recoveryHold">Hold</button><button id="recoveryReady">Upgrade</button></section><div id="stick"></div><div id="fireBtn"></div><button id="jumpBtn"></button><button id="orbBtn"></button><button id="evadeBtn"></button><div id="weaponHud"><span id="supplyGuide" hidden></span></div><div id="jetpackHud"></div><div id="pickupNotice"></div><div id="waveBanner"></div><div id="overdriveHud" class="hide"></div></body>`);
 const doc=dom.window.document,hud=createMobileHud({document:doc});t.after(()=>{hud.dispose();dom.window.close()});return{dom,doc,hud};
}
const shown=(doc,id)=>doc.getElementById(id).dataset.mobileContextHidden!=='true';

test('mobile objective priority keeps interaction, blocked shots and elite danger ahead of routes',()=>{
 assert.equal(chooseMobileContext({nearOutpost:true,blocked:true,elite:true,hasWaypoint:true}),'cover');
 assert.equal(chooseMobileContext({nearOutpost:true,elite:true,hasWaypoint:true}),'outpost');
 assert.equal(chooseMobileContext({blocked:true,elite:true,hasWaypoint:true}),'cover');
 assert.equal(chooseMobileContext({elite:true,fieldVisible:true,fieldState:'capturing',hasWaypoint:true}),'elite');
 for(const fieldState of ['capturing','contested','secured'])assert.equal(chooseMobileContext({fieldVisible:true,fieldState,hasWaypoint:true}),'field');
 assert.equal(chooseMobileContext({lastEnemy:true,hasWaypoint:true}),'last');
 assert.equal(chooseMobileContext({fieldVisible:true,fieldState:'searching',hasWaypoint:true}),'waypoint');
 assert.equal(chooseMobileContext({fieldVisible:true}),'field');assert.equal(chooseMobileContext(),'none');
});

test('the presenter moves the original interactive nodes without duplicating events or IDs',t=>{
 const{doc,hud,dom}=setup(t);const ids=['pauseBtn','cameraBtn','expeditionJournal','activityInteract','recoveryHold','recoveryReady','fireBtn','jumpBtn','orbBtn','evadeBtn'];
 const nodes=new Map(ids.map(id=>[id,doc.getElementById(id)])),calls=[];
 for(const[id,node]of nodes)node.addEventListener('click',()=>calls.push(id));
 hud.update({active:true});hud.update({active:true});
 for(const[id,node]of nodes){assert.equal(doc.getElementById(id),node);assert.equal(doc.querySelectorAll(`#${id}`).length,1);node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));}
 assert.deepEqual(calls,ids);assert.equal(doc.getElementById('fireBtn').contains(doc.getElementById('weaponHud')),true);assert.equal(doc.getElementById('jumpBtn').contains(doc.getElementById('jetpackHud')),true);
 assert.match(doc.getElementById('expeditionJournal').getAttribute('aria-label'),/2 \/ 30 restored/);
});

test('only the chosen objective is displayed, with optional uplink retained inside the route dock',t=>{
 const{doc,hud}=setup(t);hud.update({active:true});
 assert.equal(doc.getElementById('mobileContextDock').dataset.context,'waypoint');assert.ok(shown(doc,'expeditionWaypoint'));assert.ok(shown(doc,'fieldObjective'));assert.equal(doc.getElementById('fieldObjective').dataset.mobileSecondary,'true');
 doc.getElementById('fieldObjective').dataset.state='contested';hud.update({active:true});assert.equal(doc.getElementById('mobileContextDock').dataset.context,'field');assert.equal(shown(doc,'expeditionWaypoint'),false);
 doc.getElementById('activityInteract').hidden=false;doc.getElementById('recoveryPanel').hidden=false;hud.update({active:true});
 assert.equal(doc.getElementById('mobileContextDock').dataset.context,'outpost');assert.equal(shown(doc,'fieldObjective'),false);assert.equal(doc.getElementById('recoveryPanel').hidden,false);assert.equal(doc.getElementById('recoveryPanel').parentElement.id,'mobileContextDock');
 assert.equal(doc.getElementById('fieldObjective').classList.contains('hide'),false,'presentation does not rewrite game visibility');
});

test('pause, activities, upgrade, intro and inactive play hide all reparented controls immediately',t=>{
 const{doc,hud}=setup(t);hud.update({active:true});assert.equal(hud.element.hidden,false);
 for(const name of ['paused','activity-open','upgrading','intro']){doc.body.classList.add(name);hud.update({active:true});assert.equal(hud.element.hidden,true,name);doc.body.classList.remove(name);hud.update({active:true});assert.equal(hud.element.hidden,false);}
 hud.update({active:false});assert.equal(hud.element.hidden,true);assert.equal(doc.body.classList.contains('mobile-hud-active'),false);
});

test('desktop and disposal restore exact native parents, order, labels and hidden state',t=>{
 const{doc,hud}=setup(t);const before=[...doc.body.children],utilities=[...doc.getElementById('originalUtilities').children];
 hud.update({active:true});assert.equal(doc.querySelector('.threat-stat > span').textContent,'LEFT');
 hud.update({active:true,mobile:false});assert.deepEqual([...doc.body.children],before);assert.deepEqual([...doc.getElementById('originalUtilities').children],utilities);assert.equal(doc.querySelector('.threat-stat > span').textContent,'HOSTILES');assert.equal(doc.getElementById('activityInteract').hidden,true);assert.equal(doc.body.classList.contains('mobile-play-surface'),false);
 hud.update({active:true,mobile:true});hud.dispose();hud.dispose();assert.deepEqual([...doc.body.children],before);hud.update({active:true});assert.equal(doc.getElementById('mobileHud'),null);
});

test('supply and temporary announcements share the dock without hiding native live regions',t=>{
 const{doc,hud}=setup(t);const supply=doc.getElementById('supplyGuide');supply.hidden=false;supply.textContent='← MEDKIT · 7 m';hud.update({active:true});assert.equal(doc.getElementById('mobileStatusNotice').textContent,supply.textContent);
 const pickup=doc.getElementById('pickupNotice');pickup.textContent='+30 HEALTH';pickup.classList.add('show');hud.update({active:true});assert.equal(doc.getElementById('mobileStatusNotice').textContent,'+30 HEALTH');assert.equal(pickup.hidden,false);assert.equal(doc.getElementById('mobileStatusNotice').getAttribute('aria-hidden'),'true');
});

test('second-finger utility release activates once and cannot click through a newly opened panel',t=>{
 const{doc,hud,dom}=setup(t);hud.update({active:true});const button=doc.getElementById('pauseBtn'),underneath=doc.createElement('button');doc.body.append(underneath);let pause=0,under=0;
 button.getBoundingClientRect=()=>({left:0,top:0,right:44,bottom:44});button.addEventListener('click',()=>{pause++;hud.update({active:false})});underneath.addEventListener('click',()=>under++);
 const send=(node,type,options={})=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:20,clientY:20,...options});Object.defineProperties(event,{pointerId:{value:2},pointerType:{value:'touch'}});node.dispatchEvent(event);return event;};
 send(button,'pointerdown');send(button,'pointerup');assert.equal(pause,1);assert.equal(hud.element.hidden,true);
 const compatibility=send(underneath,'click',{detail:1});assert.equal(compatibility.defaultPrevented,true);assert.equal(under,0);
 hud.update({active:true});send(button,'pointerdown');send(button,'pointercancel');assert.equal(pause,1);
 send(button,'pointerdown');send(button,'pointerup',{clientX:90});assert.equal(pause,1,'dragging out cancels activation');
 send(button,'pointerdown');send(button,'pointerup');assert.equal(pause,2,'a fresh gesture still activates');
});
