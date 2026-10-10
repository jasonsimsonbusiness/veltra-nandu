const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const dependency = createRequire(require('node:path').join(__dirname,'upstream/packages/service/package.json'));
const express = dependency('express');
const mount = require('./ui-server.cjs');

test('UI routes preserve npm routes and catalog respects user permissions', async () => {
  const app=express();
  let queries=0;
  const rows=['@private/hidden','@team/visible'];
  const Package={findAll:async()=>{queries++;return rows.map(id=>({getDataValue:()=>id}));},getPackage:async id=>({versions:{'1.0.0':{description:'Example',license:'MIT'}},'dist-tags':{latest:'1.0.0'},time:{modified:'2026-01-01'},access:'restricted'})};
  const authToken=()=> (req,res,next)=>{if(!req.headers.authorization)return res.sendStatus(401);res.locals.user={_id:'user',type:req.headers.authorization==='root'?'root':'user'};next();};
  mount(app,{express,authToken,Package,Team:{checkPermissions:async(_,id)=>id==='@team/visible'},Op:dependency('sequelize').Op});
  app.get('/docs',(_req,res)=>res.json({name:'docs'}));
  app.get('/@team/visible',(req,res)=>res.json({name:'@team/visible'}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const route of ['/','/packages','/package/%40team%2Fvisible','/docs','/signin','/tokens']){const r=await fetch(base+route,{headers:{accept:'text/html'}});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);}
    const anonymous=await fetch(base+'/-/ui/packages');assert.equal(anonymous.status,401);assert.equal(queries,0);assert.equal(anonymous.headers.get('cache-control'),'private, no-store');
    const member=await fetch(base+'/-/ui/packages',{headers:{authorization:'user'}});assert.deepEqual((await member.json()).items.map(p=>p.name),['@team/visible']);
    const root=await fetch(base+'/-/ui/packages',{headers:{authorization:'root'}});assert.equal((await root.json()).items.length,2);
    assert.deepEqual(await (await fetch(base+'/docs',{headers:{accept:'application/json'}})).json(),{name:'docs'});
    const metadata=await fetch(base+'/@team/visible');assert.deepEqual(await metadata.json(),{name:'@team/visible'});
    const script=await fetch(base+'/-/assets/app.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
