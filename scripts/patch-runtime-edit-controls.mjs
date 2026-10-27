import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

export function disableRuntimeEdit(runtime, original) {
  let patched;
  if (runtime === 'crowdsource') {
    const gate = /[\w$]+\["default"\]\.getObject\("appState\.user\.editor",!1,this\)(?=&&\(this\.checkedAdminPanel)/g;
    if ([...original.matchAll(gate)].length !== 1) throw new Error('Crowdsource admin eligibility must match exactly once');
    patched = original.replace(gate, '!1');
  } else {
    if (!['cascade', 'mapjournal', 'mapseries'].includes(runtime)) throw new Error('Unsupported runtime: ' + runtime);
    const marker = 'define("storymaps/' + (runtime === 'cascade' ? 'tpl/core' : 'common') + '/Core",';
    const start = original.indexOf(marker);
    if (start < 0 || original.indexOf(marker, start + marker.length) >= 0) {
      throw new Error(runtime + ' Core module must match exactly once');
    }
    const next = original.indexOf(',define(', start + marker.length);
    const end = next < 0 ? original.length : next;
    const module = original.slice(start, end);
    const exports = [...module.matchAll(/hasSwitchBuilderButton:([\w$]+)/g)];
    if (exports.length !== 1) throw new Error(runtime + ' Edit eligibility export must match exactly once');
    const name = exports[0][1].replace(/\$/g, '\\$');
    const gates = [...module.matchAll(new RegExp('function ' + name + '\\(\\)\\{([^{}]*)\\}', 'g'))];
    if (gates.length !== 1 || !/app\.userCanEdit|^return(?: false;?|!1;?)$/.test(gates[0][1])) {
      throw new Error('Unrecognized ' + runtime + ' Edit eligibility');
    }
    let patchedModule = module.replace(gates[0][0], 'function ' + exports[0][1] + '(){return false;}');
    if (runtime === 'mapjournal' && module.includes('app.ui.headerDesktop.init(')) {
      const call = new RegExp('(app\\.ui\\.headerDesktop\\.init\\([\\s\\S]*?,)' + name + '(\\))', 'g');
      const matches = [...patchedModule.matchAll(call)];
      if (matches.length > 1) throw new Error('Ambiguous Journal desktop header eligibility');
      patchedModule = patchedModule.replace(call, '$1' + exports[0][1] + '()$2');
    }
    patched = original.slice(0, start) + patchedModule + original.slice(end);
  }
  new vm.Script(patched);
  return patched;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [runtime, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: patch-runtime-edit-controls.mjs <runtime> <output>');
  const file = path.join(output, 'app', runtime === 'crowdsource' ? 'main-app.min.js' : 'viewer-min.js');
  writeFileSync(file, disableRuntimeEdit(runtime, readFileSync(file, 'utf8')));
}
