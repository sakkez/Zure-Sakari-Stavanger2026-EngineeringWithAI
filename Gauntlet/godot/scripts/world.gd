class_name World
extends Node3D
## Procedural slice map: a shrine plaza with dirt trails out to a chapel ruin, tower stump, graveyard,
## camp and lake; rocky outcrops, conifer forest ring, grass and reeds. Ruins/props live in ruins.gd.
## height_at() / resolve() are the gameplay contract.

const SIZE := 132.0
const RES := 220
const WATER_Y := -0.6
const LAKE := Vector2(28.0, -15.0)
const PLAY_R := 45.0
const PLAZA := Vector2(0.0, -7.0)
const PLAZA_R := 9.5
const PLAZA_H := 0.15
const CHAPEL := Vector2(-23.0, -4.0)
const TOWER := Vector2(-15.0, -28.0)
const GRAVES := Vector2(16.0, 15.0)
const CAMP := Vector2(-15.0, 17.0)
const OUTCROPS := [Vector3(-33.0, 22.0, 6.0), Vector3(9.0, -34.0, 5.0), Vector3(36.0, 13.0, 5.5), Vector3(-36.0, -18.0, 5.0)]
## Trails from the plaza out to each landmark (polyline segments).
const TRAILS := [
	[Vector2(0.0, -7.0), Vector2(1.5, 6.0), Vector2(-1.0, 20.0), Vector2(2.0, 40.0)],
	[Vector2(0.0, -7.0), Vector2(-11.0, -5.0), Vector2(-19.0, -4.0)],
	[Vector2(0.0, -7.0), Vector2(-7.0, -17.0), Vector2(-14.0, -24.0)],
	[Vector2(0.0, -7.0), Vector2(10.0, -9.0), Vector2(17.0, -12.0)],
	[Vector2(1.5, 6.0), Vector2(9.0, 10.0), Vector2(14.0, 13.0)],
	[Vector2(1.5, 6.0), Vector2(-7.0, 12.0), Vector2(-13.0, 16.0)],
]

var hills := FastNoiseLite.new()
var detail := FastNoiseLite.new()
var patches := FastNoiseLite.new()
var obstacles: Array[Vector3] = []  # (x, z, radius)
var rock_meshes: Array[Mesh] = []
var foliage_mat: ShaderMaterial
var rock_mat: ShaderMaterial
var fire_lights: Array[OmniLight3D] = []
var ruins: Ruins
var fire_spots: Array = []  # [position, size]
var terrain_mat: ShaderMaterial
var rng := RandomNumberGenerator.new()
var _t := 0.0


func _init() -> void:
	hills.seed = 11
	hills.frequency = 0.016
	hills.fractal_octaves = 4
	detail.seed = 23
	detail.frequency = 0.08
	detail.fractal_octaves = 2
	patches.seed = 5
	patches.frequency = 0.035
	patches.fractal_octaves = 3
	rng.seed = 1234


var _hs := PackedFloat32Array()


## Ground height: bilinear over the baked terrain grid (matches the rendered mesh), raw before build.
func height_at(x: float, z: float) -> float:
	if _hs.is_empty():
		return _height_raw(x, z)
	var step := SIZE / RES
	var fx := clampf((x + SIZE * 0.5) / step, 0.0, RES - 0.001)
	var fz := clampf((z + SIZE * 0.5) / step, 0.0, RES - 0.001)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - i
	var tz := fz - j
	var n1 := RES + 1
	var a := lerpf(_hs[j * n1 + i], _hs[j * n1 + i + 1], tx)
	var b := lerpf(_hs[(j + 1) * n1 + i], _hs[(j + 1) * n1 + i + 1], tx)
	return lerpf(a, b, tz)


