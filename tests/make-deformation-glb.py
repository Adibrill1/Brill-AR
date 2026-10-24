# Original minimal deformation fixtures: one morph target and one skinned joint.
import json,struct,pathlib
p=pathlib.Path(__file__).parent/'fixtures'
def build(kind):
 parts=[];views=[];access=[]
 def data(values,typ,count,component=5126,limits=None):
  raw=struct.pack('<'+('H' if component==5123 else 'f')*len(values),*values);offset=sum(len(b) for b in parts);parts.append(raw);parts.append(b'\0'*(-len(raw)%4));views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)});a={'bufferView':len(views)-1,'componentType':component,'count':count,'type':typ};a.update(limits or {});access.append(a);return len(access)-1
 pos=data([-.2,-.2,0,.2,-.2,0,0,.2,0],'VEC3',3,limits={'min':[-.2,-.2,0],'max':[.2,.2,0]});times=data([0,1],'SCALAR',2,limits={'min':[0],'max':[1]})
 g={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'deforming','mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':pos},'material':0}]}],'materials':[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,0,0,1],'metallicFactor':0,'roughnessFactor':1}}]}
 primitive=g['meshes'][0]['primitives'][0]
 if kind=='morph':
  target=data([-.25,0,0,.25,0,0,0,.5,0],'VEC3',3,limits={'min':[-.25,0,0],'max':[.25,.5,0]});primitive['targets']=[{'POSITION':target}];g['meshes'][0]['weights']=[0];output=data([0,1],'SCALAR',2);path='weights';node=0
 else:
  joints=data([0,0,0,0]*3,'VEC4',3,5123);weights=data([1,0,0,0]*3,'VEC4',3);primitive['attributes'].update({'JOINTS_0':joints,'WEIGHTS_0':weights});g['nodes'][0]['skin']=0;g['nodes'].append({'name':'joint'});g['scenes'][0]['nodes'].append(1);g['skins']=[{'joints':[1]}];output=data([-.25,0,0,.25,0,0],'VEC3',2);path='translation';node=1
 g['animations']=[{'name':kind,'samplers':[{'input':times,'output':output,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':node,'path':path}}]}];binary=b''.join(parts);g.update({'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':access});j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4);out=struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary;(p/(kind+'.glb')).write_bytes(out)
for kind in ['morph','skin']:build(kind)
