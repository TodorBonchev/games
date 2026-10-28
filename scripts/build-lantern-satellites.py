"""Two original Blender island dioramas, composed by build-lantern-world.py.
Uses that author's material, mesh and primitive helpers in its shared namespace.
The editable scene keeps every sculpture; the web export merges only static parts.
"""
from mathutils import Matrix

satellite_dynamic = []
satellite_cameras = []
for name, color, emission, metallic in [
    ('MoonRock', '#655a89', 0, 0), ('MoonSoil', '#a193b8', 0, 0),
    ('MoonMoss', '#75b0a8', 0, 0), ('MoonLeaf', '#71d5bb', 0, 0),
    ('MoonPetal', '#b69cdd', 0, 0), ('MoonPetalLight', '#e3c6f2', 0, 0),
    ('MoonGlow', '#b5efe8', .65, 0), ('SunRock', '#b37b65', 0, 0),
    ('SunSand', '#d9b77f', 0, 0), ('SunStone', '#efcf94', 0, 0),
    ('Brass', '#bc995f', 0, .65), ('SunGlow', '#ffcf77', .65, .2),
]:
    material(name, color, .48 if metallic else .8, metallic=metallic, emission=emission)


def torus(name, p, radius, tube, mat, normal=(0, 1, 0), is_static=True):
    bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=6, location=W(p), major_radius=radius, minor_radius=tube)
    obj = put(bpy.context.object, name, mat, is_static)
    obj.rotation_euler = Vector(W(normal)).to_track_quat('Z', 'Y').to_euler()
    return obj


def empty(name, p):
    obj = bpy.data.objects.new(name, None)
    active_collection.objects.link(obj)
    obj.location = W(p)
    bpy.context.view_layer.update()
    satellite_dynamic.append(obj)
    return obj


def attach_at_origin(obj, parent, origin):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    scene.cursor.location = W(origin)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = (0, 0, 0)
    return obj


def island_hull(prefix, center, rx, rz, top, layers, mats):
    cx, cy, cz = center
    outline = []
    for i in range(40):
        a = i * math.tau / 40
        radius = 1 + .025 * math.sin(a * 5) + .02 * math.sin(a * 9 + .7)
        outline.append((cx + math.cos(a) * rx * radius, cz + math.sin(a) * rz * radius))
    plane_polygon(prefix + ' garden surface', outline, top, mats[0])
    for band, (bottom, scale) in enumerate(layers):
        previous_top = top if band == 0 else layers[band - 1][0]
        previous_scale = 1 if band == 0 else layers[band - 1][1]
        vertices = []
        for i, (x, z) in enumerate(outline):
            vertices += [(cx + (x - cx) * previous_scale, previous_top, cz + (z - cz) * previous_scale), (cx + (x - cx) * scale, bottom + .10 * math.sin(i * 2.3), cz + (z - cz) * scale)]
        obj = mesh(prefix + ' sculpted cliff layer %d' % band, vertices, [(2*((i+1)%40), 2*((i+1)%40)+1, 2*i+1, 2*i) for i in range(40)], mats[(band + 1) % len(mats)])
        obj.data.materials.append(materials[mats[-1]])
        for face in obj.data.polygons:
            if face.index % 7 == 0:
                face.material_index = 1
    bottom, scale = layers[-1]
    bottom_points = [(cx + (x-cx)*scale, bottom, cz + (z-cz)*scale) for x,z in outline]
    mesh(prefix + ' closed underside', bottom_points, [tuple(range(len(bottom_points)))], mats[-1])
    return outline


def arc_arch(prefix, x, z, y, radius, mat, yaw=0):
    # Stacked hand-cut voussoirs describe an actual opening, not a solid block.
    for sign in [-1, 1]:
        for row in range(4):
            xx, zz = sign * radius, 0
            cube(prefix + ' pier stone', (x + math.cos(yaw)*xx, y + .3 + row*.58, z + math.sin(yaw)*xx), (.48, .55, .55), mat, yaw=-yaw, bevel=.05)
    for i in range(11):
        angle = i * math.pi / 10
        xx = math.cos(angle)*radius
        obj = cube(prefix + ' curved arch stone', (x + math.cos(yaw)*xx, y+2.05+math.sin(angle)*radius, z+math.sin(yaw)*xx), (.52,.48,.58), mat, yaw=-yaw, bevel=.04)
    ico(prefix + ' arch star', (x,y+2.2+radius,z), (.23,.32,.20), 'MoonGlow' if 'Moon' in prefix else 'SunGlow')


