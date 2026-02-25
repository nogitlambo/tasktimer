const fs=require('fs'); 
const s=fs.readFileSync('src/app/tasktimer/page.tsx','utf8'); 
['Focus Mode','focusModeBackBtn','focusStopBtn','focusStartBtn'].forEach(k=>{const i=s.indexOf(k); console.log(k, i); if(i>=0) console.log(s.slice(Math.max(0,i-260), i+420));}); 
