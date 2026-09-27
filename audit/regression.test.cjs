const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function frontend() {
  const elements = new Map();
  let intervals = 0;
  function element() {
    return { innerHTML: '', value: '', dataset: {}, style: { setProperty(key, value) { this[key] = value; } }, children: [], listeners: {},
      setAttribute(key, value) { this[key] = value; },
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      appendChild(child) { this.children.push(child); }, focus() {}, reset() {} };
  }
  for (const [, id] of read('public/index.html').matchAll(/id="([^"]+)"/g)) elements.set(id, element());
  const window = { addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({ console, window,
    setTimeout() {}, clearTimeout() {}, setInterval() { intervals++; },
    localStorage: { getItem() { return null; }, setItem() {} },
    document: { addEventListener() {}, getElementById: id => elements.get(id) || null,
      createElement: element, querySelectorAll() { return []; }, querySelector() { return null; } }
  });
  for (const name of ['date', 'api', 'calendar', 'app', 'accounts']) vm.runInContext(read(`public/js/${name}.js`), context);
  return { run: code => vm.runInContext(code, context), elements, intervals: () => intervals };
}

test('login initializes calendar once and renders all four views with descriptions', async () => {
  const f = frontend();
  await f.run(`API.getEvents = async () => ({events: []}); App.enterApp({id:'u',username:'test'});`);
  f.run(`Calendar.init(); DP.date = new Date(2026,8,24); DP.events.set('e', {id:'e',title:'Task',description:'A <script>\\nB',urgency:2,color:'#00ff41',start:'2026-09-24T09:00',end:'2026-09-24T10:00'});`);
  for (const view of ['day', 'week', 'month', 'year']) {
    f.run(`DP.view='${view}'; Calendar.render()`);
    assert.ok(f.elements.get('calendar').innerHTML.length > 100);
    assert.ok(!f.elements.get('calendar').innerHTML.includes('<script>'));
  }
  assert.equal(f.intervals(), 1);
  assert.equal(f.elements.get('next-btn').listeners.click.length, 1);
  assert.equal(f.run('window.Calendar === Calendar'), true);
});

test('palette and legacy numeric colors are real hexadecimal colors', () => {
  const f = frontend(); f.run('App.buildColorSwatches()');
  assert.equal(f.elements.get('tk-colors').children.length, 8);
  for (const el of f.elements.get('tk-colors').children) assert.match(el.dataset.color, /^#[\da-f]{6}$/i);
  assert.equal(f.run("taskColor('1')"), '#00ffff');
  assert.equal(f.run(`taskColor('red" onclick="alert(1)')`), '#00ff41');
});

test('HOY requests events, and logout failures do not pretend to log out', async () => {
  const f = frontend();
  assert.equal(await f.run(`var calls=0; Calendar.render=()=>{}; API.getEvents=async()=>{calls++; return {events:[]}}; Calendar.today().then(()=>calls)`), 1);
  assert.equal(await f.run(`DP.user={id:'u'}; API.logout=async()=>{throw Error('offline')}; App.handleLogout().then(()=>DP.user.id)`), 'u');
});

test('stale event responses cannot overwrite newer navigation or logged-out state', async () => {
  const f = frontend();
  await f.run(`var pending=[]; API.getEvents=()=>new Promise(resolve=>pending.push(resolve)); var old=Calendar.fetchRange(); var latest=Calendar.fetchRange(); pending[1]({events:[{id:'new',start:'2026-09-24T09:00',end:'2026-09-24T10:00'}]}); latest;`);
  await f.run(`pending[0]({events:[{id:'old'}]}); old;`);
  assert.equal(f.run("DP.events.has('new') && !DP.events.has('old')"), true);
  await f.run(`var logoutRequest=Calendar.fetchRange(); App.showLogin(); pending[2]({events:[{id:'private'}]}); logoutRequest;`);
  assert.equal(f.run('DP.events.size'), 0);
});

test('day starts at 05:00 while month/year retain early morning tasks', () => {
  const f = frontend();
  f.run(`Calendar.init(); DP.date=new Date(2026,8,24); DP.events.set('e',{id:'e',title:'Night',color:'#00ff41',start:'2026-09-23T23:00',end:'2026-09-24T04:00'});`);
  assert.equal(f.run('Calendar.buildTasks(DP.date).count'), 0);
  assert.equal(f.run('Calendar.chipsForDay(DP.date).count'), 1);
  assert.match(f.run('Calendar.hourLabels()'), /top:0px">05:00/);
  const slots = f.run('Calendar.buildSlots(DP.date)');
  assert.equal((slots.match(/data-start=/g) || []).length, 48);
  assert.match(slots, /data-start="2026-09-24T05:00" style="top:0px/);
  assert.match(slots, /data-start="2026-09-24T23:30"/);
  assert.match(slots, /data-start="2026-09-25T04:30"/);
  assert.match(f.run('Calendar.hourLabels()'), /top:1380px">04:00/);
  f.run("DP.events.get('e').start='2026-09-25T00:00'; DP.events.get('e').end='2026-09-25T04:30'");
  assert.match(f.run('Calendar.buildTasks(DP.date).html'), /top:1140px;height:270px/);
  f.run("DP.events.get('e').start='2026-09-23T23:00'");
  f.run("DP.events.get('e').end='2026-09-24T06:00'");
  assert.match(f.run('Calendar.buildTasks(DP.date).html'), /top:0px;height:60px/);
  f.run("DP.events.get('e').start='2026-09-24T09:00'; DP.events.get('e').end='2026-09-24T10:00'");
  assert.match(f.run('Calendar.buildTasks(DP.date).html'), /top:240px;height:60px/);
  f.run('Calendar.renderYear()');
  assert.match(f.elements.get('calendar').innerHTML, /class="mini-day has-task[^"]*" data-date="2026-09-24T00:00"/);
  f.run("DP.events.get('e').start='2026-08-31T23:00'; DP.events.get('e').end='2026-09-01T01:00'");
  assert.equal(f.run('Calendar.countInMonth(2026,8)'), 1);
});

test('resizing a clipped event preserves its original hidden duration', () => {
  const f = frontend();
  const duration = f.run(`var saved; Calendar.commitMove=(id,start,end)=>saved={start,end}; DP.drag={id:'e',mode:'resize',origStart:new Date(2026,8,23,23).getTime(),origEnd:new Date(2026,8,24,1).getTime(),min:0,span:60,lastDelta:30}; Calendar.dragEnd(); (saved.end-saved.start)/60000`);
  assert.equal(duration, 150);
});

test('invalid dates are rejected without normalization', () => {
  const { parseISO } = require('../public/js/date');
  for (const date of ['2026-02-31T09:00', '2026-13-01', '2026-01-01T24:00', '2026-01-01junk']) assert.equal(parseISO(date), null);
  assert.ok(parseISO('2024-02-29T09:00:00'));
});

function backend() {
  const routes = new Map();
  const db = { users: [{id:'u', username:'test'}], sessions: [], events: [] };
  let saves = 0;
  const app = { use() {}, listen() {} }; // No server or port is opened.
  for (const method of ['get','post','put','delete']) app[method] = (url, ...handlers) => routes.set(method+' '+url, handlers.at(-1));
  const express = () => app; express.json = () => {}; express.static = () => {};
  const store = { getDB:()=>db, save:()=>saves++, uid:()=>String(db.events.length + 1), findUserById:id=>db.users.find(u=>u.id===id) };
  const context = vm.createContext({ __dirname:root, console, process:{env:{}},
    require(name) { if (name==='express') return express; if(name==='./store') return store; if(name==='bcryptjs') return {}; if(name.startsWith('./')) return require(path.join(root,name)); return require(name); }
  });
  vm.runInContext(read('server.js'), context);
  return { db, saves:()=>saves, call(method,url,body={},extra={}) {
    const response = { code:200, headers:{}, status(n) { this.code=n; return this; }, json(data) { this.data=data; return this; }, setHeader(k,v) {this.headers[k]=v;} };
    routes.get(method+' '+url)({body,user:db.users[0],params:{id:'1'},query:{},headers:{},...extra},response);
    return response;
  } };
}

test('API validates create/update and supports updating a single endpoint', () => {
  const b = backend();
  const event = {title:'Task', start:'2026-09-24T09:00', end:'2026-09-24T10:00',color:'#00ff41'};
  assert.equal(b.call('post','/api/events',event).code,201);
  assert.equal(b.call('put','/api/events/:id',{end:'2026-09-24T11:00'}).code,200);
  assert.match(b.db.events[0].end,/T11:00:00$/);
  const before=JSON.stringify(b.db.events[0]);
  for(const body of [{title:''},{title:' '},{color:'red" onclick="x'}, {start:null}, {start:'2026-02-31T09:00'}, {end:'2026-09-24T08:00'}]) {
    assert.equal(b.call('put','/api/events/:id',body).code,400);
    assert.equal(JSON.stringify(b.db.events[0]),before);
  }
  assert.equal(b.call('post','/api/events',{...event,start:'2026-02-31T09:00Z'}).code,400);
  assert.equal(b.call('post','/api/events',{...event,color:'0'}).code,400);
  assert.equal(b.call('get','/api/events',{}, {query:{from:'bad'}}).code,400);
});

test('logout expires cookie and malformed cookie does not crash', () => {
  const b=backend();
  const res=b.call('post','/api/auth/logout',{}, {headers:{cookie:'dp_session=%invalid'}});
  assert.equal(res.code,200);
  assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});

test('unreadable or structurally invalid databases are never overwritten', () => {
  for(const raw of ['{broken', '{}', '{"users":[],"sessions":[],"events":null}']) {
    let writes=0;
    const fakeFs={existsSync:()=>true, readFileSync:()=>raw, writeFileSync:()=>writes++, renameSync:()=>writes++};
    const context=vm.createContext({__dirname:root,process:{env:{}},console,module:{exports:{}},require:name=>name==='fs'?fakeFs:require(name)});
    vm.runInContext(read('store.js'),context);
    assert.throws(()=>context.module.exports.load(),/se conserva el archivo original/);
    assert.throws(()=>context.module.exports.save(),/no cargada/);
    assert.equal(writes,0);
  }
});

test('tags can be created, selected and saved with their color', () => {
  const f = frontend();
  f.run('Calendar.init(); App.bindTaskModal();');
  f.elements.get('tk-tag-name').value = 'Proyecto';
  f.elements.get('tk-tag-color').value = '#ff8800';
  f.run('Calendar.addTag()');
  assert.equal(f.run('Calendar.currentTag.name'), 'Proyecto');
  assert.equal(f.run('DP.currentColor'), '#ff8800');
  f.elements.get('tk-tag-name').value = 'proyecto';
  f.run('Calendar.addTag()');
  assert.equal(f.run('Calendar.tags.length'), 4);
  assert.match(f.elements.get('tk-tag-msg').textContent, /Ya existe/);
  f.run('App.openNewTask(new Date(2026,8,24,9))');
  assert.equal(f.run('Calendar.currentTag'), null);
  const b = backend();
  const tag = {id:'project',name:'Proyecto',color:'#ff8800'};
  const res = b.call('post','/api/events',{title:'Task',start:'2026-09-24T09:00',end:'2026-09-24T09:30',tag});
  assert.equal(res.code,201);
  assert.equal(res.data.event.tag.name,'Proyecto');
  assert.equal(res.data.event.color,tag.color);
  assert.equal(b.call('put','/api/events/:id',{tag:{...tag,color:'bad'}}).code,400);
  assert.equal(b.call('put','/api/events/:id',{tag:null,color:'#00ff41'}).data.event.tag,null);
});


test('registration form submits normal account details and returns to login', async () => {
  const f = frontend();
  f.run('Accounts.init(); var registered; API.register=async data=>{registered=data;return {user:{id:"new"}}}');
  for (const [id,value] of Object.entries({'rg-user':'newuser','rg-name':'New','rg-email':'new@example.com','rg-pass':'password-test','rg-confirm':'password-test'})) f.elements.get(id).value=value;
  const button={disabled:false};
  await f.elements.get('register-form').listeners.submit[0]({preventDefault(){},target:{querySelector:()=>button}});
  assert.equal(f.run('registered.username'),'newuser');
  assert.equal(f.elements.get('login-user').value,'newuser');
  assert.equal(button.disabled,false);
});

test('admin dashboard escapes account data and clears its list on logout', async () => {
  const f=frontend();
  await f.run('DP.user={id:"admin",role:"admin"}; API.adminUsers=async()=>({users:[{id:"u",username:"<script>",name:"Test",email:"",role:"user",eventCount:2}]}); Accounts.load()');
  assert.match(f.elements.get('admin-list').innerHTML,/&lt;script&gt;/);
  assert.ok(!f.elements.get('admin-list').innerHTML.includes('<script>'));
  f.run('App.showLogin()');
  assert.equal(f.run('Accounts.users.length'),0);
  assert.equal(f.elements.get('admin-list').innerHTML,'');
});
