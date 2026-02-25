const fs=require('fs');const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8'); const i=s.indexOf('function renderCheckpointToast()'); console.log(s.slice(i,i+2600));  
