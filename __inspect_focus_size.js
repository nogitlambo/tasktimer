const fs=require('fs'); 
const s=fs.readFileSync('src/app/tasktimer/tasktimer.css','utf8'); 
['.focusDialWrap','.focusDial{','.focusDialShell','.focusDialPanel'].forEach(k=>{const i=s.indexOf(k); if(i>=0){console.log('---'+k+'---'); console.log(s.slice(i,i+320));}}); 
