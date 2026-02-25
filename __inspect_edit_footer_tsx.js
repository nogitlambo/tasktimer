const fs=require('fs');const s=fs.readFileSync('src/app/tasktimer/components/EditTaskOverlay.tsx','utf8'); const i=s.indexOf('footerBtns'); console.log(s.slice(i-260,i+260));  
