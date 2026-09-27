const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const root = path.resolve(__dirname, '..');

function backend({env = {}, empty = false} = {}) {
  const routes = new Map();
  let serial = 0;
  const db = { users: [{id:'admin',username:'Xergno',name:'Admin',email:'',passwordHash:bcrypt.hashSync('admin-test-password',4)},
    {id:'regular',username:'normal',name:'User',email:'',role:'user',passwordHash:bcrypt.hashSync('user-test-password',4)}],
    events:[{id:'event',userId:'regular',start:'2026-09-25T10:00',end:'2026-09-25T11:00'}],
    sessions: [{token:'admin-token',userId:'admin',expiresAt:Date.now()+60000},{token:'user-token',userId:'regular',expiresAt:Date.now()+60000}] };
  if (empty) { db.users = []; db.events = []; db.sessions = []; }
  const store = { getDB:()=>db, save() {}, uid:()=>`new-${++serial}`, publicUser:require('../store').publicUser,
    findUserById:id=>db.users.find(u=>u.id===id), findUserByUsername:name=>db.users.find(u=>u.username.toLowerCase()===String(name).toLowerCase().trim()) };
  const app = {use() {}, listen() {}}; // Never opens a port.
  for(const method of ['get','post','put','delete']) app[method]=(url,...handlers)=>routes.set(method+' '+url,handlers);
  const express=()=>app; express.json=()=>{}; express.static=()=>{};
  const context=vm.createContext({__dirname:root,process:{env},Buffer,console,require(name) {
    if(name==='express') return express;
    if(name==='./store') return store;
    return require(name.startsWith('./')?path.join(root,name):name);
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'server.js'),'utf8'),context);
  async function call(method,url,body={},token='admin-token',id='regular') {
    const req={body,headers:{cookie:token?`dp_session=${token}`:''},params:{id},query:{}};
    const res={code:200,headers:{},status(code){this.code=code;return this;},json(data){this.data=data;return this;},setHeader(k,v){this.headers[k]=v;}};
    const handlers=routes.get(method+' '+url);
    // Middleware may call next without returning its promise.
    let index=0; const pending=[];
    function dispatch(error) { if(error) throw error; const fn=handlers[index++]; if(fn) pending.push(Promise.resolve(fn(req,res,dispatch))); }
    dispatch();
    for(let i=0;i<pending.length;i++) await pending[i];
    return res;
  }
  return {db,call};
}

test('existing Xergno is migrated without changing credentials or events', () => {
  const b=backend();
  assert.equal(b.db.users[0].role,'admin');
  assert.ok(bcrypt.compareSync('admin-test-password',b.db.users[0].passwordHash));
  assert.equal(b.db.events.length,1);
});

test('registration hashes passwords, rejects duplicate/reserved names and cannot grant admin', async () => {
  const b=backend();
  const body={username:'nuevo',name:'Nuevo',email:'test@example.com',password:'new-test-password',passwordConfirm:'new-test-password',role:'admin'};
  const r=await b.call('post','/api/auth/register',body,null);
  assert.equal(r.code,201);
  assert.equal(r.data.user.role,'user');
  assert.equal(r.data.user.passwordHash,undefined);
  assert.ok(await bcrypt.compare(body.password,b.db.users.at(-1).passwordHash));
  assert.equal((await b.call('post','/api/auth/register',{...body,username:'NUEVO'},null)).code,409);
  assert.equal((await b.call('post','/api/auth/register',{...body,username:'xergno'},null)).code,409);
  assert.equal((await b.call('post','/api/auth/register',{...body,password:'short'},null)).code,400);
  const login=await b.call('post','/api/auth/login',{username:'nuevo',password:body.password},null);
  assert.equal(login.code,200);
  assert.match(login.headers['Set-Cookie'],/dp_session=/);
});

test('all admin endpoints require authentication and administrator role', async () => {
  const b=backend();
  for(const [method,url] of [['get','/api/admin/users'],['put','/api/admin/users/:id'],['delete','/api/admin/users/:id']]) {
    assert.equal((await b.call(method,url,{},null)).code,401);
    assert.equal((await b.call(method,url,{},'user-token')).code,403);
  }
  const r=await b.call('get','/api/admin/users');
  assert.equal(r.data.users.length,2);
  assert.equal(r.data.users[1].eventCount,1);
  assert.ok(r.data.users.every(u=>!('passwordHash' in u)));
  assert.equal((await b.call('put','/api/users/me',{role:'admin'},'user-token')).data.user.role,'user');
  assert.equal((await b.call('put','/api/users/me',{username:'xergno'},'user-token')).code,409);
});

