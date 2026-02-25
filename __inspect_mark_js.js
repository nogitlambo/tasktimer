const fs=require('fs');const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8');const i=s.indexOf('focusCheckpointMark');console.log(s.slice(i-500,i+500)); 
