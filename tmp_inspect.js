const fs = require('fs'); 
const p = 'src/app/tasktimer/tasktimerClient.ts'; 
const s = fs.readFileSync(p,'utf8').split(/\r?\n/); 
const pats = ['function appendHistory','sessionColorForTaskMs(','ctx.fillStyle = e.color','function getModeColor','function taskModeOf']; 
for (const pat of pats) { 
  const i = s.findIndex(l => l.includes(pat)); 
  console.log('\nPATTERN:', pat, 'line', i + 1); 
  if (i >= 0) { 
    for (let j = Math.max(0, i - 8); j < Math.min(s.length, i + 18); j++) console.log(String(j + 1).padStart(5,' ') + ': ' + s[j]); 
  } 
} 