# MOONBLOOM — pale terraces, a crescent pool and an enormous sleeping lotus.
moon_collection = bpy.data.collections.new('Moonbloom Sanctuary · sculpture garden')
world_collection.children.link(moon_collection)
active_collection = moon_collection
cx, cy, cz = -42, 3, -25
moon_outline = island_hull('Moonbloom', (cx,cy,cz), 10.0, 8.5, 3.45, [(2.6,1.015),(.5,.85),(-2.0,.53),(-4.0,.18)], ['MoonMoss','MoonSoil','MoonRock'])
# Crescent terraces form a broad C around an inset luminous pond.
for i in range(29):
    a = .57 + i / 28 * (math.tau - 1.14)
    for band in range(2):
        radius = 6.65 + band*.68
        x,z = cx+math.cos(a)*radius,cz+math.sin(a)*radius*.82
        cube('Moon crescent garden step', (x,3.64+band*.22,z), (1.3,.32+band*.4,.75), 'MoonSoil' if band else 'MoonPetal', yaw=-a, bevel=.06)
# The glowing pool is slightly kidney-shaped, with stepping lilies and low rim.
pond = [(cx+1.8+math.cos(i*math.tau/36)*3.15,cz+.3+math.sin(i*math.tau/36)*2.7) for i in range(36)]
plane_polygon('Moonpool luminous surface', pond,3.49,'MoonGlow')
for i in range(23):
    a=i*math.tau/23
    ico('Moonpool polished rimstone',(cx+1.8+math.cos(a)*3.28,3.56,cz+.3+math.sin(a)*2.82),(.42,.17,.32),'MoonSoil',1)
for x,z,scale in [(cx+1,cz+.4,1),(cx+2.8,cz-.7,.65),(cx+.3,cz+1.4,.7)]:
    cylinder('Moonpool lily pad',(x,3.53,z),.55*scale,.035,'MoonLeaf',vertices=9)
    for n in range(5):
        a=n*math.tau/5
        ico('Moonpool tiny lotus petal',(x+math.cos(a)*.17*scale,3.66,z+math.sin(a)*.17*scale),(.20*scale,.10*scale,.14*scale),'MoonPetalLight')
# A curved stepping path leads from the pond toward the crescent horns.
for i in range(14):
    a=-.2+i/13*math.pi*1.25
    cylinder('Moon garden stepping disk',(cx+1+math.cos(a)*4.8,3.52,cz+math.sin(a)*3.65),.36,.10,'MoonSoil',vertices=9)


def mushroom(x,z,height,cap):
    beam('Moon mushroom pale stem',(x,3.45,z),(x+.12,3.45+height,z),.18,'MoonPetalLight')
    cylinder('Moon mushroom gills',(x+.12,3.45+height,z),cap*.86,.12,'MoonGlow',vertices=12)
    ico('Moon mushroom sculpted cap',(x+.12,3.60+height,z),(cap,.54*cap,cap),'MoonPetal' if height>2 else 'MoonLeaf',2)
    for i in range(5):
        a=i*math.tau/5+.3
        ico('Moon mushroom glowing freckle',(x+.12+math.cos(a)*cap*.52,3.60+height+cap*.38,z+math.sin(a)*cap*.52),(.10,.045,.10),'MoonGlow')
for dx,dz,h,r in [(-7,-2,3.3,1.3),(-6,-3.7,2.3,.9),(-8,-.4,1.7,.75),(-2,-6,4,1.35),(-3.2,-5.6,2.5,.95),(1,-6.3,2.1,.85),(-5,4,2.2,.9),(5,4.8,1.4,.65)]:
    mushroom(cx+dx,cz+dz,h,r)
