const fs=require('fs'); 
const s=fs.readFileSync('src/app/tasktimer/tasktimer.css','utf8'); 
['.focusDialProgress','.focusCheckpointRing','.focusDialInner'].forEach(k=>{const i=s.indexOf(k); console.log('---'+k+'---'); console.log(i>=0 ? s.slice(i,i+240) : 'NOT_FOUND');}); 
