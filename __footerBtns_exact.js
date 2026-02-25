const fs=require('fs');const s=fs.readFileSync('src/app/tasktimer/tasktimer.css','utf8'); const i=s.indexOf('.footerBtns'); console.log(s.slice(i,i+260));  
