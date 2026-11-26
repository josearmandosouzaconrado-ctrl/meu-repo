"""Block layout of the C-47 Skytrain (Dakota) used both for the walkable
block-built plane (exported to JS) and for the flying entity model.

Plane-local coordinates: +x = nose (forward), +y = up, +z = starboard (right).
Cell (x, y, z) is the block occupying [x, x+1) x [y, y+1) x [z, z+1).
The fuselage centre line is z = 0.5 (cells z and -z are mirror images).
"""

# key -> (list of candidate block ids, optional states, model RGB)
BLOCKS = {
    'hull':    (['minecraft:green_terracotta'], None, (78, 84, 46)),
    'hull2':   (['minecraft:green_terracotta'], None, (70, 76, 41)),
    'white':   (['minecraft:white_concrete'], None, (228, 228, 222)),
    'black':   (['minecraft:black_concrete'], None, (24, 24, 24)),
    'glass':   (['minecraft:glass'], None, (118, 148, 160)),
    'floor':   (['minecraft:spruce_planks'], None, (104, 78, 52)),
    'seat':    (['minecraft:smooth_stone_slab', 'minecraft:stone_block_slab'], None, (150, 150, 150)),
    'chain':   (['minecraft:chain'], {'pillar_axis': 'x'}, (60, 60, 60)),
    'light':   (['minecraft:pearlescent_froglight', 'minecraft:glowstone'], None, (230, 210, 200)),
    'jl':      (['minecraft:red_concrete'], None, (160, 30, 30)),       # jump light
    'panel':   (['minecraft:polished_blackstone', 'minecraft:blackstone', 'minecraft:black_concrete'], None, (35, 32, 36)),
    'cargo':   (['minecraft:barrel'], None, (110, 80, 50)),
    'pack':    (['minecraft:green_wool'], None, (84, 109, 27)),
    'barrier': (['minecraft:barrier'], None, None),
    'dark':    (None, None, (18, 20, 16)),   # model only (door opening)
}

cells = {}
air = set()


def put(x, y, z, k):
    cells[(x, y, z)] = k
    air.discard((x, y, z))


def hollow_section(x, zin, y0, y1):
    """Fuselage ring: interior |z|<=zin, y0..y1 is air, one-block shell around
    with the four corners cut for a rounded look."""
    for z in range(-zin - 1, zin + 2):
        for y in range(y0 - 1, y1 + 2):
            inside = abs(z) <= zin and y0 <= y <= y1
            corner = abs(z) == zin + 1 and (y == y0 - 1 or y == y1 + 1)
            if inside:
                air.add((x, y, z)); cells.pop((x, y, z), None)
            elif not corner:
                put(x, y, z, 'hull')


def solid_section(x, zin, y0, y1, key='hull', cut=True):
    for z in range(-zin, zin + 1):
        for y in range(y0, y1 + 1):
            if cut and abs(z) == zin and zin > 0 and (y == y0 or y == y1):
                continue
            put(x, y, z, key)


def build():
    cells.clear(); air.clear()
    # ---- main cabin x = 1..16 -------------------------------------------
    for x in range(1, 17):
        hollow_section(x, 2, 1, 4)
        for z in range(-2, 3):
            put(x, 0, z, 'floor')
    # rear bulkhead (white = first invasion stripe band)
    solid_section(0, 3, 0, 5, 'white')
    # cockpit bulkhead with a small passage
    solid_section(17, 3, 0, 5, 'hull2')
    for y in (1, 2):
        air.add((17, y, 0)); cells.pop((17, y, 0), None)
    # ---- cockpit x = 18..21 ---------------------------------------------
    for x in (18, 19):
        hollow_section(x, 2, 1, 3)
        for z in range(-2, 3):
            put(x, 0, z, 'floor')
    hollow_section(20, 1, 1, 3)
    put(20, 0, 0, 'floor'); put(20, 0, -1, 'floor'); put(20, 0, 1, 'floor')
    for z in (-1, 0, 1):
        put(20, 1, z, 'panel')
    solid_section(21, 2, 0, 4, 'hull')
    for z in (-1, 0, 1):
        for y in (2, 3):
            put(21, y, z, 'glass')
    # side cockpit windows
    for x in (18, 19):
        put(x, 3, -3, 'glass'); put(x, 3, 3, 'glass')
    solid_section(22, 1, 0, 3, 'hull')
    put(23, 1, 0, 'black'); put(23, 2, 0, 'black')
    # ---- tail ----------------------------------------------------------------
    stripes = {-4: 'white', -3: 'black', -2: 'white', -1: 'black'}
    for x, (zin, y0, y1) in {-1: (2, 1, 5), -2: (2, 1, 5), -3: (2, 2, 5), -4: (2, 2, 5),
                             -5: (1, 3, 5), -6: (1, 3, 5), -7: (1, 4, 5), -8: (1, 4, 5),
                             -9: (0, 4, 5)}.items():
        solid_section(x, zin, y0, y1, stripes.get(x, 'hull'))
    # vertical fin + rudder
    for x, top in {-10: 11, -9: 11, -8: 11, -7: 10, -6: 8, -5: 7}.items():
        for y in range(6, top + 1):
            put(x, y, 0, 'hull')
    # horizontal stabilisers
    for x, span in {-6: 5, -7: 7, -8: 7, -9: 6}.items():
        for z in range(-span, span + 1):
            if (x, 5, z) not in cells:
                put(x, 5, z, 'hull')
    # ---- wings (low wing at y = 0) ------------------------------------------
    chord = {3: (7, 13), 4: (7, 13), 5: (7, 13), 6: (7, 12), 7: (7, 12), 8: (7, 12),
             9: (8, 12), 10: (8, 12), 11: (8, 12), 12: (8, 11), 13: (8, 11), 14: (8, 11),
             15: (9, 11), 16: (9, 10)}
    wing_stripes = {10: 'white', 11: 'black', 12: 'white', 13: 'black', 14: 'white'}
    for az, (x0, x1) in chord.items():
        for z in (az, -az):
            for x in range(x0, x1 + 1):
                put(x, 0, z, wing_stripes.get(az, 'hull'))
    # ---- engine nacelles -----------------------------------------------------
    for zs in ((5, 6), (-6, -5)):
        for z in zs:
            for x in range(8, 15):
                for y in (0, 1):
                    put(x, y, z, 'hull2')
            put(14, 0, z, 'black'); put(14, 1, z, 'black')
            for x in range(9, 13):
                put(x, -1, z, 'hull2')
    # ---- cabin details -------------------------------------------------------
    # cargo door (port side, z = -3), x = 2..3, y = 1..3
    for x in (2, 3):
        for y in (1, 2, 3):
            air.add((x, y, -3)); cells.pop((x, y, -3), None)
    # windows
    for x in (5, 7, 9, 11, 13, 15):
        put(x, 3, -3, 'glass'); put(x, 3, 3, 'glass')
    # jump lights either side of the door
    put(1, 4, -3, 'jl'); put(4, 4, -3, 'jl')
    # ceiling lights
    for x in (3, 8, 13):
        put(x, 5, 0, 'light')
    # bucket seats
    for x in range(4, 16):
        put(x, 1, -2, 'seat')
    for x in range(1, 16):
        put(x, 1, 2, 'seat')
    # static line cable
    for x in range(1, 17):
        put(x, 4, -1, 'chain')
    # para-packs / equipment bundles near the cockpit
    put(16, 1, -2, 'cargo'); put(16, 1, 2, 'cargo'); put(16, 2, 2, 'pack'); put(16, 2, -2, 'pack')
    put(15, 1, 2, 'cargo')
    # pilot seats
    put(19, 1, -1, 'seat'); put(19, 1, 1, 'seat')
    # belly (olive drab underneath the cabin floor)
    for x in range(-1, 22):
        for z in range(-2, 3):
            if (x, -1, z) not in cells:
                put(x, -1, z, 'hull')


