const fs=require('fs');  
const s=fs.readFileSync('src/app/tasktimer/tasktimerClient.ts','utf8');  
['computeTaskSharingMetrics','focusTrend7dMs','avgWeekMs','buildSharedTrendPolyline','getSharedFriendUidsForTask'].forEach(show);  
