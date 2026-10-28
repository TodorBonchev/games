"""Build Lantern Vale in Blender, save the editable scene, and export its game GLB.
Run: blender --background --python scripts/build-lantern-world.py
Optional: append -- --render to make a camera render in test-results/lantern/.
All world construction uses Three.js coordinates (X right, Y up, Z forward).
"""
import bpy
import math
import json
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
WORLD = json.loads((ROOT / 'assets/lantern-world.json').read_text())
random.seed(42017)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials):
    bpy.data.materials.remove(data)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 1050
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.color = (.18, .23, .32)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = .25

world_collection = bpy.data.collections.new('Lantern Vale · editable world')
scene.collection.children.link(world_collection)
character_collection = bpy.data.collections.new('Keeper · reusable character')
scene.collection.children.link(character_collection)
active_collection = world_collection
static = []
animated = []
materials = {}


def W(point):
    x, y, z = point
    return (x, -z, y)


def rgba(value):
    value = value.lstrip('#')
    rgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def material(name, color, roughness=.8, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = rgba(color)
        bsdf.inputs['Emission Strength'].default_value = emission
    materials[name] = mat
    return mat


for name, color in {
    'Grass': '#83a97f', 'GrassLight': '#a8bf85', 'GrassDark': '#668d79',
    'Cliff': '#8d8c9b', 'CliffLight': '#b1a2a2', 'CliffDark': '#676d86',
    'Earth': '#baa894', 'Path': '#ddc4a0', 'Paver': '#f0d9b6',
    'Plaster': '#f0d6b4', 'PlasterPink': '#dcaba0', 'PlasterBlue': '#98b8b8',
    'Roof': '#b96666', 'RoofLight': '#dd8d78', 'RoofDark': '#914f62',
    'Timber': '#735a60', 'TimberLight': '#a88371', 'Trim': '#f5dfb9',
    'Leaf': '#4f887c', 'LeafLight': '#78a78a', 'LeafDark': '#376b6a',
    'Blossom': '#e8a0b1', 'BlossomLight': '#ffd1bc',
    'FlowerGold': '#f2c777', 'FlowerPurple': '#a49aca', 'FlowerPink': '#eea5b5',
    'Water': '#5bb4be', 'WaterLight': '#a2dfe0', 'WaterDark': '#40939f',
    'Metal': '#576875', 'Flag': '#d9b6a9', 'KeeperCoat': '#e39b63',
    'KeeperScarf': '#ad6d85', 'KeeperSkin': '#f7d9ae', 'KeeperBoot': '#556579',
}.items():
    material(name, color)
material('WindowGlow', '#ffd797', .6, emission=.7)
material('LanternGlass', '#fff1bb', .4, emission=.5)
material('StarGold', '#ffdc86', .4, emission=.35)
material('WaterFoam', '#dbf4ed', .6, emission=.08)


def put(obj, name, mat, is_static=True):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    active_collection.objects.link(obj)
    if mat:
        obj.data.materials.append(materials[mat] if isinstance(mat, str) else mat)
    if is_static:
        static.append(obj)
    else:
        animated.append(obj)
    return obj


def cube(name, p, size, mat, yaw=0, bevel=0, is_static=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=W(p))
    obj = put(bpy.context.object, name, mat, is_static)
    obj.scale = (size[0], size[2], size[1])
    obj.rotation_euler.z = yaw
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Soft hand-cut corners', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def ico(name, p, size, mat, sub=1, is_static=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1, location=W(p))
    obj = put(bpy.context.object, name, mat, is_static)
    obj.scale = (size[0], size[2], size[1])
    return obj


def cylinder(name, p, radius, height, mat, radius_top=None, vertices=12, is_static=True):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius_top is None else radius_top, depth=height, location=W(p))
    return put(bpy.context.object, name, mat, is_static)