func _height_raw(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var r := p.length()
	var h := hills.get_noise_2d(x, z) * 3.0 + detail.get_noise_2d(x, z) * 0.3
	h *= lerpf(0.35, 1.0, smoothstep(10.0, 30.0, r))
	h += smoothstep(40.0, 66.0, r) * 10.0
	for o in OUTCROPS:
		var d := p.distance_to(Vector2(o.x, o.y))
		h += exp(-d * d / (o.z * o.z)) * 2.4
	h -= path_at(x, z) * 0.12
	h = lerpf(h, PLAZA_H, 1.0 - smoothstep(PLAZA_R, PLAZA_R + 5.0, p.distance_to(PLAZA)))
	# lake basin: elongated and noise-warped so the shoreline is organic, not a punched circle
	var q := (p - LAKE).rotated(0.5) * Vector2(0.8, 1.15)
	var dl := q.length() + hills.get_noise_2d(x * 3.0, z * 3.0) * 3.0 + detail.get_noise_2d(x * 0.7, z * 0.7) * 1.5
	return lerpf(h, -2.6, 1.0 - smoothstep(5.0, 14.0, dl))


## 0..1 closeness to a dirt trail (wobbly edges).
func path_at(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var best := 99.0
	for t in TRAILS:
		for i in t.size() - 1:
			var a: Vector2 = t[i]
			var b: Vector2 = t[i + 1]
			var ab := b - a
			var u := clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
			best = minf(best, p.distance_to(a + ab * u))
	var wob := detail.get_noise_2d(x * 1.7, z * 1.7) * 0.9
	return 1.0 - smoothstep(0.9, 2.3, best + wob)


## 0..1 broken flagstone coverage around the shrine.
func flag_at(x: float, z: float) -> float:
	var d := Vector2(x, z).distance_to(PLAZA)
	return 1.0 - smoothstep(6.0, 9.0, d + patches.get_noise_2d(x * 3.0, z * 3.0) * 3.0)


func walkable(x: float, z: float, r := 0.5) -> bool:
	if Vector2(x, z).length() > PLAY_R or height_at(x, z) < WATER_Y - 0.25:
		return false
	for o in obstacles:
		if Vector2(x - o.x, z - o.y).length() < o.z + r:
			return false
	return true


## Slides a mover out of obstacles; refuses deep water and the map edge.
func resolve(old: Vector3, want: Vector3, r: float) -> Vector3:
	var p := Vector2(want.x, want.z)
	for o in obstacles:
		var c := Vector2(o.x, o.y)
		var rr := o.z + r
		var d := p - c
		if d.length_squared() < rr * rr and d.length_squared() > 1e-6:
			p = c + d.normalized() * rr
	if p.length() > PLAY_R:
		p = p.normalized() * PLAY_R
	var h := height_at(p.x, p.y)
	if h < WATER_Y - 0.25:
		return old
	return Vector3(p.x, h, p.y)


func build() -> void:
	_build_terrain()
	_build_water()
	_make_rock_meshes()
	ruins = Ruins.new()
	ruins.world = self
	add_child(ruins)
	ruins.build()
	_build_rocks()
	_build_trees()
	_build_grass()
	_build_reeds()
	_build_bushes()


## True near a landmark or trail, where scatter (rocks, trees, bushes) must not land.
func reserved(x: float, z: float, pad := 0.0) -> bool:
	var p := Vector2(x, z)
	if p.distance_to(PLAZA) < PLAZA_R + 2.0 + pad or path_at(x, z) > 0.2:
		return true
	for c in [CHAPEL, TOWER, GRAVES, CAMP]:
		if p.distance_to(c) < 10.0 + pad:
			return true
	return false


func set_zone(c: Vector3, r: float, nc: Vector3, nr: float) -> void:
	terrain_mat.set_shader_parameter("zone", Vector4(c.x, c.z, r, 1.0))
	terrain_mat.set_shader_parameter("zone_next", Vector3(nc.x, nc.z, nr))


func set_player_pos(p: Vector3) -> void:
	foliage_mat.set_shader_parameter("player_pos", p)


func _process(dt: float) -> void:
	_t += dt
	for i in fire_lights.size():
		var l := fire_lights[i]
		var base: float = l.get_meta("base", 3.0)
		l.light_energy = base * (1.0 + sin(_t * 13.0 + i * 3.0) * 0.1 + sin(_t * 23.0 + i) * 0.07)


func _noise_tex(freq: float, seed_i: int, normal := false) -> NoiseTexture2D:
	var t := NoiseTexture2D.new()
	var n := FastNoiseLite.new()
	n.seed = seed_i
	n.frequency = freq
	n.fractal_octaves = 4
	t.noise = n
	t.seamless = true
	t.width = 512
	t.height = 512
	t.as_normal_map = normal
	t.bump_strength = 6.0
	t.generate_mipmaps = true
	return t


func _tex(name: String, kind: String) -> Texture2D:
	return load("res://assets/tex/%s_%s_1k.jpg" % [name, kind])


# --- terrain -------------------------------------------------------------------------------

## Splat weights: r forest floor, g mud / trail, b rock, a flagstone.
func _splat(x: float, z: float, h: float, ny: float) -> Color:
	var p := patches.get_noise_2d(x, z)
	var r := Vector2(x, z).length()
	var ground := smoothstep(0.05, 0.3, p) + smoothstep(32.0, 44.0, r) * 0.7
	var mud := 1.0 - smoothstep(WATER_Y + 0.1, WATER_Y + 1.3, h)
	mud = maxf(mud, smoothstep(0.42, 0.55, -p) * 0.6)
	mud = maxf(mud, path_at(x, z))
	var rock := 1.0 - smoothstep(0.72, 0.88, ny)
	for o in OUTCROPS:
		var d := Vector2(x, z).distance_to(Vector2(o.x, o.y))
		rock = maxf(rock, (1.0 - smoothstep(o.z * 0.4, o.z * 0.9, d + p * 3.0)) * 0.9)
	var flag := flag_at(x, z)
	return Color(clampf(ground, 0, 1), clampf(mud * (1.0 - flag), 0, 1), clampf(rock * (1.0 - flag), 0, 1), clampf(flag, 0, 1))


func _build_terrain() -> void:
	var step := SIZE / RES
	var half := SIZE * 0.5
	var n1 := RES + 1
	var hs := PackedFloat32Array()
	hs.resize(n1 * n1)
	for j in n1:
		for i in n1:
			hs[j * n1 + i] = _height_raw(-half + i * step, -half + j * step)
	_hs = hs
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for j in n1:
		for i in n1:
			var x := -half + i * step
			var z := -half + j * step
			var h := hs[j * n1 + i]
			var hl := hs[j * n1 + maxi(i - 1, 0)]
			var hr := hs[j * n1 + mini(i + 1, RES)]
			var hd := hs[maxi(j - 1, 0) * n1 + i]
			var hu := hs[mini(j + 1, RES) * n1 + i]
			var n := Vector3(hl - hr, 2.0 * step, hd - hu).normalized()
			st.set_normal(n)
			st.set_uv(Vector2(x, z) * 0.22)
			st.set_color(_splat(x, z, h, n.y))
			st.add_vertex(Vector3(x, h, z))
	for j in RES:
		for i in RES:
			var a := j * n1 + i
			st.add_index(a)
			st.add_index(a + 1)
			st.add_index(a + n1)
			st.add_index(a + 1)
			st.add_index(a + n1 + 1)
			st.add_index(a + n1)
	st.generate_tangents()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/terrain.gdshader")
	var sets := {"grass": "leafy_grass", "ground": "forrest_ground_01", "mud": "brown_mud_leaves_01", "rock": "rock_face_03", "flag": "monastery_stone_floor"}
	for k in sets:
		mat.set_shader_parameter(k + "_a", _tex(sets[k], "diff"))
		mat.set_shader_parameter(k + "_n", _tex(sets[k], "nor_gl"))
		mat.set_shader_parameter(k + "_r", _tex(sets[k], "rough"))
	mat.set_shader_parameter("noise_tex", _noise_tex(0.01, 3))
	mat.set_shader_parameter("water_y", WATER_Y)
	mi.material_override = mat
	terrain_mat = mat
	add_child(mi)


func _build_water() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(48, 48)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	mi.position = Vector3(LAKE.x, WATER_Y, LAKE.y)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/water.gdshader")
	mat.set_shader_parameter("wave_a", _noise_tex(0.02, 41, true))
	mat.set_shader_parameter("wave_b", _noise_tex(0.035, 42, true))
	mat.set_shader_parameter("foam_noise", _noise_tex(0.03, 43))
	mi.material_override = mat
	add_child(mi)
	var probe := ReflectionProbe.new()
	probe.size = Vector3(60, 30, 60)
	probe.box_projection = false
	probe.update_mode = ReflectionProbe.UPDATE_ONCE
	probe.position = Vector3(LAKE.x, WATER_Y + 2.0, LAKE.y)
	add_child(probe)


# --- rocks ---------------------------------------------------------------------------------

func _rock_point(u: Vector3, n: FastNoiseLite) -> Vector3:
	var d := 1.0 + n.get_noise_3dv(u * 1.3) * 0.42
	# chunky planar facets: pull toward a few cut planes
	d = minf(d, 1.1 - absf(u.y) * 0.25)
	return u * d


func _make_rock_meshes() -> void:
	for k in 4:
		var n := FastNoiseLite.new()
		n.seed = 100 + k
		n.frequency = 0.9
		n.fractal_octaves = 3
		var sm := SphereMesh.new()
		sm.radial_segments = 24
		sm.rings = 14
		var arr := sm.get_mesh_arrays()
		var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var norms: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
		for i in verts.size():
			var u := verts[i].normalized()
			var t1 := u.cross(Vector3.UP if absf(u.y) < 0.95 else Vector3.RIGHT).normalized()
			var t2 := u.cross(t1)
			var p0 := _rock_point(u, n)
			var p1 := _rock_point((u + t1 * 0.03).normalized(), n)
			var p2 := _rock_point((u + t2 * 0.03).normalized(), n)
			var nn := (p1 - p0).cross(p2 - p0).normalized()
			if nn.dot(u) < 0.0:
				nn = -nn
			verts[i] = p0
			norms[i] = nn
		arr[Mesh.ARRAY_VERTEX] = verts
		arr[Mesh.ARRAY_NORMAL] = norms
		arr[Mesh.ARRAY_TANGENT] = null
		var am := ArrayMesh.new()
		am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		rock_meshes.append(am)
	rock_mat = ShaderMaterial.new()
	rock_mat.shader = load("res://shaders/rock.gdshader")
	rock_mat.set_shader_parameter("rock_a", _tex("rock_face_03", "diff"))
	rock_mat.set_shader_parameter("rock_r", _tex("rock_face_03", "rough"))
	rock_mat.set_shader_parameter("moss_a", _tex("mossy_rock", "diff"))


func _multimesh(mesh: Mesh, xforms: Array, colors := []) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors.size() > 0
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
		if mm.use_colors:
			mm.set_instance_color(i, colors[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	add_child(mmi)
	return mmi


func _rock_xf(lists: Array, i: int, x: float, z: float, s: float, stretch := 1.0) -> void:
	var b := Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.RIGHT, rng.randf_range(-0.25, 0.25))
	b = b.scaled(Vector3(s * rng.randf_range(0.9, 1.4) * stretch, s * rng.randf_range(0.55, 0.85), s * rng.randf_range(0.9, 1.3)))
	lists[i % 4].append(Transform3D(b, Vector3(x, height_at(x, z) - s * 0.28, z)))
	if Vector2(x, z).length() < PLAY_R + 2.0 and s > 0.6:
		obstacles.append(Vector3(x, z, s * 0.9))


func _build_rocks() -> void:
	var lists: Array = [[], [], [], []]
	var placed := 0
	# outcrops: clustered, half-buried boulders on the raised mounds
	for o in OUTCROPS:
		for k in 10:
			var a := rng.randf() * TAU
			var r: float = rng.randf_range(0.0, o.z * 0.85)
			var s: float = rng.randf_range(1.3, 3.0) * (1.0 - r / (o.z * 1.7))
			_rock_xf(lists, placed, o.x + cos(a) * r, o.y + sin(a) * r, s, 1.3)
			placed += 1
	var tries := 0
	while placed < 130 and tries < 4000:
		tries += 1
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * 60.0
		var x := cos(a) * r
		var z := sin(a) * r
		if reserved(x, z, -3.0):
			continue
		var h := height_at(x, z)
		var big := r > 42.0 or rng.randf() < 0.1
		var s := rng.randf_range(1.6, 3.4) if big else rng.randf_range(0.3, 0.9)
		var shore := absf(Vector2(x, z).distance_to(LAKE) - 12.0) < 2.5
		if h < WATER_Y - 0.2 and not shore:
			continue
		_rock_xf(lists, placed, x, z, s)
		placed += 1
	for k in 4:
		var mmi := _multimesh(rock_meshes[k], lists[k])
		mmi.material_override = rock_mat


# --- trees ---------------------------------------------------------------------------------

## One needle tier: a star-cut drooping skirt (alternating long/short branch tips) with a dark underside.
func _cone_tier(st: SurfaceTool, y0: float, hh: float, rad: float, segs: int, r: RandomNumberGenerator, shade: float) -> void:
	var apex := Vector3(r.randf_range(-0.05, 0.05), y0 + hh, r.randf_range(-0.05, 0.05))
	var ring: Array[Vector3] = []
	var mids: Array[Vector3] = []
	for s in segs:
		var a := s * TAU / segs + r.randf_range(-0.06, 0.06)
		var long := s % 2 == 0
		var rr := rad * (1.0 if long else 0.62) * r.randf_range(0.82, 1.12)
		var droop := (0.35 if long else 0.1) * rad * r.randf_range(0.6, 1.2)
		ring.append(Vector3(cos(a) * rr, y0 - droop, sin(a) * rr))
		mids.append(Vector3(cos(a) * rr * 0.55, y0 + hh * 0.42, sin(a) * rr * 0.55))
	var inner := Vector3(0, y0 + hh * 0.2, 0)
	var dark := Color(0.035, 0.06, 0.04) * shade
	var mid_c := Color(0.07, 0.11, 0.06) * shade
	var tip := Color(0.14, 0.18, 0.08) * shade
	for s in segs:
		var p0 := ring[s]
		var p1 := ring[(s + 1) % segs]
		var m0 := mids[s]
		var m1 := mids[(s + 1) % segs]
		var c0 := tip if s % 2 == 0 else mid_c
		var c1 := tip if (s + 1) % 2 == 0 else mid_c
		var tris := [[apex, mid_c * 1.15, m0, mid_c, m1, mid_c], [m0, mid_c, p0, c0, p1, c1], [m0, mid_c, p1, c1, m1, mid_c]]
		for q in tris:
			for k in 3:
				var pv: Vector3 = q[k * 2]
				st.set_color(q[k * 2 + 1])
				st.set_normal(Vector3(pv.x, rad * 0.7 + (pv.y - y0) * 0.5, pv.z).normalized())
				st.add_vertex(pv)
		for v in [[inner, dark * 0.6], [p1, dark], [p0, dark]]:
			st.set_color(v[1])
			st.set_normal(Vector3.DOWN)
			st.add_vertex(v[0])


func _bark_mat(tint: Color) -> StandardMaterial3D:
	var bark := StandardMaterial3D.new()
	bark.albedo_texture = _tex("pine_bark", "diff")
	bark.normal_enabled = true
	bark.normal_texture = _tex("pine_bark", "nor_gl")
	bark.roughness = 0.92
	bark.albedo_color = tint
	return bark


func _trunk(st: SurfaceTool, from: Vector3, to: Vector3, r0: float, r1: float, segs: int) -> void:
	var axis := (to - from).normalized()
	var side := axis.cross(Vector3.UP if absf(axis.y) < 0.95 else Vector3.RIGHT).normalized()
	var up := side.cross(axis)
	var length := from.distance_to(to)
	for s in segs:
		var a0 := s * TAU / segs
		var a1 := (s + 1) * TAU / segs
		for q in [[a0, 0.0], [a1, 0.0], [a1, 1.0], [a0, 0.0], [a1, 1.0], [a0, 1.0]]:
			var a: float = q[0]
			var t: float = q[1]
			var dir := side * cos(a) + up * sin(a)
			st.set_uv(Vector2(a / TAU * 2.0, t * length * 0.5))
			st.set_normal(dir)
			st.add_vertex(from.lerp(to, t) + dir * lerpf(r0, r1, t))


func _make_conifer(seed_i: int) -> ArrayMesh:
	var r := RandomNumberGenerator.new()
	r.seed = seed_i
	var height := r.randf_range(8.0, 11.5)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_trunk(st, Vector3(0, -0.3, 0), Vector3(0, height * 0.92, 0), 0.32, 0.05, 7)
	st.generate_tangents()
	var mesh := st.commit()
	mesh.surface_set_material(0, _bark_mat(Color(0.62, 0.58, 0.52)))
	var sf := SurfaceTool.new()
	sf.begin(Mesh.PRIMITIVE_TRIANGLES)
	var tiers := r.randi_range(9, 11)
	var shade := r.randf_range(0.8, 1.15)
	for t in tiers:
		var f := float(t) / (tiers - 1)
		var y0 := lerpf(1.5, height * 0.84, f)
		var hh := lerpf(2.0, 1.3, f)
		var rad := lerpf(2.4, 0.45, pow(f, 0.8)) * r.randf_range(0.88, 1.12)
		_cone_tier(sf, y0, hh, rad, 18, r, shade * lerpf(0.8, 1.2, f))
	sf.commit(mesh)
	mesh.surface_set_material(1, foliage_mat)
	return mesh


func _branch(st: SurfaceTool, from: Vector3, dir: Vector3, length: float, rad: float, depth: int, r: RandomNumberGenerator) -> void:
	var to := from + dir * length
	_trunk(st, from, to, rad, rad * 0.55, 5)
	if depth <= 0:
		return
	var n := r.randi_range(2, 3)
	for i in n:
		var d := (dir + Vector3(r.randf_range(-0.9, 0.9), r.randf_range(-0.1, 0.6), r.randf_range(-0.9, 0.9))).normalized()
		_branch(st, from.lerp(to, r.randf_range(0.55, 1.0)), d, length * r.randf_range(0.5, 0.7), rad * 0.5, depth - 1, r)


func _make_dead_tree(seed_i: int) -> ArrayMesh:
	var r := RandomNumberGenerator.new()
	r.seed = seed_i
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var lean := Vector3(r.randf_range(-0.15, 0.15), 1, r.randf_range(-0.15, 0.15)).normalized()
	_branch(st, Vector3(0, -0.3, 0), lean, r.randf_range(4.0, 5.5), 0.28, 3, r)
	st.generate_tangents()
	var mesh := st.commit()
	mesh.surface_set_material(0, _bark_mat(Color(0.42, 0.4, 0.38)))
	return mesh


func _build_trees() -> void:
	foliage_mat = ShaderMaterial.new()
	foliage_mat.shader = load("res://shaders/foliage.gdshader")
	var meshes: Array[ArrayMesh] = []
	for k in 4:
		meshes.append(_make_conifer(500 + k))
	var lists: Array = [[], [], [], []]
	var groves := [Vector2(-31, 8), Vector2(-5, 31), Vector2(28, 28), Vector2(14, -29), Vector2(-30, -27), Vector2(25, 2)]
	var count := 0
	var tries := 0
	while count < 380 and tries < 8000:
		tries += 1
		var x: float
		var z: float
		if rng.randf() < 0.7:
			var a := rng.randf() * TAU
			var r := rng.randf_range(37.0, 64.0)
			x = cos(a) * r
			z = sin(a) * r
		else:
			var g: Vector2 = groves[rng.randi() % groves.size()]
			x = g.x + rng.randfn(0.0, 3.6)
			z = g.y + rng.randfn(0.0, 3.6)
		if Vector2(x, z).distance_to(LAKE) < 15.0 or reserved(x, z, -1.0):
			continue
		var crowded := false
		for o in obstacles:
			if Vector2(x - o.x, z - o.y).length() < o.z + 1.3:
				crowded = true
				break
		if crowded:
			continue
		var s := rng.randf_range(0.75, 1.25)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s * rng.randf_range(0.9, 1.15), s))
		lists[count % 4].append(Transform3D(b, Vector3(x, height_at(x, z) - 0.1, z)))
		obstacles.append(Vector3(x, z, 0.55 * s))
		count += 1
	for k in 4:
		_multimesh(meshes[k], lists[k])
	# dead trees around the graveyard, tower and lake shore
	var dead: Array[ArrayMesh] = [_make_dead_tree(900), _make_dead_tree(901), _make_dead_tree(902)]
	var dl: Array = [[], [], []]
	var spots := [GRAVES + Vector2(7, 3), GRAVES + Vector2(-6, 7), TOWER + Vector2(6, -3), TOWER + Vector2(-7, 4),
		LAKE + Vector2(-13, 6), LAKE + Vector2(-9, -11), CAMP + Vector2(-7, -3), CHAPEL + Vector2(-5, 9), Vector2(-20, -16), Vector2(12, 3)]
	for i in spots.size():
		var p: Vector2 = spots[i]
		var s := rng.randf_range(0.85, 1.2)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * s)
		dl[i % 3].append(Transform3D(b, Vector3(p.x, height_at(p.x, p.y), p.y)))
		obstacles.append(Vector3(p.x, p.y, 0.4))
	for k in 3:
		_multimesh(dead[k], dl[k])


