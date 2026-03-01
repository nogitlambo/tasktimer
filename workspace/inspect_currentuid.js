const fs=require('fs'); 
const t=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8'); 
const i=t.indexOf('currentUid'); 
console.log(i); 
console.log(t.substring(i-200,i+800)); 
