import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT='/home/user/pelikirja';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(ROOT,rel);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404).end('nf');return;}res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(8799,'127.0.0.1',r));
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser=await chromium.launch({executablePath:fs.existsSync(exe)?exe:undefined});
const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'fi-FI'});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
await page.goto('http://localhost:8799/index.html'); await page.waitForTimeout(300);
await page.evaluate(()=>{
  const players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'Pelaaja '+i,number:i+1,roles:['KK'],active:true}));
  const slots=players.map(p=>p.id);
  localStorage.setItem('pelikirja.v1',JSON.stringify({version:1,team:{name:'Ilves',season:'2026'},
    staff:[{id:'s1',name:'Väinö Valmentaja',role:'paavalmentaja',phone:'',notes:'',active:true},
           {id:'s2',name:'Aino Apuvalmentaja',role:'apuvalmentaja',phone:'',notes:'',active:true}],
    lineups:[],players,
    matches:[{id:'m1',date:'2026-08-24',time:'12:00',opponent:'PJK',team:'Ilves Keltainen',home:true,venue:'',type:'ottelu',videoUrl:'',notes:'',
      lineup:{formation:'8-2-3-2',slots,bench:[],positions:{},drawings:[],staff:['s1','s2']},
      timing:null, result:{gf:2,ga:1,events:[],rating:8,ratingMax:10,notes:''}}]}));
});
await page.reload(); await page.waitForTimeout(400);
await page.evaluate(()=>{location.hash='#/ottelut';}); await page.waitForTimeout(300);
await page.locator('#view .segmented button',{hasText:'Pelatut'}).click(); await page.waitForTimeout(300);
await page.locator('#view .cards .card').first().click(); await page.waitForTimeout(500);
const info = await page.evaluate(()=>{
  const titles=[...document.querySelectorAll('#view .section-title')].map(e=>e.textContent);
  const rows=[...document.querySelectorAll('#view .card.row')].map(e=>e.textContent.replace(/\s+/g,' ').trim()).slice(-6);
  const st=JSON.parse(localStorage.getItem('pelikirja.v1'));
  return {titles, rows, staff: st.staff.map(s=>s.id+':'+s.name), lineupStaff: st.matches[0].lineup.staff};
});
console.log(JSON.stringify(info,null,1));
await browser.close(); server.close();
