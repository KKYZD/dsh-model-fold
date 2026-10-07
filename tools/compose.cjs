const fs=require('fs'), path=require('path'), os=require('os');
const profile=path.join(os.homedir(),'.dsh','profiles','desktop');
const pkg=JSON.parse(fs.readFileSync(path.join(profile,'package.json'),'utf8'));
console.log('bundles in order:');
for(const b of pkg.dsh.profile.bundles){
  let dir;
  try{ dir=path.dirname(require.resolve(b+'/package.json',{paths:[profile]})); }
  catch(e){ console.log('  '+b+'  -> UNRESOLVED ('+e.code+')'); continue; }
  const bp=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
  const patch=bp.dsh&&bp.dsh.bundle&&bp.dsh.bundle.patch;
  const hasClient=!!(bp.dsh&&bp.dsh.client);
  console.log('  '+b+'  client='+hasClient+'  patch='+(patch?fs.existsSync(path.join(dir,patch)):'(none)'));
}
