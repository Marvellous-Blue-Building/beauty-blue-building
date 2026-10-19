const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { createJiti } = require('jiti');
(async () => {
  const jiti = createJiti(__filename, { fsCache: false });
  const { lookImagePath } = await jiti.import(path.join(root, 'lib/scan/look-image.ts'));
  const loader = fs.readFileSync(path.join(root, 'public/widget-loader.js'), 'utf8');
  const widgetPath = vm.runInNewContext('(' + loader.match(/function lookImagePath\(value\) \{[\s\S]*?\n  \}/)[0] + ')', { URL });
  for (const resolve of [lookImagePath, widgetPath]) {
    for (const prefix of ['', 'http://localhost:3002', 'http://0.0.0.0:8080', 'https://web-811192538425.us-central1.run.app']) {
      const result = resolve(prefix + '/beauty/looks/long_soft_glam.jpg');
      assert.equal(result, '/beauty/looks/long_soft_glam.jpg');
      assert.equal(new URL(result, 'https://widget.example').href, 'https://widget.example/beauty/looks/long_soft_glam.jpg');
    }
    for (const value of [null, '', 'javascript:alert(1)', 'data:image/jpeg,x', '/other.jpg', '/beauty/looks/../../secret', '/beauty/looks/x.svg']) assert.equal(resolve(value), undefined);
    for (const file of fs.readdirSync(path.join(root, 'public/beauty/looks'))) assert.equal(resolve('/beauty/looks/' + file), '/beauty/looks/' + file);
  }
  console.log('Look images: app/widget parity, internal-origin repair, unsafe URLs and all packaged assets passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