# --- grass, reeds, bushes ------------------------------------------------------------------

func _make_clump() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var r := RandomNumberGenerator.new()
	r.seed = 77
	for b in 9:
		var a := r.randf() * TAU
		var o := Vector3(r.randf_range(-0.22, 0.22), 0, r.randf_range(-0.22, 0.22))
		var side := Vector3(cos(a), 0, sin(a)) * 0.045
		var lean := Vector3(-sin(a), 0, cos(a)) * r.randf_range(0.1, 0.35)
		var hgt := r.randf_range(0.6, 1.0)
		var nrm := Vector3(-sin(a), 0.5, cos(a)).normalized()
		var pts := [
			[o - side, 0.0], [o + side, 0.0],
			[o - side * 0.6 + lean * 0.3 + Vector3(0, hgt * 0.5, 0), 0.5], [o + side * 0.6 + lean * 0.3 + Vector3(0, hgt * 0.5, 0), 0.5],
			[o + lean + Vector3(0, hgt, 0), 1.0],
		]
		for t in [[0, 1, 2], [1, 3, 2], [2, 3, 4]]:
			for idx in t:
				st.set_uv(Vector2(0, pts[idx][1]))
				st.set_normal(nrm)
				st.add_vertex(pts[idx][0])
	return st.commit()