def mesh(name, vertices, faces, mat, is_static=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([W(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    active_collection.objects.link(obj)
    if mat:
        data.materials.append(materials[mat])
    (static if is_static else animated).append(obj)
    return obj


def beam(name, a, b, width, mat, is_static=True):
    delta = Vector(W(b)) - Vector(W(a))
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=width, depth=delta.length, location=(Vector(W(a)) + Vector(W(b))) / 2)
    obj = put(bpy.context.object, name, mat, is_static)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return obj


def polygon_clip(points, x_limit, keep_left):
    result = []
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        inside_a = a[0] <= x_limit if keep_left else a[0] >= x_limit
        inside_b = b[0] <= x_limit if keep_left else b[0] >= x_limit
        if inside_a:
            result.append(a)
        if inside_a != inside_b:
            t = (x_limit - a[0]) / (b[0] - a[0])
            result.append((x_limit, a[1] + (b[1] - a[1]) * t))
    return result


def plane_polygon(name, points, height, mat):
    return mesh(name, [(x, height, z) for x, z in points], [tuple(reversed(range(len(points))))], mat)


# Sculpted island strata. Individual faces carry a gentle, deliberately varied palette.
N = 64
outline = []
for i in range(N):
    a = i * math.tau / N
    ripple = 1 + .022 * math.sin(a * 7) + .014 * math.cos(a * 11)
    outline.append((math.cos(a) * 16.5 * ripple, math.sin(a) * 12 * ripple))
left_bank = polygon_clip(outline, 1.1, True)
right_bank = polygon_clip(outline, 3.7, False)
plane_polygon('West meadow', left_bank, .45, 'Grass')
plane_polygon('East meadow', right_bank, .45, 'Grass')
river_shape = polygon_clip(polygon_clip(outline, 1.1, False), 3.7, True)
plane_polygon('River · still turquoise surface', river_shape, .405, 'Water')
for j, (top_y, bottom_y, top_scale, bottom_scale) in enumerate([(.45, -.35, 1, 1.015), (-.35, -2.2, 1.015, .92), (-2.2, -4.2, .92, .67), (-4.2, -5.7, .67, .3)]):
    vertices = []
    for i, (x, z) in enumerate(outline):
        vertices += [(x * top_scale, top_y, z * top_scale), (x * bottom_scale, bottom_y + .15 * math.sin(i * 1.7), z * bottom_scale)]
    obj = mesh('Cliff stratum %02d' % j, vertices, [(2 * ((i + 1) % N), (2 * ((i + 1) % N)) + 1, 2 * i + 1, 2 * i) for i in range(N)], 'Earth' if j == 0 else 'Cliff')
    for key in ['CliffLight', 'CliffDark']:
        obj.data.materials.append(materials[key])
    for p in obj.data.polygons:
        p.material_index = random.choices([0, 1, 2], [7, 2, 1])[0] if j else 0

# Thin sandstone ribbons have rounded joins without stacked solid surfaces.
paths = [
    [(-8, 7.2), (-7, 4.8), (-6, 2.9), (-8.6, 1), (-11.2, -2.2), (-10.2, -5.7), (-7.5, -5.2), (-4, -6.6), (-1.2, -7.8)],
    [(-6, 2.9), (-3.8, 4), (-.1, 4.5), (4.4, 4.5), (7, 5), (8.5, 5.9)],
    [(-1.2, -7.8), (-.3, -5.7), (4.7, -5.7), (8.3, -5.5), (11.8, -3.8), (11.4, .2), (10.4, 3), (8.5, 5.9)],
    [(4.7, -5.7), (5.3, -3.3), (7, -.5), (7.7, 2.6), (7, 5)],
    [(-3.8, 4), (-3.3, 7.1), (-.4, 8.1)],
]
for path_id, points in enumerate(paths):
    height = .475 + path_id * .004
    for a, b in zip(points, points[1:]):
        length = math.dist(a, b)
        px, pz = -(b[1] - a[1]) / length * .61, (b[0] - a[0]) / length * .61
        ribbon = [(a[0] + px, a[1] + pz), (a[0] - px, a[1] - pz), (b[0] - px, b[1] - pz), (b[0] + px, b[1] + pz)]
        for limit, keep_left in [(1.04, True), (3.76, False)]:
            clipped = polygon_clip(ribbon, limit, keep_left)
            if len(clipped) >= 3:
                plane_polygon('Winding sandstone path', clipped, height, 'Path')
    for x, z in points:
        disk = [(x + .61 * math.cos(i * math.tau / 20), z + .61 * math.sin(i * math.tau / 20)) for i in range(20)]
        for limit, keep_left in [(1.04, True), (3.76, False)]:
            clipped = polygon_clip(disk, limit, keep_left)
            if len(clipped) >= 3:
                plane_polygon('Rounded footpath bend', clipped, height + .002, 'Path')
for beacon in WORLD['beacons']:
    cylinder('Lantern meeting circle', (beacon['x'], .47, beacon['z']), 1.13, .04, 'Paver', vertices=16)
    for i in range(10):
        a = i * math.tau / 10
        cube('Plaza edge stone', (beacon['x'] + 1.15 * math.cos(a), .52, beacon['z'] + 1.15 * math.sin(a)), (.35, .10, .19), 'Earth', yaw=-a, bevel=.03)

# Two timber bridges span a real gap in the meadow.
for bridge in WORLD['river']['bridges']:
    z = bridge['z']
    for i in range(17):
        x = .62 + i * .22
        cube('Bridge deck plank', (x, .5 + .065 * math.sin(i / 16 * math.pi), z), (.2, .14, 2.42), 'TimberLight' if i % 3 else 'Trim', bevel=.025)
    for side in [-1, 1]:
        zz = z + side * 1.25
        for x in [.65, 1.8, 3, 4.15]:
            cylinder('Bridge post', (x, .93, zz), .095, 1.05, 'Timber', vertices=8)
            ico('Bridge post cap', (x, 1.48, zz), (.13, .10, .13), 'FlowerGold')
        beam('Bridge handrail', (.65, 1.32, zz), (4.15, 1.32, zz), .055, 'TimberLight')


def roof(name, x, y, z, width, depth, peak, palette='Roof'):
    verts = [(x - width / 2, y, z - depth / 2), (x + width / 2, y, z - depth / 2), (x + width / 2, y, z + depth / 2), (x - width / 2, y, z + depth / 2), (x - width / 2, y + peak, z), (x + width / 2, y + peak, z)]
    obj = mesh(name, verts, [(4, 5, 1, 0), (3, 2, 5, 4), (3, 4, 0), (5, 2, 1), (1, 2, 3, 0)], palette)
    # Tile courses are shallow warm strips following each roof face.
    for side in [-1, 1]:
        for row in range(5):
            t1, t2 = row / 5, (row + .77) / 5
            zz1, zz2 = z + side * depth / 2 * (1 - t1), z + side * depth / 2 * (1 - t2)
            yy1, yy2 = y + peak * t1 + .035, y + peak * t2 + .035
            for col in range(7):
                xx1 = x - width / 2 + col * width / 7 + .025
                xx2 = xx1 + width / 7 - .055
                mesh('Individual terracotta roof tile', [(xx1, yy1, zz1), (xx2, yy1, zz1), (xx2, yy2, zz2), (xx1, yy2, zz2)], [(0, 1, 2, 3)] if side > 0 else [(3, 2, 1, 0)], 'RoofLight' if (row + col) % 4 == 0 else palette)
    beam('Roof ridge cap', (x - width / 2 - .03, y + peak + .035, z), (x + width / 2 + .03, y + peak + .035, z), .08, 'RoofDark')
    return obj


def window(x, y, z, width=.55, height=.65):
    cube('Window oak frame', (x, y, z), (width + .15, height + .15, .10), 'Timber')
    cube('Warm glass', (x, y, z + .06), (width, height, .03), 'WindowGlow')
    cube('Window mullion', (x, y, z + .09), (.055, height, .035), 'Trim')
    cube('Window transom', (x, y, z + .09), (width, .055, .035), 'Trim')
    cube('Deep window sill', (x, y - height / 2 - .07, z + .1), (width + .25, .10, .26), 'Trim', bevel=.025)


def cottage(x, z, scale=1, color='Plaster', roof_color='Roof'):
    w, d, h = 2.6 * scale, 2.2 * scale, 2 * scale
    cube('Cottage stone foundation', (x, .57, z), (w + .18, .28, d + .18), 'Earth', bevel=.09)
    cube('Cottage plaster walls', (x, .68 + h / 2, z), (w, h, d), color, bevel=.07)
    for side in [-1, 1]:
        cube('Cottage corner beam', (x + side * (w / 2 - .05), .68 + h / 2, z + d / 2 + .03), (.11, h, .10), 'Timber')
    cube('Cottage eave beam', (x, .68 + h, z + d / 2 + .04), (w + .14, .13, .14), 'Timber')
    roof('Tiled cottage roof', x, .68 + h, z, w + .55, d + .58, .9 * scale, roof_color)
    cube('Little front door', (x, 1.24, z + d / 2 + .06), (.62 * scale, 1.2, .08), 'Timber', bevel=.04)
    cube('Door light', (x, 1.55, z + d / 2 + .11), (.35, .3, .035), 'WindowGlow')
    ico('Door knob', (x + .2, 1.15, z + d / 2 + .15), (.055, .055, .055), 'FlowerGold')
    for side in [-1, 1]:
        window(x + side * w * .32, 1.72, z + d / 2 + .04, .45 * scale, .57 * scale)
    cube('Chimney', (x + w * .29, .68 + h + .77 * scale, z - .22), (.38, 1.1, .42), 'PlasterPink', bevel=.035)
    cube('Chimney cap', (x + w * .29, .68 + h + 1.33 * scale, z - .22), (.49, .15, .51), 'RoofDark', bevel=.03)
    for side in [-1, 1]:
        cylinder('Doorstep flower pot', (x + side * .48, .72, z + d / 2 + .25), .18, .35, 'Roof', .22, vertices=10)
        for n in range(3):
            ico('Window garden flower', (x + side * .48 + math.cos(n * 2) * .13, .98, z + d / 2 + .25 + math.sin(n * 2) * .13), (.15, .11, .15), 'FlowerPink' if side < 0 else 'FlowerGold')


cottage(-6.5, -.7, 1.1, 'Plaster', 'Roof')
cottage(-10.3, 3.7, .76, 'PlasterPink', 'RoofDark')
cottage(-3.3, -.7, .83, 'PlasterBlue', 'Roof')
# Market awning, boxes, a basket, and a cozy bench make the courtyard lived in.
for x in [-5.1, -3.8]:
    beam('Market stall upright', (x, .5, 2), (x, 2.2, 2), .045, 'Timber')
for i in range(7):
    cube('Striped market awning', (-5.18 + i * .22, 2.23, 1.65), (.23, .09, .95), 'Trim' if i % 2 else 'FlowerPink')
cube('Market counter', (-4.5, 1.1, 1.9), (1.45, .15, .65), 'TimberLight', bevel=.04)
for i in range(7):
    ico('Market fruit', (-5 + i * .17, 1.25, 1.9), (.10, .10, .10), 'FlowerGold')
for x, z in [(-8.2, -.7), (-2.2, .8)]:
    for side in [-1, 1]:
        cube('Bench foot', (x + side * .55, .68, z), (.12, .5, .45), 'Timber')
    cube('Bench seat', (x, .95, z), (1.45, .12, .5), 'TimberLight', bevel=.025)
    cube('Bench back', (x, 1.3, z - .19), (1.45, .5, .1), 'TimberLight', bevel=.025)

# Windmill with a genuine separate rotor node.
x, z = -7.4, -7.3
cylinder('Windmill tapered tower', (x, 2.3, z), 1.05, 3.7, 'Plaster', .8, vertices=12)
cylinder('Windmill roof', (x, 4.65, z), 1.2, 1.4, 'RoofDark', 0, vertices=12)
window(x, 2.1, z + 1.03, .45, .65)
cube('Mill door', (x, 1.08, z + 1.06), (.62, 1.18, .07), 'Timber', bevel=.04)
rotor_parts = []
for i in range(4):
    angle = i * math.pi / 2 + .3
    a = (x, 3.65, z + 1.16)
    b = (x + math.cos(angle) * 2.45, 3.65 + math.sin(angle) * 2.45, z + 1.16)
    rotor_parts.append(beam('Windmill blade spar', a, b, .065, 'Timber', False))
    for j in range(4):
        r = .9 + j * .35
        px, py = x + math.cos(angle) * r, 3.65 + math.sin(angle) * r
        qx, qy = -math.sin(angle) * .43, math.cos(angle) * .43
        rotor_parts.append(beam('Windmill sail slat', (px - qx, py - qy, z + 1.17), (px + qx, py + qy, z + 1.17), .075, 'Trim', False))
rotor_parts.append(ico('Windmill hub', (x, 3.65, z + 1.2), (.2, .2, .16), 'FlowerGold', 2, False))
bpy.ops.object.select_all(action='DESELECT')
for obj in rotor_parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rotor_parts[0]
bpy.ops.object.join()
rotor = bpy.context.object
rotor.name = 'WindmillRotor'
scene.cursor.location = W((x, 3.65, z + 1.16))
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
# Apply rotation so exported rotor basis is world aligned; renderer rotates world Z.
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# Orchard trees, whose layered crowns remain distinct at phone resolution.
def tree(x, z, scale=1, blossom=False):
    beam('Tree trunk', (x, .45, z), (x + .11 * scale, 2.6 * scale, z), .2 * scale, 'Timber')
    for a in [0, 2.1, 4.2]:
        beam('Tree branch', (x, 1.7 * scale, z), (x + math.cos(a) * .85 * scale, 2.75 * scale, z + math.sin(a) * .65 * scale), .10 * scale, 'Timber')
    for j, (dx, dy, dz, r) in enumerate([(-.65, 2.8, .0, 1), (.65, 2.9, .18, 1.05), (0, 3.5, -.12, 1), (0, 2.7, -.65, .95)]):
        color = ['Blossom', 'BlossomLight', 'Blossom', 'BlossomLight'][j] if blossom else ['Leaf', 'LeafLight', 'LeafLight', 'LeafDark'][j]
        ico('Blossom crown' if blossom else 'Sculpted tree crown', (x + dx * scale, .45 + dy * scale, z + dz * scale), (r * scale, .82 * r * scale, r * scale), color, 2)
    for i in range(3):
        ico('Tree-root stones', (x + math.sin(i * 2.1) * .32, .55, z + math.cos(i * 2.1) * .32), (.3, .15, .24), 'Earth')

for x, z, scale, blossom in [(-4.3, -4.5, .85, True), (-2.2, -8.8, .72, True), (9.5, -2.4, 1.25, False), (6, 1.4, 1.1, True), (11.6, .1, .8, False), (-13, .2, .8, False), (-12, -6, .75, False), (12.6, -4.8, .65, True), (-.2, -9.4, .6, True)]:
    tree(x, z, scale, blossom)

# Moonwell's miniature observatory and harbour pavilion.
x, z = 6.4, -7.8
cylinder('Observatory tower', (x, 1.9, z), .85, 2.9, 'PlasterBlue', .7, vertices=12)
cylinder('Observatory collar', (x, 3.2, z), .93, .18, 'Trim', vertices=12)
cylinder('Observatory roof', (x, 3.85, z), 1.12, 1.2, 'LeafDark', .08, vertices=12)
window(x, 2.2, z + .82, .4, .6)
ico('Observatory star finial', (x, 4.58, z), (.15, .25, .15), 'StarGold', 1)
for x, z in [(5.8, 6.5)]:
    cylinder('Pavilion plinth', (x, .63, z), 1.1, .3, 'Paver', vertices=8)
    for i in range(6):
        a = i * math.tau / 6
        beam('Pavilion column', (x + math.cos(a) * .86, .7, z + math.sin(a) * .86), (x + math.cos(a) * .86, 2.5, z + math.sin(a) * .86), .065, 'Trim')
    cylinder('Pavilion roof', (x, 2.82, z), 1.24, .82, 'RoofDark', .15, vertices=6)
    ico('Pavilion finial', (x, 3.28, z), (.11, .18, .11), 'FlowerGold')

# Beacon centers intentionally remain empty: the game adds their living light.
for beacon in WORLD['beacons']:
    x, z, idx = beacon['x'], beacon['z'], beacon['id']
    cylinder('Lantern %d footing' % idx, (x, .66, z), .32, .38, 'Earth', .25, vertices=8)
    cylinder('Lantern %d post' % idx, (x, 1.38, z), .09, 1.42, 'Metal', vertices=8)
    cylinder('Lantern %d lower tray' % idx, (x, 2.1, z), .37, .12, 'Metal', vertices=6)
    for n in range(4):
        a = n * math.pi / 2 + math.pi / 4
        beam('Lantern %d frame' % idx, (x + math.cos(a) * .27, 2.12, z + math.sin(a) * .27), (x + math.cos(a) * .27, 2.7, z + math.sin(a) * .27), .035, 'Metal')
    cylinder('Lantern %d roof' % idx, (x, 2.86, z), .45, .32, 'Metal', .05, vertices=6)
    ico('Lantern %d finial' % idx, (x, 3.07, z), (.08, .13, .08), 'StarGold')

# The river cascades out of the island into open air.
for i in range(5):
    xx = 1.17 + i * .49
    mesh('Waterfall ribbon', [(xx, .4, 11.72), (xx + .5, .4, 11.72), (xx + .44, -4.9 + .22 * math.sin(i), 12.08), (xx + .02, -5.15, 12.08)], [(3, 2, 1, 0)], 'WaterLight' if i % 2 else 'Water')
for i in range(9):
    x = 1.25 + i * .27
    beam('Waterfall bright thread', (x, .38, 11.75), (x + .06, -4.8, 12.11), .027, 'WaterFoam')
for i in range(13):
    ico('Waterfall mist', (2.4 + math.sin(i * 2) * 1.45, -4.8 + (i % 3) * .15, 12 + math.cos(i * 3) * .35), (.45, .13, .25), 'WaterFoam', 1)
# Quiet ripples and stepping rock edges, none inside playable paths.
for i in range(28):
    x, z = 1.3 + random.random() * 2.2, -10.5 + random.random() * 20.5
    if any(abs(z - bridge['z']) < 1.5 for bridge in WORLD['river']['bridges']):
        continue
    cube('River silver ripple', (x, .43, z), (.12 + random.random() * .4, .016, .045), 'WaterLight')
for i in range(22):
    z = -10.3 + i * .98
    for x in [.94, 3.86]:
        if any(abs(z - bridge['z']) < 1.6 for bridge in WORLD['river']['bridges']):
            continue
        ico('Riverbank stone', (x, .55, z), (.18, .11, .25), 'Earth' if i % 3 else 'CliffLight')

# Intentionally sparse hand-placed flower patches: readable paths stay clear.
for i in range(125):
    x, z = random.uniform(-14.7, 14.7), random.uniform(-10.4, 10.4)
    if (x / 15.3) ** 2 + (z / 11) ** 2 > .95 or .4 < x < 4.3:
        continue
    if any(math.hypot(x - c['x'], z - c['z']) < c['radius'] + .65 for c in WORLD['colliders']):
        continue
    if any(math.hypot(x - b['x'], z - b['z']) < 1.5 for b in WORLD['beacons']):
        continue
    for j in range(3):
        xx, zz = x + math.sin(j * 2) * .15, z + math.cos(j * 2) * .15
        beam('Meadow flower stem', (xx, .46, zz), (xx, .70 + j * .04, zz), .017, 'Leaf')
        ico('Meadow flower', (xx, .74 + j * .04, zz), (.10, .065, .10), ['FlowerGold', 'FlowerPurple', 'FlowerPink'][i % 3])
# Clifftop moss, tiny boulders and hanging ivy soften the diorama silhouette.
for i in range(35):
    a = i * math.tau / 35
    x, z = math.cos(a) * 15.8, math.sin(a) * 11.35
    if .5 < x < 4.1:
        continue
    ico('Mossy edge boulder', (x, .48, z), (.30 + (i % 3) * .15, .3, .35), 'CliffLight' if i % 3 else 'Earth')
    if i % 3 == 0:
        for j in range(4):
            ico('Hanging ivy', (x, -.15 - j * .35, z), (.27 - j * .035, .24, .26), 'LeafLight' if j % 2 else 'Leaf')

# Small harbour deck at the arrival point, bunting and weather vane.
for i in range(9):
    cube('Arrival boardwalk plank', (-9.6 + i * .24, .53, 8.2), (.22, .12, 1.5), 'TimberLight', bevel=.02)
for x in [-9.7, -7.5]:
    beam('Bunting post', (x, .45, 8.6), (x, 2.35, 8.6), .055, 'Timber')
beam('Bunting rope', (-9.7, 2.25, 8.6), (-7.5, 2.25, 8.6), .018, 'Timber')
for i in range(6):
    x = -9.55 + i * .34
    mesh('Welcome pennant', [(x, 2.23, 8.61), (x + .23, 2.23, 8.61), (x + .11, 1.9, 8.61)], [(0, 1, 2)], 'Flag' if i % 2 else 'FlowerGold')

# Nearby island worlds share the editable Blender source and one batched export.
exec(compile((ROOT / 'scripts/build-lantern-satellites.py').read_text(), str(ROOT / 'scripts/build-lantern-satellites.py'), 'exec'))

# Reusable Blender-built keeper, with independently animatable limbs.
active_collection = character_collection
avatar = bpy.data.objects.new('Avatar', None)
active_collection.objects.link(avatar)
parts = []
parts += [cylinder('Keeper coat', (0, .63, 0), .23, .63, 'KeeperCoat', .18, vertices=10, is_static=False)]
parts += [ico('Keeper head', (0, 1.1, .015), (.225, .24, .22), 'KeeperSkin', 2, False)]
parts += [cylinder('Keeper hat brim', (0, 1.27, 0), .34, .065, 'KeeperBoot', vertices=12, is_static=False)]
parts += [cylinder('Keeper hat crown', (0, 1.41, 0), .23, .28, 'KeeperBoot', .17, vertices=10, is_static=False)]
parts += [cube('Keeper scarf', (0, .89, .08), (.42, .12, .32), 'KeeperScarf', bevel=.035, is_static=False)]
parts += [cube('Scarf tail', (-.15, .62, -.21), (.14, .44, .06), 'KeeperScarf', bevel=.025, is_static=False)]
for side in [-1, 1]:
    parts += [ico('Keeper eye', (side * .08, 1.12, .216), (.024, .034, .017), 'KeeperBoot', 2, False)]
    leg = cube('AvatarLegL' if side < 0 else 'AvatarLegR', (side * .13, .21, .015), (.16, .38, .20), 'KeeperBoot', bevel=.035, is_static=False)
    parts.append(leg)
    parts += [beam('Keeper sleeve', (side * .20, .78, 0), (side * .31, .51, .10), .075, 'KeeperCoat', False)]
    parts += [ico('Keeper mitten', (side * .31, .5, .10), (.08, .085, .08), 'KeeperSkin', 1, False)]
parts += [cube('Keeper satchel', (-.24, .56, -.02), (.20, .28, .28), 'Timber', bevel=.04, is_static=False)]
parts += [cylinder('Keeper lantern', (.36, .36, .16), .11, .23, 'LanternGlass', vertices=8, is_static=False)]
for obj in parts:
    obj.parent = avatar
avatar.location = W((WORLD['spawn']['x'], .45, WORLD['spawn']['z']))
active_collection = world_collection

# Ready-to-edit camera and studio lighting stay in the .blend, not the web asset.
for name, position, energy, color, size in [
    ('Late afternoon sun', (-16, 28, 12), 1800, (1, .82, .68), 12),
    ('Soft blue sky', (14, 18, -8), 1300, (.67, .82, 1), 15),
    ('Gentle front fill', (1, 12, 24), 750, (1, .92, .82), 13),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = W(position)
    light.rotation_euler = (Vector(W((0, 0, 0))) - light.location).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('Pastel evening sky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.48, .63, .72, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .65
scene.world = world
camera_data = bpy.data.cameras.new('Village postcard camera')
camera = bpy.data.objects.new('Village postcard camera', camera_data)
scene.collection.objects.link(camera)
camera.location = W((25, 28, 35))
camera.rotation_euler = (Vector(W((0, .4, 0))) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 42
scene.camera = camera
scene.cursor.location = (0, 0, 0)
scene['About Lantern Vale'] = 'An original miniature world modeled in Blender for the tenth game. World coordinates and collision layout: assets/lantern-world.json.'
scene['Rebuild'] = 'blender --background --python scripts/build-lantern-world.py -- --render'
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
(ROOT / 'blender').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'blender/lantern-vale.blend'), compress=True)
if '--render' in sys.argv:
    (ROOT / 'test-results/lantern').mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(ROOT / 'test-results/lantern/blender-world.png')
    bpy.ops.render.render(write_still=True)
    for satellite_camera in satellite_cameras:
        scene.camera = satellite_camera
        scene.render.filepath = str(ROOT / 'test-results/lantern' / (satellite_camera.name.split()[0].lower() + '-blender.png'))
        bpy.ops.render.render(write_still=True)
    scene.camera = camera

# The editable scene above remains unjoined. The GLB below is merged by material.
# This is a modest download and only a few dozen draw calls on a phone.
dynamic_objects = {rotor}
for root in satellite_dynamic:
    dynamic_objects.add(root)
    dynamic_objects.update(root.children_recursive)
static = [obj for obj in world_collection.all_objects if obj.type == 'MESH' and obj not in dynamic_objects]
bpy.ops.object.select_all(action='DESELECT')
for obj in static:
    obj.select_set(True)
bpy.context.view_layer.objects.active = static[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
joined = bpy.context.object
joined.name = 'Village static geometry'
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
for obj in world_collection.all_objects:
    if obj.type == 'MESH' and obj not in dynamic_objects:
        key = obj.data.materials[0].name if obj.data.materials else 'World'
        obj.name = 'Static_' + key
avatar.location = (0, 0, 0)
bpy.ops.object.select_all(action='DESELECT')
for collection in [world_collection, character_collection]:
    for obj in collection.all_objects:
        obj.select_set(True)
path = ROOT / 'assets/lantern-vale.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_extras=False, export_materials='EXPORT', export_normals=True, export_texcoords=False)
triangles = sum(len(obj.data.polygons) for obj in world_collection.all_objects if obj.type == 'MESH')
print('LANTERN_EXPORT', json.dumps({'glb_bytes': path.stat().st_size, 'world_polygons': triangles, 'blend_bytes': (ROOT / 'blender/lantern-vale.blend').stat().st_size, 'rotor': 'WindmillRotor', 'avatar': 'Avatar', 'satellites': [item['id'] for item in WORLD['satellites']]}))
