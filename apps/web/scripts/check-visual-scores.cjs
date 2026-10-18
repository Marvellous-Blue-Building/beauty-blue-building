// Run from apps/web: node scripts/check-visual-scores.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { alias: { '@': root }, fsCache: false });
(async () => {
  const { visualScore } = await jiti.import(path.join(root, 'lib/scan/measurement-copy.ts'));
  const loader = fs.readFileSync(path.join(root, 'public/widget-loader.js'), 'utf8');
  const widgetScore = vm.runInNewContext('(' + loader.match(/function visualScore\(reading\) \{[\s\S]*?\n      \}/)[0] + ')');
  const base = { key: 'cheek_roughness', value: 2.35, unit: 'log_contrast', status: 'measured', reason: null, source: 'front', samplePixels: 1600, coverage: .8 };
  for (const score of [visualScore, widgetScore]) {
    assert.equal(score(base), 70);
    assert.equal(score({ ...base, value: 0 }), 99); // Real zero is distinct from absent data.
    assert.equal(score({ ...base, value: 1.2 }), 95);
    assert.equal(score({ ...base, value: 3.5 }), 45);
    for (const patch of [{ value: null }, { value: undefined }, { value: '0' }, { value: NaN }, { value: Infinity }, { value: -1 }, { status: 'unavailable', value: 0 }, { reason: 'overexposed' }, { samplePixels: 0 }, { samplePixels: NaN }, { coverage: .49 }, { coverage: 1.01 }, { coverage: null }, { unit: 'unknown' }, { source: 'side' }, { key: 'hydration' }]) {
      assert.equal(score({ ...base, ...patch }), null, JSON.stringify(patch));
    }
  }
  for (const key of ['cheek_roughness', 'fine_lines', 'tone_spots', 'cheek_texture', 'nose_pores']) {
    for (const value of [0, .1, 1.2, 2.35, 5, 12, 100]) {
      assert.equal(widgetScore({ ...base, key, value }), visualScore({ ...base, key, value }));
    }
  }
  console.log('Visual scores: missing/invalid data, scale anchors and widget/app parity passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