arc_arch('Moon silver arch',cx+6.3,cz+2.1,3.45,1.4,'MoonSoil',yaw=.55)
# A much smaller broken arch is an intimate surprise on the far terrace.
for i in range(3):
    cube('Moon ruined shrine stack',(cx-5.8,3.7+i*.5,cz+4.8),(.6,.46,.6),'MoonSoil',bevel=.05)
beam('Moon shrine vine',(cx-5.8,5.0,cz+4.8),(cx-4.4,3.5,cz+5.5),.06,'MoonLeaf')
# Six individually hinged petals: local axes remain world aligned in the GLB.
bloom_origin=(-44,5.4,-26)
cylinder('Moonbloom lotus pedestal',(-44,4.2,-26),1.9,1.35,'MoonSoil',1.4,vertices=12)
torus('Moonbloom pedestal gold inlay',(-44,4.93,-26),1.5,.05,'StarGold')
bloom=empty('MoonbloomBloom',bloom_origin)
for petal in range(6):
    phi=petal*math.tau/6
    verts=[]
    for row in range(7):
        t=row/6
        radial=.38+math.sin(t*math.pi)*.95-.2*t
        width=math.sin(math.pi*t)*.65+.055
        for column in range(5):
            across=(column/4*2-1)*width
            # Bowl-shaped petal with a raised edge and narrowed pointed tip.
            r=radial-.18*(column/4*2-1)**2*math.sin(math.pi*t)
            verts.append((bloom_origin[0]+math.cos(phi)*r-math.sin(phi)*across,bloom_origin[1]+t*3.35,bloom_origin[2]+math.sin(phi)*r+math.cos(phi)*across))
    faces=[(r*5+c,r*5+c+1,(r+1)*5+c+1,(r+1)*5+c) for r in range(6) for c in range(4)]
    obj=mesh('MoonbloomPetal%d'%petal,verts,faces,'MoonPetalLight' if petal%2 else 'MoonPetal',False)
    modifier=obj.modifiers.new('Petal thickness','SOLIDIFY');modifier.thickness=.07
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
    attach_at_origin(obj,bloom,bloom_origin)
core=ico('MoonbloomCore',(-44,6.7,-26),(.54,.8,.54),'MoonGlow',2,False)
attach_at_origin(core,bloom,bloom_origin)
for i in range(44):
    a=i*math.tau/44
    x,z=cx+math.cos(a)*9.65,cz+math.sin(a)*8.15
    if i%3==0:
        for j in range(5):
            ico('Moon hanging heart vine',(x+.16*math.sin(j),3.25-j*.58,z),(.26,.34,.20),'MoonLeaf' if j%2 else 'LeafDark')
        ico('Moon hanging dewdrop',(x,0.2,z),(.12,.22,.12),'MoonGlow')
    elif i%4==1:
        for j in range(3):
            ico('Moon coastal lavender flower',(x+.18*j,3.73,z),(.18,.26,.18),'MoonPetalLight')
for i in range(20):
    a=i*2.39996;r=4.9+(i%3)*.8
    x,z=cx+math.cos(a)*r,cz+math.sin(a)*r*.82
    if x>cx-1 and abs(z-cz)<3:continue
    beam('Moon silver grass',(x,3.5,z),(x+.14,4.05,z),.026,'MoonLeaf')
    ico('Moon silver bell flower',(x+.14,4.1,z),(.14,.22,.14),'MoonGlow')

# SUNSPIRE — sandstone mesas, precision brass instruments and suspended stairs.
sun_collection=bpy.data.collections.new('Sunspire Observatory · celestial ruins')
world_collection.children.link(sun_collection)
active_collection=sun_collection
cx,cy,cz=42,7,-28
sun_outline=island_hull('Sunspire',(cx,cy,cz),9.8,8.2,7.45,[(6.5,1.025),(4.1,.80),(1.8,.50),(.4,.16)],['SunSand','SunStone','SunRock'])
# The raised twelve-sided sanctuary is a distinct stepped, architectural silhouette.
cylinder('Sunspire lower star terrace',(42,7.85,-29),5.2,.8,'SunStone',vertices=12)
cylinder('Sunspire upper star terrace',(42,8.6,-29),4.4,.7,'SunSand',vertices=12)
cylinder('Sunspire celestial dais',(42,9.25,-29),3.25,.6,'SunStone',vertices=12)
for n in range(12):
    a=n*math.tau/12
    x,z=42+math.cos(a)*4.6,-29+math.sin(a)*4.6
    cube('Sunspire radial floor inlay',(x,8.31,z),(.08,.04,1.0),'Brass',yaw=-a+math.pi/2)
