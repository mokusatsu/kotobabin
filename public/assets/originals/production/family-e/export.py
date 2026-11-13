from pathlib import Path
from PIL import Image
import subprocess
ids={'stamp_e01': '84c2fa9f-af21-465f-8f5b-9b346e6d94f6', 'stamp_e02': '919028a3-a813-43fb-b044-093426e43998', 'stamp_e03': '36d12542-13cd-4c1f-b943-58edca96a0df', 'stamp_e04': '2bbca8b4-b285-4f34-9edb-80efbcad1a59', 'stamp_e05': 'e8f7e724-582d-43ee-9a5d-1d827909705d', 'stamp_e06': '1ed7b428-c618-436f-8ae3-9ca204a623b5'}
for aid,gid in ids.items():
 native=Path(f'public/assets/originals/{aid}.generated.png');png=Path(f'public/assets/originals/{aid}.png');out=Path(f'public/assets/achievement_stamp/{aid}.webp')
 subprocess.run(['magick','-size','512x512','canvas:none','(',str(native),'-resize','448x448',')','-geometry','+32+32','-composite','-depth','8','png32:'+str(png)],check=True)
 subprocess.run(['magick',str(png),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(out)],check=True)
 p=Image.open(png).convert('RGBA');w=Image.open(out).convert('RGBA');a=w.getchannel('A');bbox=a.getbbox();assert p.size==w.size==(512,512);assert p.getchannel('A').tobytes()==a.tobytes();bg=Image.new('RGBA',p.size,'#F5F1E7');assert Image.alpha_composite(bg,p).tobytes()==Image.alpha_composite(bg,w).tobytes();assert bbox[0]>=32 and bbox[1]>=32 and bbox[2]<=480 and bbox[3]<=480
 print(aid,'native',Image.open(native).size,'alpha_bbox',bbox,'PNG_WEBP_equal',True)
