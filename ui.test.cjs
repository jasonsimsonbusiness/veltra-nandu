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
  mount(app,{express,authToken,Package,RateLimit:dependency('express-rate-limit'),Team:{checkPermissions:async(_,id)=>id==='@team/visible'},Op:dependency('sequelize').Op});
  app.get('/docs',(_req,res)=>res.json({name:'docs'}));
  app.get('/@team/visible',(req,res)=>res.json({name:'@team/visible'}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const route of ['/','/packages','/package/%40team%2Fvisible','/docs','/signin','/signup','/tokens']){const r=await fetch(base+route,{headers:{accept:'text/html'}});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);}
    const anonymous=await fetch(base+'/-/ui/packages');assert.equal(anonymous.status,401);assert.equal(queries,0);assert.equal(anonymous.headers.get('cache-control'),'private, no-store');
    const member=await fetch(base+'/-/ui/packages',{headers:{authorization:'user'}});assert.deepEqual((await member.json()).items.map(p=>p.name),['@team/visible']);
    const root=await fetch(base+'/-/ui/packages',{headers:{authorization:'root'}});assert.equal((await root.json()).items.length,2);
    assert.deepEqual(await (await fetch(base+'/docs',{headers:{accept:'application/json'}})).json(),{name:'docs'});
    const metadata=await fetch(base+'/@team/visible');assert.deepEqual(await metadata.json(),{name:'@team/visible'});
    const script=await fetch(base+'/-/assets/app.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});


test('signup validates input, prevents privilege injection, handles duplicates, and limits attempts', async () => {
  const app=express();const records=[];
  const User={create:async data=>{if(records.some(user=>user.name===data.name||user.email===data.email)){const error=new Error('duplicate');error.name='SequelizeUniqueConstraintError';throw error;}records.push(data);return {...data,generateToken:()=> 'test-session'};}};
  mount(app,{express,User,RateLimit:dependency('express-rate-limit'),authToken:()=> (_req,res)=>res.sendStatus(401)});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}/-/ui/signup`;
  const valid={username:'New_User',email:'PERSON@example.com',password:'long-test-passphrase'};
  const signup=body=>fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await signup({...valid,password:'short'})).status,400);
    assert.equal((await signup({...valid,email:'invalid'})).status,400);
    assert.equal((await signup({...valid,username:'../admin'})).status,400);
    const response=await signup({...valid,type:'root',_id:'org.couchdb.user:veltra-admin',role:'owner',team:'maintainers'});
    assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'private, no-store');
    const body=await response.json();assert.equal(body.user.type,'user');assert.equal(body.user.name,'new_user');assert.equal(body.user.email,'person@example.com');assert.equal(body.token,'test-session');assert.equal(body.user.password,undefined);
    assert.equal(records[0].type,'user');assert.equal(records[0]._id,'org.couchdb.user:new_user');assert.equal(records[0].role,undefined);assert.equal(records[0].team,undefined);
    assert.equal((await signup(valid)).status,409);
    assert.equal((await signup({...valid,password:'é'.repeat(40)})).status,400);
    for(let i=0;i<2;i++)await signup({...valid,password:'short'});
    assert.equal((await signup(valid)).status,429);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