# Walkable-looking suspended stairs are sculptural details; flight passes alongside.
for i in range(11):
    a=.25+i*.16
    x,z=42+math.cos(a)*6.5,-28+math.sin(a)*5.8
    cube('Sunspire suspended stair',(x,7.55+i*.13,z),(1.1,.22,.7),'SunStone',yaw=-a,bevel=.06)
    if i%3==0:
        beam('Sunspire stair support',(x,6.9,z),(x,7.45+i*.13,z),.065,'Brass')
# The paired ruin gate, broken columns and a distant telescope lookout.
arc_arch('Sunspire triumph arch',36,-28.5,7.45,1.6,'SunStone',yaw=-.25)
for x,z,h in [(38,-33,2.1),(47,-30.8,3.1),(47.7,-25.6,1.5)]:
    cylinder('Sunspire fluted ruin column',(x,7.45+h/2,z),.38,h,'SunStone',vertices=8)
    cylinder('Sunspire column capital',(x,7.45+h,z),.56,.22,'SunSand',vertices=8)
    for n in range(3):
        ico('Sunspire fallen masonry',(x+.75+n*.32,7.58,z+.3*math.sin(n)),(.3,.15,.26),'SunStone')
cylinder('Sunspire telescope lookout',(46.7,8.6,-33),1.4,2.3,'SunRock',1.25,vertices=8)
cylinder('Sunspire lookout rim',(46.7,9.83,-33),1.58,.18,'SunStone',vertices=8)
beam('Sunspire telescope tripod',(46.7,9.9,-33),(46.7,11.15,-33),.12,'Brass')
beam('Sunspire brass telescope',(45.9,11.3,-33.4),(47.9,11.7,-32.2),.26,'Brass')
ico('Sunspire telescope lens',(47.94,11.72,-32.18),(.23,.23,.14),'MoonGlow',2)
# Modelled giant armillary instrument; rings and core remain separate nodes.
orrery_origin=(42,13.2,-29)
cylinder('Sunspire instrument pedestal',(42,10.1,-29),1.05,1.0,'SunRock',.8,vertices=10)
cylinder('Sunspire brass spindle',(42,11.1,-29),.2,1.5,'Brass',vertices=10)
orrery=empty('SunspireOrrery',orrery_origin)
for i,(radius,normal) in enumerate([(2.35,(0,1,0)),(2.6,(.65,.5,.3)),(2.85,(-.3,.6,.7))]):
    ring=torus('SunspireOrbit%d'%i,orrery_origin,radius,.095,'Brass',normal,False)
    attach_at_origin(ring,orrery,orrery_origin)
core=ico('SunspireCore',orrery_origin,(.8,.8,.8),'SunGlow',2,False)
attach_at_origin(core,orrery,orrery_origin)
for i in range(8):
    a=i*math.tau/8
    # Static orbit ticks stay with the parent as an individually editable mesh.
    obj=ico('SunspireOrbitStar%d'%i,(42+math.cos(a)*2.35,13.2,-29+math.sin(a)*2.35),(.15,.15,.15),'SunGlow',1,False)
    attach_at_origin(obj,orrery,orrery_origin)
# Three distant crystal formations and a low fossil spiral invite close passes.
for dx,dz,h in [(-6,4,1.25),(5,4,1.5),(-1,-6.2,1.2)]:
    for n in range(3):
        x,z=cx+dx+n*.38,cz+dz+(n%2)*.3
        cylinder('Sunspire amber crystal',(x,7.45+h/2,z),.27,h,'SunGlow',0,vertices=5)
for i in range(16):
    a=i*.55;r=.3+i*.07
    ico('Sunspire fossil spiral',(39.2+math.cos(a)*r,7.52,-24+math.sin(a)*r),(.13,.06,.12),'Brass')
