const { app, BrowserWindow } = require('electron');
const { WebSocket } = require('ws');
const { once } = require('node:events');
const fs = require('node:fs'), assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.commandLine.appendSwitch('autoplay-policy', 'document-user-activation-required');
app.whenReady().then(async () => {
  let server, win, timer, presenter;
  try {
    let bridge;
    class Bridge { constructor(emit) { this.emit=emit; bridge=this; } start(){this.emit({ready:true});} stop(){} audio(){} }
    server=require('./server.cjs').createTranslationServer({port:0,host:'127.0.0.1',Bridge});
    const info=await server.listen(), address=new URL(info.presenterUrl), origin=address.origin;
    presenter=new WebSocket(origin.replace('http:','ws:')+'/presenter-ws',{origin});
    await once(presenter,'open');
    const auth=new Promise(resolve=>presenter.on('message',raw=>{if(JSON.parse(raw).authenticated)resolve();}));
    presenter.send(JSON.stringify({token:address.hash.slice(1)}));await auth;
    const ready=new Promise(resolve=>presenter.on('message',raw=>{if(JSON.parse(raw).ready)resolve();}));
    presenter.send(JSON.stringify({action:'start',key:'synthetic-test-key'}));await ready;
    const pcm=Buffer.alloc(9600);for(let i=0;i<4800;i++)pcm.writeInt16LE(Math.round(5000*Math.sin(2*Math.PI*440*i/24000)),i*2);
    let words=0;
    timer=setInterval(()=>bridge.emit({content:{outputTranscription:{text:words++===0?'Welcome. We are glad you are here. ':''},modelTurn:{parts:[{inlineData:{data:pcm.toString('base64'),mimeType:'audio/pcm;rate=24000'}}]}}}),200);
    win=new BrowserWindow({show:false,width:430,height:1000,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    await win.loadURL(origin+'/listen/'+server.room);
    const run=code=>win.webContents.executeJavaScript(code,true);
    await wait(600);
    assert.equal(await run("document.getElementById('radio').currentSrc"),'');
    await run("document.getElementById('listen').click()");
    for(let i=0;i<40;i++){if(await run("document.getElementById('radio').currentTime > 0"))break;await wait(200);}
    console.log(await run("JSON.stringify({time:document.getElementById('radio').currentTime,ready:document.getElementById('radio').readyState,error:document.getElementById('radio').error?.message,status:document.getElementById('radio-status').textContent})"));
    assert.equal(await run("document.getElementById('radio').paused"),false);
    fs.writeFileSync('C:/Users/Adrielli/source/repos/Ponte/private-storage/translation/listener-0.3.1.png',(await win.webContents.capturePage()).toPNG());
    assert.ok(await run("document.getElementById('radio').currentTime > 0"),'native MP3 must actually decode and advance');
    assert.match(await run("document.getElementById('text').textContent"),/Welcome/);
    await run("document.getElementById('listen').click()");
    assert.equal(await run("document.getElementById('radio').paused"),true);
    await run("document.getElementById('listen').click()");for(let i=0;i<50;i++){if(await run("document.getElementById('listen').textContent === 'Pausar áudio'"))break;await wait(200);}
    assert.equal(await run("document.getElementById('radio').paused"),false);
    assert.equal(await run("document.getElementById('listen').textContent"),'Pausar áudio');
    fs.writeFileSync('C:/Users/Adrielli/source/repos/Ponte/private-storage/translation/listener-0.3.1.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: real native MP3 playback, transcript, pause, live resume, mobile screenshot');
  } catch(error){console.error(error);process.exitCode=1;}
  finally {clearInterval(timer);presenter?.terminate();win?.destroy();await server?.close();app.exit(process.exitCode || 0);}
});