func _slope_y(x: float, z: float) -> float:
	var e := 0.6
	return Vector3(height_at(x - e, z) - height_at(x + e, z), 2.0 * e, height_at(x, z - e) - height_at(x, z + e)).normalized().y


func _build_grass() -> void:
	var mesh := _make_clump()
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/grass.gdshader")
	mesh.surface_set_material(0, mat)
	var xf: Array = []
	var cols: Array = []
	var dens := FastNoiseLite.new()
	dens.seed = 9
	dens.frequency = 0.06
	var tries := 0
	while xf.size() < 34000 and tries < 160000:
		tries += 1
		var x := rng.randf_range(-52.0, 52.0)
		var z := rng.randf_range(-52.0, 52.0)
		if Vector2(x, z).length() > 52.0:
			continue
		var pth := path_at(x, z)
		var edge := pth > 0.05 and pth < 0.35  # tufts crowd the trail edges
		if not edge and dens.get_noise_2d(x, z) < -0.05 + rng.randf() * 0.25:
			continue
		var h := height_at(x, z)
		var sp := _splat(x, z, h, _slope_y(x, z))
		if h < WATER_Y + 0.35 or sp.b > 0.3 or sp.g > 0.5 or sp.r > 0.85 or sp.a > 0.35:
			continue
		var s := rng.randf_range(0.35, 0.72) * (1.0 - sp.r * 0.4)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s * rng.randf_range(0.8, 1.3), s))
		xf.append(Transform3D(b, Vector3(x, h - 0.04, z)))
		var dry := rng.randf()
		cols.append(Color(0.9, 0.95, 0.85).lerp(Color(1.25, 1.1, 0.75), dry * dry) * rng.randf_range(0.85, 1.1))
	var mmi := _multimesh(mesh, xf, cols)
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _build_reeds() -> void:
	var mesh := _make_clump()
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/grass.gdshader")
	mat.set_shader_parameter("base_col", Color(0.07, 0.08, 0.03))
	mat.set_shader_parameter("tip_col", Color(0.42, 0.36, 0.17))
	mesh.surface_set_material(0, mat)
	var xf: Array = []
	var cols: Array = []
	var tries := 0
	while xf.size() < 900 and tries < 20000:
		tries += 1
		var a := rng.randf() * TAU
		var r := rng.randf_range(9.0, 14.0)
		var x := LAKE.x + cos(a) * r
		var z := LAKE.y + sin(a) * r
		var h := height_at(x, z)
		if h < WATER_Y - 0.4 or h > WATER_Y + 0.5:
			continue
		var s := rng.randf_range(0.5, 0.8)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s * 0.8, s * rng.randf_range(2.0, 3.0), s * 0.8))
		xf.append(Transform3D(b, Vector3(x, h - 0.05, z)))
		cols.append(Color(1, 1, 1) * rng.randf_range(0.8, 1.15))
	_multimesh(mesh, xf, cols)


