const fs=require('fs'); const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8'); const i=s.indexOf('function confirm('); console.log(s.slice(i,i+700));  