test('editing and blocking revoke sessions; admin cannot be blocked or deleted', async () => {
  const b=backend();
  const body={username:'normal',name:'Edited',email:'edit@example.com',disabled:true};
  assert.equal((await b.call('put','/api/admin/users/:id',body)).code,200);
  assert.equal(b.db.users[1].name,'Edited');
  assert.equal((await b.call('get','/api/auth/me',{},'user-token')).code,401);
  assert.equal((await b.call('post','/api/auth/login',{username:'normal',password:'user-test-password'},null)).code,401);
  assert.equal((await b.call('put','/api/admin/users/:id',{...body,username:'Xergno'},'admin-token','admin')).code,400);
  assert.equal((await b.call('delete','/api/admin/users/:id',{},'admin-token','admin')).code,400);
  const r=await b.call('put','/api/admin/users/:id',{...body,disabled:false,password:'changed-password'});
  assert.equal(r.code,200);
  assert.ok(await bcrypt.compare('changed-password',b.db.users[1].passwordHash));
});

test('deleting users removes only their events and sessions', async () => {
  const b=backend();
  b.db.events.push({id:'admin-event',userId:'admin'});
  assert.equal((await b.call('delete','/api/admin/users/:id')).code,200);
  assert.deepEqual(b.db.users.map(u=>u.id),['admin']);
  assert.deepEqual(b.db.events.map(e=>e.id),['admin-event']);
  assert.equal(b.db.sessions.length,1);
});

test('concurrent registrations cannot duplicate usernames', async () => {
  const b=backend();
  const body={username:'concurrent',name:'Concurrent',email:'concurrent@example.com',password:'strong-password',passwordConfirm:'strong-password'};
  const results=await Promise.all([b.call('post','/api/auth/register',body,null),b.call('post','/api/auth/register',body,null)]);
  assert.deepEqual(results.map(r=>r.code).sort(),[201,409]);
});

test('registration requires every field and matching password confirmation', async () => {
  const b=backend();
  const valid={username:'required',name:'Test',email:'test@example.com',password:'strong-password',passwordConfirm:'strong-password'};
  for (const field of Object.keys(valid)) {
    for (const value of [undefined, '']) {
      assert.equal((await b.call('post','/api/auth/register',{...valid,[field]:value},null)).code,400,field);
    }
  }
  assert.equal((await b.call('post','/api/auth/register',{...valid,name:'   '},null)).code,400);
  assert.equal((await b.call('post','/api/auth/register',{...valid,email:'   '},null)).code,400);
  assert.equal((await b.call('post','/api/auth/register',{...valid,passwordConfirm:'different-password'},null)).code,400);
  assert.equal(b.db.users.length,2);
});

test('production requires a new seed password and uses HTTPS cookies', async () => {
  assert.throws(()=>backend({env:{NODE_ENV:'production'},empty:true}),/Configura SEED_USERNAME/);
  assert.throws(()=>backend({env:{NODE_ENV:'production',SEED_USERNAME:'owner',SEED_PASSWORD:'abc'},empty:true}),/Configura SEED_PASSWORD/);
  const b=backend({env:{NODE_ENV:'production',SEED_USERNAME:'owner',SEED_PASSWORD:'SeedTest1234'},empty:true});
  assert.equal(b.db.users[0].username,'owner');
  assert.equal(b.db.users[0].role,'admin');
  const login=await b.call('post','/api/auth/login',{username:'owner',password:'SeedTest1234'},null);
  assert.equal(login.code,200);
  assert.match(login.headers['Set-Cookie'],/; Secure/);
  assert.match((await b.call('post','/api/auth/logout',{},null)).headers['Set-Cookie'],/; Secure/);
  const health=await b.call('get','/api/health',{},null);
  assert.equal(health.code,200);
  assert.equal(health.data.status,'ok');
});

test('seed changes do not promote existing users and xergno is not reserved on new installs', async () => {
  const existing=backend({env:{SEED_USERNAME:'normal',SEED_PASSWORD:'different-password'}});
  assert.equal(existing.db.users[1].role,'user');
  assert.equal(existing.db.users[0].role,'admin');
  assert.ok(bcrypt.compareSync('admin-test-password',existing.db.users[0].passwordHash));
  const fresh=backend({empty:true,env:{SEED_USERNAME:'myadmin',SEED_PASSWORD:'SeedTest1234'}});
  const registration=await fresh.call('post','/api/auth/register',{username:'xergno',name:'User',email:'user@example.com',password:'user-password',passwordConfirm:'user-password'},null);
  assert.equal(registration.code,201);
  assert.equal(registration.data.user.role,'user');
});

 test('initial admin password accepts 4 to 12 characters only', () => {
  for (const password of ['abcd', 'abcdefghijkl']) assert.equal(backend({empty:true,env:{SEED_USERNAME:'owner',SEED_PASSWORD:password}}).db.users[0].role,'admin');
  for (const password of ['', 'abc', 'abcdefghijklm']) assert.throws(()=>backend({empty:true,env:{SEED_USERNAME:'owner',SEED_PASSWORD:password}}),/Configura SEED_PASSWORD/);
 });
