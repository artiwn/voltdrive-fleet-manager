import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const pagesDir=join(root,'js/pages');
const files=readdirSync(pagesDir).filter(name=>name.endsWith('.js')).sort();
assert.equal(files.length,16,'expected 16 Fleet page controllers');
for(const file of files){
  const path=join(pagesDir,file);const source=readFileSync(path,'utf8');
  execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
  assert.match(source,/const access=initCommon\(\);[\s\S]{0,120}if\(!access\.denied\)\{/m,`${file} must stop before page logic when access is denied`);
}
const common=readFileSync(join(root,'js/layout/common.js'),'utf8');
execFileSync(process.execPath,['--check',join(root,'js/layout/common.js')],{stdio:'pipe'});
assert.match(common,/'billing\.html':\{[^\n]+scope:'all-depots'/,'Billing must require all-depot scope');
assert.match(common,/'fleet-plan\.html':\{[^\n]+scope:'all-depots'/,'Fleet Plan must require all-depot scope');
assert.match(common,/'fleet-settings\.html':\{[^\n]+scope:'all-depots'/,'Fleet Settings must require all-depot scope');
assert.match(common,/users:\[\{permission:'users\.manage'/,'user actions must use users.manage');
assert.match(common,/permission:'roles\.manage'/,'role actions must use roles.manage');
assert.match(common,/permission:'audit\.export'/,'audit export must use audit.export');
assert.match(common,/function ruleAllowed\(access,rule\)/,'navigation and direct route guard must share scope-aware ruleAllowed');
assert.match(common,/getPrototypeAccessDirectory\(\)/,'prototype identity switcher must use the full prototype user directory');
assert.doesNotMatch(common,/if\(!\(access\.can\('roles\.manage'\)&&access\.allDepots\)\)return;/,'prototype identity switcher must remain available after switching to a non-admin user');
console.log('OK: Fleet page guard smoke test passed.');
console.log('16 fail-closed page controllers · all-depot finance/settings guards · split Users/Roles/Audit actions · persistent prototype identity switcher');
