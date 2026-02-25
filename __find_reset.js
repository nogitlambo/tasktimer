const fs=require('fs'); 
const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8'); 
['resetAllBtn','data-action=\"reset\"','function reset','resetTask(','resetTask ('].forEach(k=>{let i=s.indexOf(k); console.log(k,i); if(i>=0) console.log(s.slice(Math.max(0,i-250),i+450));}); 
