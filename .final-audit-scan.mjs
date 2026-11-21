import fs from 'node:fs';
import {JSDOM} from './node_modules/jsdom/lib/api.js';
import {REDIRECTS} from './migration-scripts/redirects.config.mjs';
const hosts=['https://navi.sygnal.cloud','https://www.tournewzealand.com'];
const same=u=>hosts.includes(u.origin);
const wf=/webflow|website-files\.com|webflow\.io|uploads-ssl|webflow-prod|webflow-assets/i;
const fetcher=async(u,opts={})=>{for(let i=0;i<2;i++)try{const r=await fetch(u,{signal:AbortSignal.timeout(14000),...opts});return {status:r.status,url:r.url,location:r.headers.get('location'),type:r.headers.get('content-type'),robot:r.headers.get('x-robots-tag'),text:await r.text()}}catch(e){if(i) return {status:0,url:u,error:String(e.cause??e),text:''}}};
async function pool(values,work,n=8){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<values.length){const v=values[i++];await work(v)}}))}
const sm=await Promise.all(hosts.map(h=>fetcher(h+'/sitemap.xml')));
const sitemap=sm.map(r=>[...r.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m=>new URL(m[1])));
const archive=[...fs.readFileSync('_source/sitemap.xml','utf8').matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m=>new URL(m[1]).pathname);
const all=new Set([...sitemap.flat().map(u=>u.pathname),...archive,...REDIRECTS.map(r=>r.from),'/404','/navi-audit-missing-route-d5e1','/api/webhook-capture','/search?query=Hobbiton','/tours/tour?id=audit','/tour/hobbiton-movie-set-tour-1-day/','/payment/','/tour/hobbiton-movie-set-tour-1-day?audit=1']);
const pages=hosts.map(()=>({}));
function extract(r){
 const d=new JSDOM(r.text,{url:r.url}).window.document;
 const pairs=[];
 const add=(kind,raw)=>{ if(!raw || raw.startsWith('#'))return;try{const u=new URL(raw,r.url);if(/^https?:$/.test(u.protocol)) pairs.push([kind,u.href])}catch{}};
 for(const e of d.querySelectorAll('[src],[href],[action],[poster],[srcset],[style],[content]')){
  if(e.hasAttribute('src'))add(e.tagName.toLowerCase(),e.getAttribute('src'));
  if(e.hasAttribute('href'))add(e.tagName==='A'?'link':e.getAttribute('rel')||e.tagName.toLowerCase(),e.getAttribute('href'));
  for(const k of ['action','poster'])add(k,e.getAttribute(k));
  if(e.getAttribute('srcset'))for(const v of e.getAttribute('srcset').split(','))add('srcset',v.trim().split(/\s+/)[0]);
  if(e.getAttribute('style'))for(const m of e.getAttribute('style').matchAll(/url\(\s*["']?([^)"']+)/g))add('style',m[1]);
  if(/image/i.test(e.getAttribute('property')||''))add('meta-image',e.getAttribute('content'));
 }
 const inline=[...d.querySelectorAll('script:not([src]), style')].flatMap(e=>[...e.textContent.matchAll(/https?:\/\/[^"'\s<>)]+/g)].map(m=>m[0]));
 const form=[...d.forms].map(f=>[f.id,f.className,f.getAttribute('action'),f.method,[...f.attributes].map(a=>a.name).filter(x=>/studio|basin|handler/.test(x)),[...f.elements].filter(e=>e.required).map(e=>e.name)]);
 const main=d.querySelector('main')??d.body;
 return {title:d.title,h1:[...main.querySelectorAll('h1')].map(n=>n.textContent.trim()),canonical:d.querySelector('link[rel=canonical]')?.href,robots:d.querySelector('meta[name=robots]')?.content,desc:d.querySelector('meta[name=description]')?.content,links:[...new Set(pairs.filter(x=>x[0]==='link').map(x=>x[1]))],res:pairs.filter(x=>x[0]!=='link'),wfInline:inline.filter(x=>wf.test(x)),inline,hashes:[...new Set([...d.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')).filter(s=>s.length>1))],ids:[...d.querySelectorAll('[id],a[name]')].map(e=>e.id||e.name),form,text:main.textContent?.length,htmlLength:r.text.length};
}
async function scan(paths){await pool(paths.flatMap(p=>[0,1].map(i=>[i,p])),async([i,p])=>{
 if(pages[i][p])return;
 const r=await fetcher(hosts[i]+p,{redirect:'manual'});
 let data={};if(r.type?.includes('text/html'))try{data=extract(r)}catch(e){data={parseError:String(e)}}
 const {text,...meta}=r;pages[i][p]={...meta,...data};
})}
await scan([...all]);
function linked(){return [...new Set(pages.flatMap(site=>Object.values(site).flatMap(r=>r.links??[])).map(s=>new URL(s)).filter(same).map(u=>u.pathname+u.search))].filter(p=>!all.has(p))}
const discovered=linked(); await scan(discovered); for(const p of discovered)all.add(p); const extra=linked();await scan(extra);
const resources={};for(const [p,r] of Object.entries(pages[0]))for(const [kind,u] of r.res??[]){(resources[u]??={kind,paths:new Set()}).paths.add(p)}
const fetched={};
async function resourceBatch(entries){await pool(entries,async([u,o])=>{
 const r=await fetcher(u);const {text,...meta}=r;
 fetched[u]={...meta,kind:o.kind,paths:[...o.paths],size:r.text.length,literals:[]};
 if(!['stylesheet','script','css-import'].includes(o.kind))return;
 const trans=[...text.matchAll(/url\(\s*["']?([^)"']+)|@import\s+["']([^"']+)/g)].map(m=>(m[1]??m[2]).trim()).filter(v=>!v.startsWith('data:')&&!v.startsWith('#'));
 const literals=[...text.matchAll(/(?:https?:)?\/\/[a-z\d][a-z\d.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^"'\s<>)`\\]*)?/gi)].map(m=>m[0]);
 fetched[u].literals=[...new Set(literals.filter(v=>wf.test(v)))];
 if(o.kind==='script')return;
 for(const v of trans)try{let s=new URL(v,r.url);if(!/^https?:$/.test(s.protocol))continue;const item=resources[s.href]??={kind:s.pathname.endsWith('.css')?'css-import':'css-url',paths:new Set()};for(const p of o.paths)item.paths.add(p)}catch{}
 },10)}
await resourceBatch(Object.entries(resources));await resourceBatch(Object.entries(resources).filter(([u])=>!fetched[u]));await resourceBatch(Object.entries(resources).filter(([u])=>!fetched[u]));
fs.writeFileSync(process.env.TEMP+'/navi-final-audit.json',JSON.stringify({hosts,sitemap:sitemap.map(s=>s.map(u=>u.href)),sitemapHeaders:sm.map(({text,...m})=>m),archive,discovered,extra,pages,fetched,roots:await Promise.all(hosts.map(h=>fetcher(h+'/robots.txt')))}));
