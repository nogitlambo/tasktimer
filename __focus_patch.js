const fs=require('fs'); 
const p='src/app/tasktimer/tasktimer.css'; 
let s=fs.readFileSync(p,'utf8'); 
const k='.focusDialInner'; 
const i=s.indexOf(k); 
console.log('idx',i); 
console.log(s.slice(i,i+400)); 
