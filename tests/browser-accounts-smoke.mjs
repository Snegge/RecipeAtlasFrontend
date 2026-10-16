// Optional real Chromium check. Node 24+, built backend, installed frontend dependencies.
// Usage: node tests/browser-accounts-smoke.mjs /absolute/backend/root [/path/to/chromium]
// Creates only disposable data; no external providers, credentials or browser profiles.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const backend = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass the backend root explicitly.');
const chromium = process.argv[3] ?? 'chromium';
const frontend = resolve(import.meta.dirname, '..');
const directory = await mkdtemp(join(tmpdir(), 'recipoke-browser-'));
const children = [], sockets = [], logs = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
const check = (value, label) => { assert(value, label); checks++; };
async function port() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function start(command, args, options = {}) {
  const log = await open(join(directory, `process-${children.length}.log`), 'w'); logs.push(log);
  const child = spawn(command, args, { cwd: frontend, stdio: ['ignore', log.fd, log.fd], ...options });
  children.push(child); return child;
}
async function waitFor(url, child) {
  for (let index = 0; index < 300; index++) {
    if (child.exitCode !== null) throw new Error('A test process exited before becoming ready.');
    try { const response = await fetch(url); if (response.ok) return await response.json().catch(() => null); } catch {}
    await delay(100);
  }
  throw new Error('Test server did not become ready.');
}
async function connect(url) {
  const ws = new WebSocket(url); sockets.push(ws);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  };
  return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const sequence = ++id;
    const timer = setTimeout(() => { pending.delete(sequence); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(sequence, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: sequence, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
try {
  const [apiPort, frontendPort, debugPort] = await Promise.all([port(), port(), port()]);
  const apiUrl = `http://127.0.0.1:${apiPort}`, origin = `http://127.0.0.1:${frontendPort}`;
  const password = randomBytes(24).toString('base64url');
  const environment = { ...process.env, DataDirectory: join(directory, 'data'), ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: apiUrl, Accounts__PublicAppUrl: origin, RecipeText__ApiKey: '' };
  const dll = join(backend, 'backend/RecipeAtlas.Api/bin/Debug/net10.0/Recipoke.Api.dll');
  const setup = spawnSync('dotnet', [dll, '--bootstrap-admin'], { cwd: backend, env: environment,
    input: `administrator\nAdministrator\n${password}\n`, encoding: 'utf8' });
  assert(setup.status === 0, 'Synthetic administrator bootstrap failed.');
  const api = await start('dotnet', [dll], { cwd: backend, env: environment });
  await waitFor(apiUrl + '/health', api);
  const proxy = join(directory, 'proxy.json');
  await writeFile(proxy, JSON.stringify({ '/api/**': { target: apiUrl, secure: false } }));
  const angular = await start(join(frontend, 'node_modules/.bin/ng'), ['serve', '--host', '127.0.0.1',
    '--port', String(frontendPort), '--proxy-config', proxy]);
  await waitFor(origin, angular);
  const chrome = await start(chromium, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${join(directory, 'chromium')}`, 'about:blank']);
  const version = await waitFor(`http://127.0.0.1:${debugPort}/json/version`, chrome);
  const cdp = await connect(version.webSocketDebuggerUrl);
  async function page(width) {
    const { browserContextId } = await cdp('Target.createBrowserContext');
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => cdp(method, params, sessionId);
    await call('Page.enable'); await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width < 600 });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error('Browser expression failed: ' + result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let index = 0; index < 200; index++) { if (await evaluate(expression)) return; await delay(50); }
      // Never print HTML/URLs: an invitation/password may be present.
      throw new Error('Browser condition not satisfied: ' + expression.slice(0, 120));
    };
    const go = async path => { await call('Page.navigate', { url: origin + path }); await wait('!!document.querySelector("app-root")'); };
    const fill = async (selector, value) => evaluate(`(() => {const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const click = async text => evaluate(`(() => {const button=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing control');button.click();})()`);
    const api = async (path, method = 'GET', body) => evaluate(`fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'X-RecipeAtlas':'1','Content-Type':'application/json'},${body ? 'body:'+JSON.stringify(JSON.stringify(body))+',' : ''}}).then(async r=>{if(!r.ok)throw Error('API failed');return r.status===204?null:r.json();})`);
    const fit = async label => {
      await delay(100);
      check(await evaluate('document.documentElement.scrollWidth <= innerWidth'), label + ' horizontal layout');
    };
    return { evaluate, wait, go, fill, click, api, fit, resize: async width => call('Emulation.setDeviceMetricsOverride', {width,height:850,deviceScaleFactor:1,mobile:width<600}) };
  }
  const admin = await page(1280), recipient = await page(320);
  async function login(page, username) {
    await page.go('/login'); await page.wait('!!document.querySelector("input[formcontrolname=username]")');
    await page.fill('input[formcontrolname=username]', username);
    await page.fill('input[formcontrolname=password]', password); await page.click('Sign in');
    await page.wait('document.querySelector("h1")?.textContent.includes("Your cookbooks")');
  }
  await login(admin, 'administrator');
  const [book] = await admin.api('/api/cookbooks');
  await admin.go('/admin'); await admin.wait('!!document.querySelector("app-account-admin")');
  await admin.click('Create invitation'); await admin.wait('!!document.querySelector(".link-value")');
  const link = await admin.evaluate('document.querySelector(".link-value").value');
  check(link.startsWith(origin + '/invite#token='), 'Trusted invitation origin');
  await admin.click('Dismiss link');
  await recipient.go(link.slice(origin.length));
  await recipient.wait('!!document.querySelector("input[formcontrolname=displayName]")');
  check(await recipient.evaluate('location.hash === ""'), 'Invitation fragment removed');
  await recipient.fit('320px invitation');
  await recipient.fill('input[formcontrolname=username]', 'invited-reader');
  await recipient.fill('input[formcontrolname=displayName]', 'Invited Reader');
  await recipient.fill('input[formcontrolname=password]', password); await recipient.click('Create account');
  await recipient.wait('document.body.textContent.includes("personal cookbook are ready")');
  await login(recipient, 'invited-reader'); await recipient.fit('320px cookbook overview');
  check(!await recipient.evaluate('!!document.querySelector("a[href=\\"/admin\\"]")'), 'Ordinary account has no administration navigation');
  await admin.go(`/cookbooks/${book.id}/settings`);
  await admin.wait('!!document.querySelector("input[formcontrolname=username]")');
  await admin.fill('input[formcontrolname=name]', 'Shared browser cookbook');
  await admin.click('Save name');
  await admin.wait('document.body.textContent.includes("Cookbook updated.")');
  check((await admin.api(`/api/cookbooks/${book.id}`)).name === 'Shared browser cookbook', 'Owner can rename cookbook');
  await admin.fill('input[formcontrolname=username]', 'invited-reader'); await admin.click('Add member');
  await admin.wait('document.querySelectorAll("article").length===2');
  await recipient.go(`/cookbooks/${book.id}/recipes`); await recipient.wait('!!document.querySelector("app-recipe-list")');
  check(!await recipient.evaluate('!!document.querySelector(".add-recipe,.import-recipe")'), 'Viewer controls are read-only');
  await recipient.fit('320px shared recipes');
  await admin.click('Make Editor'); await admin.wait('document.body.textContent.includes("Make Viewer")');
  await recipient.go(`/cookbooks/${book.id}/recipes`); await recipient.wait('!!document.querySelector(".add-recipe")');
  const payload = JSON.parse(await readFile(join(backend, 'sample-recipe.json'), 'utf8'));
  const recipe = await recipient.api(`/api/cookbooks/${book.id}/recipes`, 'POST', payload);
  await recipient.go(`/cookbooks/${book.id}/recipes/${recipe.id}/edit`);
  await recipient.wait('!!document.querySelector("input[formcontrolname=title]")');
  await recipient.fill('input[formcontrolname=title]', 'Keep this unsaved edit');
  await recipient.fit('320px existing recipe editor');
  await admin.click('Make Viewer'); await admin.wait('document.body.textContent.includes("Make Editor")');
  await recipient.evaluate('document.querySelector("button[type=submit]").click()');
  await recipient.wait('document.body.textContent.includes("unsaved edits are still here")');
  check(await recipient.evaluate('document.querySelector("input[formcontrolname=title]").value === "Keep this unsaved edit"'), 'Denied save preserves input');
  check(await recipient.evaluate('document.querySelector("button[type=submit]").disabled'), 'Denied save is visibly blocked');
  check((await recipient.api(`/api/cookbooks/${book.id}/recipes/${recipe.id}`)).title === payload.title, 'Denied save did not persist');
  await recipient.click('Cookbooks'); await recipient.wait('document.body.textContent.includes("Discard your changes?")');
  await recipient.click('Discard changes'); await recipient.wait('!!document.querySelector("app-cookbook-overview")');
  await recipient.click('Sign out'); await recipient.wait('!!document.querySelector("app-login")');
  check(!await recipient.evaluate('!!document.querySelector("nav[aria-label=\\"Account navigation\\"]")'), 'Logout clears private navigation');
  await admin.go(`/cookbooks/${book.id}/settings`); await admin.wait('document.querySelectorAll("article").length===2');
  await admin.fit('1280px owner settings');
  await admin.resize(320); await admin.fit('320px owner settings');
  await admin.go('/admin'); await admin.wait('document.body.textContent.includes("Deactivate account")');
  await admin.fit('320px account administration');
  await admin.click('Deactivate account'); await admin.wait('document.body.textContent.includes("Reactivate account")');
  await recipient.fill('input[formcontrolname=username]', 'invited-reader');
  await recipient.fill('input[formcontrolname=password]', password); await recipient.click('Sign in');
  await recipient.wait('document.body.textContent.includes("not correct")');
  check(true,'Deactivated account cannot sign in through UI');
  await admin.click('Reactivate account');await admin.wait('document.body.textContent.includes("Deactivate account")');
  await login(recipient,'invited-reader');
  await recipient.go('/account');await recipient.wait('!!document.querySelector("input[formcontrolname=currentPassword]")');
  await recipient.fit('320px password settings');
  await recipient.fill('input[formcontrolname=currentPassword]',password);
  await recipient.fill('input[formcontrolname=newPassword]',password+'.changed');
  await recipient.click('Change password');await recipient.wait('document.body.textContent.includes("Other sessions have been signed out")');
  check(true,'Current-password change works through UI');
  await admin.click('Create invitation');await admin.wait('!!document.querySelector(".link-value")');
  const revokedLink=await admin.evaluate('document.querySelector(".link-value").value');
  await admin.click('Dismiss link');await admin.click('Revoke invitation');
  await admin.wait('document.body.textContent.includes("Revoked")');
  await recipient.go(revokedLink.slice(origin.length));await recipient.wait('document.body.textContent.includes("invitation is revoked")');
  check(!await recipient.evaluate('!!document.querySelector("input[formcontrolname=password]")'),'Revoked invitation has no submission form');
  await admin.go('/cookbooks');await admin.wait('!!document.querySelector("input[formcontrolname=name]")');
  await admin.fill('input[formcontrolname=name]','Browser created cookbook');await admin.click('Create cookbook');
  await admin.wait('document.querySelector("app-recipe-list")?.textContent.includes("Browser created cookbook")');
  check((await admin.api('/api/cookbooks')).some(item=>item.name==='Browser created cookbook'&&item.role==='Owner'),'Cookbook creation navigates to the owned collection');
  console.log(`Passed ${checks} real Chromium account/sharing/editor/layout checks at 320px and 1280px.`);
} finally {
  for (const socket of sockets) socket.close();
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
      if (child.exitCode === null) {child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));}
    }
  }
  for (const log of logs) await log.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