func _build_bushes() -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.36, 0.15)
	mat.roughness = 0.95
	mat.backlight_enabled = true
	mat.backlight = Color(0.12, 0.16, 0.04)
	mat.albedo_texture = _noise_tex(0.08, 61)
	mat.uv1_triplanar = true
	mat.uv1_scale = Vector3(0.6, 0.6, 0.6)
	var lists: Array = [[], []]
	var count := 0
	var tries := 0
	while count < 120 and tries < 6000:
		tries += 1
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * 46.0
		var x := cos(a) * r
		var z := sin(a) * r
		if reserved(x, z, -5.0) or path_at(x, z) > 0.05 or height_at(x, z) < WATER_Y + 0.3:
			continue
		# bushes gather at the foot of trees, rocks and ruins
		var near := false
		var inside := false
		for o in obstacles:
			var d := Vector2(x - o.x, z - o.y).length()
			if d < o.z + 0.3:
				inside = true
				break
			if d < o.z + 2.5:
				near = true
		if inside or (not near and rng.randf() > 0.15):
			continue
		var s := rng.randf_range(0.5, 1.1)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s * 1.3, s * 0.75, s * 1.2))
		lists[count % 2].append(Transform3D(b, Vector3(x, height_at(x, z) + s * 0.15, z)))
		count += 1
	for k in 2:
		var mmi := _multimesh(rock_meshes[k + 2], lists[k])
		mmi.material_override = mat
