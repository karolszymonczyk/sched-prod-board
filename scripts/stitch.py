# Stitches screencast frames into an mp4 that keeps real time: python3 stitch.py <dir> <out.mp4>
import json, sys, subprocess, os
d, out = sys.argv[1], sys.argv[2]
meta = json.load(open(os.path.join(d, 'frames.json'))); fr = meta['frames']
lines = []
# Pad from t=0 with the first frame so video time == page time.
first = fr[0]
lines += [f"file 'frames/{first[0]}.jpg'", f"duration {first[1]/1000:.3f}"]
for i, (n, t) in enumerate(fr):
    nxt = fr[i+1][1] if i + 1 < len(fr) else meta['endMs']
    lines += [f"file 'frames/{n}.jpg'", f"duration {max(nxt - t, 1)/1000:.3f}"]
lines.append(f"file 'frames/{fr[-1][0]}.jpg'")
open(os.path.join(d, 'list.txt'), 'w').write('\n'.join(lines) + '\n')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(d, 'list.txt'),
  '-vf', 'fps=10,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', out], check=True)
print(out)
