from pathlib import Path 
import sys 
p=Path(sys.argv[1]) 
start=int(sys.argv[2]);finish=int(sys.argv[3]) 
lines=p.read_text(encoding='utf-8').splitlines() 
for i in range(start,finish+1): print(f'{i}:{lines[i-1]}') 
