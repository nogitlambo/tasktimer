const fs=require('fs');const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8');const i=s.indexOf('const flagRadiusPx =');console.log(s.slice(i-220,i+420)); 
