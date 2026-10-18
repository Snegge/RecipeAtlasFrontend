// Optional real Chromium check. Node 24+, built backend, installed frontend dependencies.
// Usage: node tests/browser-accounts-smoke.mjs /absolute/backend/root [/path/to/chromium]
// Creates only disposable data; no external providers, credentials or browser profiles.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, open, mkdir } from 'node:fs/promises';
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
const children = [],
  sockets = [],
  logs = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let checks = 0;
const check = (value, label) => {
  assert(value, label);
  checks++;
};
async function port() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function start(command, args, options = {}) {
  const log = await open(join(directory, `process-${children.length}.log`), 'w');
  logs.push(log);
  const child = spawn(command, args, {
    cwd: frontend,
    stdio: ['ignore', log.fd, log.fd],
    ...options,
  });
  children.push(child);
  return child;
}
async function waitFor(url, child) {
  for (let index = 0; index < 300; index++) {
    if (child.exitCode !== null) throw new Error('A test process exited before becoming ready.');
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json().catch(() => null);
    } catch {}
    await delay(100);
  }
  throw new Error('Test server did not become ready.');
}
async function connect(url) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data),
      request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const sequence = ++id;
      const timer = setTimeout(() => {
        pending.delete(sequence);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(sequence, { resolve, reject, timer });
      ws.send(
        JSON.stringify({ id: sequence, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
}
try {
  const [apiPort, frontendPort, debugPort] = await Promise.all([port(), port(), port()]);
  const apiUrl = `http://127.0.0.1:${apiPort}`,
    origin = `http://127.0.0.1:${frontendPort}`;
  const password = randomBytes(24).toString('base64url');
  const environment = {
    ...process.env,
    DataDirectory: join(directory, 'data'),
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: apiUrl,
    Accounts__PublicAppUrl: origin,
    RecipeText__ApiKey: '',
  };
  const dll = join(backend, 'backend/RecipeAtlas.Api/bin/Debug/net10.0/Recipoke.Api.dll');
  const setup = spawnSync('dotnet', [dll, '--bootstrap-admin'], {
    cwd: backend,
    env: environment,
    input: `administrator\nAdministrator\n${password}\n`,
    encoding: 'utf8',
  });
  assert(setup.status === 0, 'Synthetic administrator bootstrap failed.');
  const api = await start('dotnet', [dll], { cwd: backend, env: environment });
  await waitFor(apiUrl + '/health', api);
  const proxy = join(directory, 'proxy.json');
  await writeFile(proxy, JSON.stringify({ '/api/**': { target: apiUrl, secure: false } }));
  const angular = await start(join(frontend, 'node_modules/.bin/ng'), [
    'serve',
    '--host',
    '127.0.0.1',
    '--port',
    String(frontendPort),
    '--proxy-config',
    proxy,
  ]);
  await waitFor(origin, angular);
  const chrome = await start(chromium, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${join(directory, 'chromium')}`,
    'about:blank',
  ]);
  const version = await waitFor(`http://127.0.0.1:${debugPort}/json/version`, chrome);
  const cdp = await connect(version.webSocketDebuggerUrl);
  async function page(width) {
    const { browserContextId } = await cdp('Target.createBrowserContext');
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => cdp(method, params, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 850,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    const evaluate = async (expression) => {
      const result = await call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw new Error('Browser expression failed: ' + result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (expression) => {
      for (let index = 0; index < 200; index++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      // Never print HTML/URLs: an invitation/password may be present.
      throw new Error('Browser condition not satisfied: ' + expression.slice(0, 120));
    };
    const go = async (path) => {
      await call('Page.navigate', { url: origin + path });
      await wait('!!document.querySelector("app-root")');
    };
    const fill = async (selector, value) =>
      evaluate(
        `(() => {const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    const activate = async (kind, value) => {
      await delay(180);
      const point = await evaluate(
        `(async()=>{for(let attempt=0;attempt<200;attempt++){const scope=document.querySelector('mat-dialog-container')??document.querySelector('mat-sidenav.mat-drawer-opened')??document;const el=[...scope.querySelectorAll('button,a')].find(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&(${JSON.stringify(kind)}==='aria'?el.getAttribute('aria-label')===${JSON.stringify(value)}:el.textContent.trim()===${JSON.stringify(value)}));if(!el||el.disabled){await new Promise(resolve=>setTimeout(resolve,50));continue;}const initial=el.getBoundingClientRect();if(initial.top<0||initial.bottom>innerHeight){el.scrollIntoView({block:'center'});await new Promise(resolve=>setTimeout(resolve,180));}const r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(!el.contains(document.elementFromPoint(x,y))){await new Promise(resolve=>setTimeout(resolve,50));continue;}return {x,y};}throw Error('Missing visible control');})()`,
      );
      await call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        clickCount: 1,
        ...point,
      });
      await call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        clickCount: 1,
        ...point,
      });
    };
    const click = async (text) => activate('text', text);
    const api = async (path, method = 'GET', body) =>
      evaluate(
        `fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'X-RecipeAtlas':'1','Content-Type':'application/json'},${body ? 'body:' + JSON.stringify(JSON.stringify(body)) + ',' : ''}}).then(async r=>{if(!r.ok)throw Error('API failed');return r.status===204?null:r.json();})`,
      );
    const fit = async (label) => {
      await delay(100);
      check(
        await evaluate('document.documentElement.scrollWidth <= innerWidth'),
        label + ' horizontal layout',
      );
      const iconLayout = await evaluate(`(() => {
          const buttons = [...document.querySelectorAll('.mat-mdc-icon-button')].filter(button => {
            const rect = button.getBoundingClientRect();
            return button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden' &&
              rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth;
          });
          return {count: buttons.length, failures: buttons.flatMap(button => {
            const icon = button.querySelector('mat-icon');
            if (!icon?.querySelector('svg')) return [{classes: button.className, missingSvg: true}];
            const a = button.getBoundingClientRect(), b = icon.getBoundingClientRect();
            const dy = a.top + a.height / 2 - b.top - b.height / 2;
            const dx = a.left + a.width / 2 - b.left - b.width / 2;
            return Math.abs(dy) <= 1 && Math.abs(dx) <= 1 ? [] : [{classes: button.className, dx, dy}];
          })};
        })()`);
      check(
        iconLayout.count > 0 && !iconLayout.failures.length,
        label + ' centered Material icon buttons: ' + JSON.stringify(iconLayout),
      );
    };
    const clickAria = async (label) => activate('aria', label);
    const screenshot = async (name) => {
      if (process.env.RECIPOKE_SCREENSHOTS) {
        await evaluate('window.scrollTo(0,0)');
        await delay(350);
        await mkdir(process.env.RECIPOKE_SCREENSHOTS, { recursive: true });
        const result = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(
          join(process.env.RECIPOKE_SCREENSHOTS, name + '.png'),
          Buffer.from(result.data, 'base64'),
        );
      }
    };
    const file = async (selector, path) => {
      const { root } = await call('DOM.getDocument');
      const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector });
      await call('DOM.setFileInputFiles', { nodeId, files: [path] });
    };
    const escape = async () => {
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      });
      await call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      });
    };
    return {
      evaluate,
      wait,
      go,
      fill,
      click,
      clickAria,
      screenshot,
      file,
      escape,
      api,
      fit,
      resize: async (width) =>
        call('Emulation.setDeviceMetricsOverride', {
          width,
          height: 850,
          deviceScaleFactor: 1,
          mobile: width < 600,
        }),
    };
  }
  const admin = await page(1280),
    recipient = await page(320);
  async function login(page, username) {
    await page.go('/login');
    await page.wait('!!document.querySelector("input[formcontrolname=username]")');
    await page.fill('input[formcontrolname=username]', username);
    await page.fill('input[formcontrolname=password]', password);
    await page.click('Sign in');
    await page.wait('document.querySelector("h1")?.textContent.includes("Your cookbooks")');
  }

  await login(admin, 'administrator');
  const [book] = await admin.api('/api/cookbooks');
  const png = join(directory, 'picture.png');
  await writeFile(
    png,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  await admin.go('/account');
  await admin.wait('!!document.querySelector("input[formcontrolname=displayName]")');
  await admin.fill('input[formcontrolname=displayName]', 'Kitchen Admin');
  await admin.fill('input[formcontrolname=email]', 'admin@example.test');
  await admin.file('app-account-settings input[type=file]', png);
  await admin.wait('!!document.querySelector(".profile-identity img")');
  await admin.click('Save profile');
  await admin.wait('document.body.textContent.includes("Profile updated.")');
  check((await admin.api('/api/auth/me')).avatarUrl, 'Profile picture saved');
  await admin.go('/admin');
  await admin.wait('!!document.querySelector("app-account-admin")');
  await admin.click('Invitations');
  await admin.click('Create invitation');
  await admin.wait('!!document.querySelector(".link-value")');
  const link = await admin.evaluate('document.querySelector(".link-value").value');
  check(link.startsWith(origin + '/invite#token='), 'Trusted invitation origin');
  await admin.click('Dismiss link');
  await recipient.go(link.slice(origin.length));
  await recipient.wait('!!document.querySelector("input[formcontrolname=displayName]")');
  check(await recipient.evaluate('location.hash === ""'), 'Invitation fragment removed');
  await recipient.fit('320px invitation');
  await recipient.fill('input[formcontrolname=username]', 'invited-reader');
  await recipient.fill('input[formcontrolname=displayName]', 'Invited Reader');
  await recipient.fill('input[formcontrolname=email]', 'reader@example.test');
  await recipient.fill('input[formcontrolname=password]', password);
  await recipient.click('Create account');
  await recipient.wait('document.body.textContent.includes("personal cookbook are ready")');
  await login(recipient, 'invited-reader');
  check(
    (await recipient.evaluate(`fetch('/api/cookbook-invitations').then(r => r.status)`)) === 200,
    'Invitation endpoint is available through the frontend proxy',
  );
  await recipient.fit('320px cookbook shelf');
  check(
    await recipient.evaluate(
      'getComputedStyle(document.querySelector(".cookbook-grid")).gridTemplateColumns.split(" ").length===2',
    ),
    'Two cookbook columns on mobile',
  );
  check(
    !(await recipient.evaluate('!!document.querySelector(".mobile-back")')),
    'No back button on Cookbooks',
  );
  await recipient.clickAria('Open menu');
  await recipient.wait(
    'document.querySelector("mat-sidenav")?.classList.contains("mat-drawer-opened")',
  );
  check(
    await recipient.evaluate('!!document.querySelector("mat-sidenav .brand")'),
    'Drawer owns the logo and app name',
  );
  check(
    !(await recipient.evaluate(`!!document.querySelector('a[href="/admin"]')`)),
    'Ordinary user has no Accounts Manager',
  );
  await recipient.screenshot('mobile-drawer');
  await recipient.escape();
  await recipient.wait(
    '!document.querySelector("mat-sidenav")?.classList.contains("mat-drawer-opened")',
  );
  await admin.go(`/cookbooks/${book.id}/settings`);
  await admin.wait('!!document.querySelector("input[formcontrolname=username]")');
  await admin.fill('input[formcontrolname=name]', 'Shared browser cookbook');
  await admin.fill('textarea[formcontrolname=description]', 'Recipes for the whole table.');
  await admin.click('Save cookbook');
  await admin.wait('document.body.textContent.includes("Cookbook saved.")');
  await admin.fill('input[formcontrolname=username]', 'invited-reader');
  await admin.click('Send invitation');
  await admin.wait('document.body.textContent.includes("Invitation pending")');
  check(
    (await admin.api(`/api/cookbooks/${book.id}/members`)).some(
      (member) => member.username === 'invited-reader' && member.isPending,
    ),
    'Member POST creates a pending invitation rather than an accepted membership',
  );
  check(
    (await recipient.evaluate(`fetch('/api/cookbooks/${book.id}').then(r=>r.status)`)) === 404,
    'Pending invitation grants no cookbook access',
  );
  await recipient.go('/cookbooks');
  await recipient.wait('document.querySelectorAll(".cookbook-invitation").length===1');
  await recipient.clickAria('Accept invitation to Shared browser cookbook');
  await recipient.wait('document.querySelectorAll(".cookbook-card").length===2');
  check(
    !(await recipient.evaluate('!!document.querySelector(".invitation-panel")')),
    'Empty inbox disappears after acceptance',
  );
  await recipient.screenshot('mobile-cookbooks');
  await recipient.go(`/cookbooks/${book.id}/recipes`);
  await recipient.wait('!!document.querySelector("app-recipe-list")');
  check(
    !(await recipient.evaluate('!!document.querySelector(".add-recipe,.import-recipe")')),
    'Viewer recipe controls are read-only',
  );
  check(
    await recipient.evaluate('!!document.querySelector(".mobile-back")'),
    'Back button on recipe page',
  );
  await admin.go(`/cookbooks/${book.id}/settings`);
  await admin.wait(
    'document.querySelectorAll(".member-row").length===2&&!document.querySelector(".pending-badge")',
  );
  await admin.clickAria('Manage Invited Reader');
  await admin.click('Make Editor');
  await admin.wait('document.querySelector(".members-card")?.textContent.includes("Editor")');
  await recipient.go(`/cookbooks/${book.id}/recipes`);
  await recipient.wait('!!document.querySelector(".add-recipe")');
  check(
    !(await recipient.evaluate('!!document.querySelector(".import-recipe")')),
    'Recipe list has one primary action',
  );
  check(
    await recipient.evaluate(
      'Math.abs(document.querySelector(".add-recipe").getBoundingClientRect().bottom-innerHeight)<2',
    ),
    'Add recipe is flush with mobile viewport bottom',
  );
  await recipient.click('Add recipe');
  await recipient.wait('!!document.querySelector(".new-recipe-import")');
  await recipient.click('Import recipe');
  await recipient.wait('!!document.querySelector("mat-dialog-container")');
  check(
    await recipient.evaluate('!!document.querySelector("app-recipe-import-dialog")'),
    'Import is available inside new recipe page',
  );
  await recipient.escape();
  await recipient.wait('!document.querySelector("mat-dialog-container")');
  const payload = JSON.parse(await readFile(join(backend, 'sample-recipe.json'), 'utf8'));
  const recipe = await recipient.api(`/api/cookbooks/${book.id}/recipes`, 'POST', payload);
  await recipient.go(`/cookbooks/${book.id}/recipes/${recipe.id}/edit`);
  await recipient.wait('!!document.querySelector("input[formcontrolname=title]")');
  await recipient.fill('input[formcontrolname=title]', 'Keep this unsaved edit');
  await recipient.fit('320px recipe editor');
  await admin.clickAria('Manage Invited Reader');
  await admin.click('Make Viewer');
  await admin.wait('!document.querySelector(".member-copy p")?.textContent.includes("Editor")');
  await recipient.evaluate('document.querySelector("button[type=submit]").click()');
  await recipient.wait('document.body.textContent.includes("unsaved edits are still here")');
  check(
    await recipient.evaluate(
      'document.querySelector("input[formcontrolname=title]").value === "Keep this unsaved edit"',
    ),
    'Denied save preserves input',
  );
  await recipient.clickAria('Go back');
  await recipient.wait('document.body.textContent.includes("Discard your changes?")');
  await recipient.click('Discard changes');
  await recipient.wait('!!document.querySelector("app-recipe-detail")');
  await recipient.clickAria('Open menu');
  await recipient.click('Account');
  await recipient.wait('!!document.querySelector("app-account-settings")');
  await recipient.fit('320px account');
  await recipient.fill('input[formcontrolname=displayName]', 'Recipe Reader');
  await recipient.click('Save profile');
  await recipient.wait('document.body.textContent.includes("Profile updated.")');
  await recipient.screenshot('mobile-account');
  await recipient.fill('input[formcontrolname=currentPassword]', password);
  await recipient.fill('input[formcontrolname=newPassword]', password + '.changed');
  await recipient.click('Change password');
  await recipient.wait('document.body.textContent.includes("Other sessions have been signed out")');
  check(true, 'Password change works');
  await recipient.clickAria('Open menu');
  await recipient.click('Settings');
  await recipient.wait('!!document.querySelector("app-settings")');
  check(
    await recipient.evaluate('document.body.textContent.includes("There are no app settings yet")'),
    'Settings placeholder has no invented controls',
  );
  await recipient.clickAria('Go back');
  await recipient.wait('!!document.querySelector("app-cookbook-overview")');
  await recipient.clickAria('Open menu');
  await recipient.click('Sign out');
  await recipient.wait('!!document.querySelector("app-login")');
  check(
    !(await recipient.evaluate('!!document.querySelector(".desktop-navigation")')),
    'Logout clears private navigation',
  );
  await admin.go('/admin');
  await admin.wait('document.body.textContent.includes("Deactivate account")');
  await admin.resize(320);
  await admin.fit('320px Accounts Manager');
  await admin.screenshot('mobile-admin');
  await admin.click('Deactivate account');
  await admin.wait('document.body.textContent.includes("Reactivate account")');
  await admin.click('Reactivate account');
  await admin.wait('document.body.textContent.includes("Deactivate account")');
  check(true, 'Administrator lifecycle actions work on mobile');
  await admin.go('/cookbooks');
  await admin.wait('!!document.querySelector(".sticky-create")');
  check(
    await admin.evaluate(
      'Math.abs(document.querySelector(".sticky-create").getBoundingClientRect().bottom-innerHeight)<2',
    ),
    'Create cookbook is flush with bottom',
  );
  await admin.click('Create cookbook');
  await admin.wait('!!document.querySelector("app-cookbook-editor")');
  await admin.fill('input[formcontrolname=name]', 'Browser created cookbook');
  await admin.fill('textarea[formcontrolname=description]', 'A new collection.');
  await admin.file('app-cookbook-editor input[type=file]', png);
  await admin.wait('!!document.querySelector(".cover-picker>img")');
  await admin.fill('input[formcontrolname=username]', 'invited-reader');
  await admin.click('Add to list');
  await admin.fit('320px cookbook creation');
  await admin.screenshot('mobile-create-cookbook');
  await admin.click('Create cookbook');
  await admin.wait(
    'document.querySelector("app-recipe-list")?.textContent.includes("Browser created cookbook")',
  );
  const created = (await admin.api('/api/cookbooks')).find(
    (x) => x.name === 'Browser created cookbook',
  );
  check(created?.imageUrl, 'Cookbook cover saved');
  // Destructive action requires a distinct dialog, and cancelling sends no deletion.
  await admin.go('/cookbooks');
  await admin.wait('document.querySelectorAll(".cookbook-card").length===2');
  await admin.clickAria('Actions for Browser created cookbook');
  await admin.click('Delete cookbook');
  await admin.wait(
    'document.querySelector("mat-dialog-container")?.textContent.includes("permanently deletes")',
  );
  check(
    await admin.evaluate(
      'document.querySelector("mat-dialog-container").textContent.includes("permanently deletes")',
    ),
    'Deletion warning explains its scope',
  );
  await admin.escape();
  await admin.wait('!document.querySelector("mat-dialog-container")');
  check(
    (await admin.api('/api/cookbooks')).some((x) => x.id === created.id),
    'Cancelling deletion preserves cookbook',
  );
  await admin.clickAria('Actions for Browser created cookbook');
  await admin.click('Delete cookbook');
  await admin.wait('!!document.querySelector("mat-dialog-container")');
  await admin.click('Delete cookbook');
  await admin.wait('document.querySelectorAll(".cookbook-card").length===1');
  check(
    !(await admin.api('/api/cookbooks')).some((x) => x.id === created.id),
    'Confirmed deletion removes cookbook',
  );
  for (let i = 0; i < 3; i++)
    await admin.api('/api/cookbooks', 'POST', {
      name: ['Weeknight favourites', 'Weekend baking', 'Family recipes'][i],
      description: 'A collection to come back to.',
    });
  await admin.go('/cookbooks');
  await admin.wait('document.querySelectorAll(".cookbook-card").length===4');
  await admin.screenshot('mobile-shelf');
  await admin.resize(390);
  await admin.fit('390px shelf');
  check(
    await admin.evaluate(
      'getComputedStyle(document.querySelector(".cookbook-grid")).gridTemplateColumns.split(" ").length===2',
    ),
    'Shelf retains two columns at 390px',
  );
  await admin.resize(1280);
  await admin.fit('1280px shelf');
  await admin.screenshot('desktop-shelf');
  check(
    await admin.evaluate(
      'getComputedStyle(document.querySelector(".desktop-navigation")).display !== "none"',
    ),
    'Desktop navigation visible',
  );
  await admin.go(`/cookbooks/${book.id}/settings`);
  await admin.wait('!!document.querySelector(".members-card")');
  check(
    await admin.evaluate(`(() => {
      const fields = document.querySelectorAll('.member-invite-form mat-form-field');
      return fields[1].getBoundingClientRect().top - fields[0].getBoundingClientRect().bottom >= 15;
    })()`),
    'Member fields retain explicit vertical spacing',
  );
  check(
    !(await admin.evaluate('document.body.textContent.includes("What belongs in this cookbook?")')),
    'Cookbook description has no redundant hint',
  );
  await admin.fit('1280px cookbook settings');
  await admin.screenshot('desktop-cookbook-settings');
  console.log(
    `Passed ${checks} real Chromium navigation, consent, profile, creation, deletion, import-entry and layout checks at 320px, 390px and 1280px.`,
  );
} finally {
  for (const socket of sockets) socket.close();
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5000)]);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await new Promise((resolve) => child.once('exit', resolve));
      }
    }
  }
  for (const log of logs) await log.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
