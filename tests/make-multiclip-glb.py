# Original fixture: two independent authored animation channels, not a runtime clone.
import struct,json,pathlib
p=pathlib.Path(__file__).parent/'fixtures'
b=(p/'animated.glb').read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);binary=b[28+jl:];off=len(binary)
extra=struct.pack('<9f',0,-.25,0,0,.25,0,0,-.25,0);binary+=extra
g['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(extra)});g['accessors'].append({'bufferView':3,'componentType':5126,'count':3,'type':'VEC3'})
g['buffers'][0]['byteLength']=len(binary);g['animations'].append({'name':'Rise and fall','samplers':[{'input':1,'output':3,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':0,'path':'translation'}}]})
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
out=struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
(p/'multiclip.glb').write_bytes(out)
