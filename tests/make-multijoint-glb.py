# Original minimal multi-joint skinned fixture: two triangles sharing one skin.
# Red triangle fully weighted to joint1; blue triangle split 0.5 joint0 / 0.5 joint1.
# joint1 is a child of joint0 with bind translation (0,0.2,0) and explicit inverse
# bind matrices. The clip translates joint1 by +0.3 x over 1s, so skinning predicts
# red moves +0.3 and blue +0.15: a 2:1 split-weight displacement ratio.
import json,struct,pathlib
p=pathlib.Path(__file__).parent/'fixtures'
parts=[];views=[];access=[]
def data(values,typ,count,component=5126,limits=None):
 raw=struct.pack('<'+('H' if component==5123 else 'f')*len(values),*values);offset=sum(len(b) for b in parts);parts.append(raw);parts.append(b'\0'*(-len(raw)%4));views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)});a={'bufferView':len(views)-1,'componentType':component,'count':count,'type':typ};a.update(limits or {});access.append(a);return len(access)-1
def mat4(*rows):  # column-major flat list from row-major rows
 return [rows[c][r] for r in range(4) for c in range(4)]
I=mat4((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1))
IBM1=mat4((1,0,0,0),(0,1,0,-0.2),(0,0,1,0),(0,0,0,1))  # inverse of T(0,0.2,0)
posA=data([-.45,0,0,-.15,0,0,-.3,.2,0],'VEC3',3,limits={'min':[-.45,0,0],'max':[-.15,.2,0]})
posB=data([.15,0,0,.45,0,0,.3,.2,0],'VEC3',3,limits={'min':[.15,0,0],'max':[.45,.2,0]})
jointsA=data([1,0,0,0]*3,'VEC4',3,5123);jointsB=data([0,1,0,0]*3,'VEC4',3,5123)
weightsA=data([1,0,0,0]*3,'VEC4',3);weightsB=data([.5,.5,0,0]*3,'VEC4',3)
ibm=data(I+IBM1,'MAT4',2)
times=data([0,1],'SCALAR',2,limits={'min':[0],'max':[1]})
trans=data([0,.2,0,.3,.2,0],'VEC3',2)
g={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0,1,2]}],
 'nodes':[{'name':'red','mesh':0,'skin':0},{'name':'blue','mesh':1,'skin':0},{'name':'joint0','children':[3]},{'name':'joint1','translation':[0,.2,0]}],
 'meshes':[{'primitives':[{'attributes':{'POSITION':posA,'JOINTS_0':jointsA,'WEIGHTS_0':weightsA},'material':0}]},{'primitives':[{'attributes':{'POSITION':posB,'JOINTS_0':jointsB,'WEIGHTS_0':weightsB},'material':1}]}],
 'materials':[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,0,0,1],'metallicFactor':0,'roughnessFactor':1}},{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[0,0,1,1],'metallicFactor':0,'roughnessFactor':1}}],
 'skins':[{'joints':[2,3],'inverseBindMatrices':ibm}],
 'animations':[{'name':'twojoints','samplers':[{'input':times,'output':trans,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':3,'path':'translation'}}]}]}
binary=b''.join(parts);g.update({'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':access})
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
out=struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
(p/'multijoint.glb').write_bytes(out)
print('wrote',p/'multijoint.glb',len(out),'bytes')
