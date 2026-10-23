"""Generate original starter assets. No stock assets or third-party artwork."""
from PIL import Image,ImageDraw
import math,struct,wave,json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]/'studio/library'
def icon(kind,color):
 im=Image.new('RGBA',(256,256));d=ImageDraw.Draw(im)
 if kind=='star':
  p=[(128+100*math.sin(i*math.pi/5)*(1 if i%2==0 else .4),128-100*math.cos(i*math.pi/5)*(1 if i%2==0 else .4))for i in range(10)]
  d.polygon(p,fill=color)
 else:d.ellipse((25,25,231,231),outline=color,width=15)
 return im
icon('star',(255,204,74,255)).save(root/'star.png');icon('ring',(124,92,255,255)).save(root/'ring.png')
frames=[]
for i in range(20):
 im=Image.new('RGBA',(128,128));d=ImageDraw.Draw(im);r=20+25*(1+math.sin(i*math.tau/20))/2;d.ellipse((64-r,64-r,64+r,64+r),outline=(255,204,74,255),width=5);frames.append(im)
frames[0].save(root/'pulse.gif',save_all=True,append_images=frames[1:],duration=70,loop=0,transparency=0,disposal=2)
# A short, quiet two-note bell with fade-in and long decay. Mono PCM, no mic content.
rate=22050;duration=1.2
with wave.open(str(root/'bell.wav'),'wb')as w:
 w.setparams((1,2,rate,0,'NONE','not compressed'))
 vals=[]
 for i in range(int(rate*duration)):
  t=i/rate;y=0
  for start,freq in [(0,660),(.25,880)]:
   dt=t-start
   if dt>=0:y+=.18*min(1,dt/.01)*math.exp(-5*dt)*math.sin(math.tau*freq*dt)
  vals.append(struct.pack('<h',int(max(-1,min(1,y))*32767)))
 w.writeframes(b''.join(vals))
# Faceted octahedron, original geometry and purple PBR material.
v=[(0,.5,0),(.4,0,0),(0,0,.4),(-.4,0,0),(0,0,-.4),(0,-.5,0)]
faces=[(0,2,1),(0,3,2),(0,4,3),(0,1,4),(5,1,2),(5,2,3),(5,3,4),(5,4,1)]
ps=[v[j]for f in faces for j in f];data=b''.join(struct.pack('<fff',*p)for p in ps)
g={'asset':{'version':'2.0','generator':'Brill AR original starter assets'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0},'material':0}]}],'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[.4,.2,.9,1],'metallicFactor':.1,'roughnessFactor':.5}}],'accessors':[{'bufferView':0,'componentType':5126,'count':len(ps),'type':'VEC3','min':[-.4,-.5,-.4],'max':[.4,.5,.4]}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(data)}],'buffers':[{'byteLength':len(data)}]}
s=json.dumps(g,separators=(',',':')).encode();s+=b' '*((-len(s))%4)
out=struct.pack('<III',0x46546c67,2,12+8+len(s)+8+len(data))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(data),0x004e4942)+data
(root/'gem.glb').write_bytes(out)