build()

META = {
    'center': [7.0, 2.0, 0.5],                     # model origin / entity anchor
    'player_seat': [12.5, 1.5, 2.5],
    'player_face': [12.5, 1.6, -3.0],
    'ai_seats': [[x + 0.5, 1.5, -1.5] for x in range(5, 11)] + [[x + 0.5, 1.5, 2.5] for x in range(5, 11)],
    'ai_face_port': -0.0,  # soldiers on port seats face +z (aisle), starboard face -z
    'queue': [[4.5 + k, 1.0, -0.5] for k in range(14)],
    'door_inside': [3.0, 1.0, -1.6],
    'door': [2.9, 1.0, -2.6],
    'door_out': [2.9, 1.0, -4.4],
    'jumpmaster': [1.5, 1.0, -1.5],
    'pilots': [[19.5, 1.5, -0.5], [19.5, 1.5, 1.5]],
    'props': [[15.25, 1.0, 6.0], [15.25, 1.0, -5.0]],
    'jump_lights': [[1, 4, -3], [4, 4, -3]],
    'door_cells': [[x, y, -3] for x in (2, 3) for y in (1, 2, 3)],
    'bounds': {'min': [-10, -1, -16], 'max': [23, 11, 16]},
}


def as_js():
    keys = sorted({k for k in cells.values()})
    lines = ['// GERADO AUTOMATICAMENTE por tools/build.py - layout de blocos do C-47', '']
    blockdefs = {k: {'ids': BLOCKS[k][0], 'states': BLOCKS[k][1]} for k in keys if BLOCKS[k][0]}
    import json
    lines.append('export const PLANE_BLOCKS = ' + json.dumps(blockdefs) + ';')
    flat = []
    for (x, y, z), k in sorted(cells.items()):
        flat.append([x, y, z, k])
    lines.append('export const PLANE_CELLS = ' + json.dumps(flat, separators=(',', ':')) + ';')
    lines.append('export const PLANE_AIR = ' + json.dumps(sorted(list(air)), separators=(',', ':')) + ';')
    lines.append('export const PLANE_META = ' + json.dumps(META) + ';')
    return '\n'.join(lines) + '\n'


def model_grid():
    """Solid voxel grid for the entity model (interior filled, door dark)."""
    grid = dict((p, k if k != 'floor' else 'hull') for p, k in cells.items()
                if k not in ('barrier', 'chain', 'seat', 'cargo', 'pack', 'light'))
    for p in air:
        grid[p] = 'dark' if p[2] == -3 or (p[2] == -2 and p[0] in (2, 3)) else 'hull'
    for x in range(1, 17):          # interior volume solid
        for y in range(1, 5):
            for z in range(-2, 3):
                if grid.get((x, y, z)) in (None, 'hull'):
                    grid[(x, y, z)] = 'dark' if (z == -2 and x in (2, 3)) else 'hull'
    for x in (2, 3):
        for y in (1, 2, 3):
            grid[(x, y, -3)] = 'dark'
    return grid
