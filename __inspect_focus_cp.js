const fs=require('fs');const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8');const i=s.indexOf('focusCheckpointLabelTitle');console.log(s.slice(i-1800,i+1200)); 