for i in range(25):
    a=i*math.tau/25
    x,z=42+math.cos(a)*9.5,-28+math.sin(a)*7.9
    if i%4==0:
        cylinder('Sunspire rim marker',(x,7.8,z),.22,.7,'SunStone',.15,vertices=6)
        ico('Sunspire marker flame',(x,8.28,z),(.13,.3,.13),'SunGlow')
    elif i%5==0:
        for j in range(3):
            cylinder('Sunspire hanging crystal',(x+j*.15,5.9-j*.75,z),.15,.9,'SunGlow',0,vertices=5)

WORLD['satellites'] = [
    {'id':'moonbloom','name':'Moonbloom Sanctuary','center':{'x':-42,'y':3,'z':-25},'rx':11,'rz':9.5,'topY':4.8,'bottomY':-4.3,
     'colliders':[{'x':-44,'z':-26,'radius':2.4,'minY':4.8,'maxY':9.3},{'x':-49,'z':-27,'radius':2.6,'minY':3.45,'maxY':8.5},{'x':-44,'z':-31,'radius':2.6,'minY':3.45,'maxY':8.8},{'x':-35.7,'z':-22.9,'radius':2,'minY':3.45,'maxY':8.1},{'x':-47,'z':-21,'radius':1.3,'minY':3.45,'maxY':6.3}],
     'nodes':[{'x':-33.7,'y':10,'z':-21},{'x':-48,'y':11.5,'z':-22},{'x':-45,'y':12,'z':-32}],
     'landmark':{'x':-44,'y':5.4,'z':-26},'approach':{'x':-42,'y':14,'z':-12},'mission':'Gather three drifting dewseeds.','reward':'The moonblossom opens. Its luminous pollen carries your light to sleeping gardens among the stars.','color':'#c4adee'},
    {'id':'sunspire','name':'Sunspire Observatory','center':{'x':42,'y':7,'z':-28},'rx':10.6,'rz':9,'topY':9.6,'bottomY':.2,
     'colliders':[{'x':42,'z':-29,'radius':3.2,'minY':9.6,'maxY':17},{'x':36,'z':-28.5,'radius':2.1,'minY':7.45,'maxY':12.5},{'x':46.7,'z':-33,'radius':1.8,'minY':7.45,'maxY':12.2},{'x':38,'z':-33,'radius':.65,'minY':7.45,'maxY':10},{'x':47,'z':-30.8,'radius':.65,'minY':7.45,'maxY':10.8}],
     'nodes':[{'x':49,'y':12.5,'z':-23},{'x':36,'y':14,'z':-32},{'x':44,'y':18.5,'z':-30}],
     'landmark':{'x':42,'y':13.2,'z':-29},'approach':{'x':42,'y':20,'z':-15},'mission':'Fly through three calibration rings.','reward':'The ancient orrery turns again. Its golden sun marks a safe route home for every wandering ship.','color':'#f6c777'},
]
(ROOT / 'assets/lantern-world.json').write_text(json.dumps(WORLD, indent=2) + '\n')
# Two close-up cameras and dedicated local lights are saved for future editing.
for label, target, position, scale in [
    ('Moonbloom',(-42,3,-25),(-21,24,-2),28),
    ('Sunspire',(42,8.5,-28),(64,31,-2),28),
]:
    data=bpy.data.cameras.new(label+' postcard camera');camera=bpy.data.objects.new(label+' postcard camera',data)
    scene.collection.objects.link(camera);camera.location=W(position)
    camera.rotation_euler=(Vector(W(target))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=scale;satellite_cameras.append(camera)
    for side,off,power in [('key',(-12,22,12),1700),('fill',(14,15,-5),1000)]:
        data=bpy.data.lights.new(label+' '+side,'AREA');data.energy=power;data.shape='DISK';data.size=12
        light=bpy.data.objects.new(label+' '+side,data);scene.collection.objects.link(light)
        light.location=W(tuple(target[i]+off[i] for i in range(3)));light.rotation_euler=(Vector(W(target))-light.location).to_track_quat('-Z','Y').to_euler()
active_collection=world_collection
