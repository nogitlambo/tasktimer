const fs=require('fs'); 
const s=fs.readFileSync('src/app/tasktimer/tasktimer.css','utf8'); 
const i=s.indexOf('.focusDialControls'); console.log(s.slice(i,i+360)); 
