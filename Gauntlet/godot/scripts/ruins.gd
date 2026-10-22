class_name Ruins
extends Node3D
## Landmarks and set dressing, merged per material: shrine plaza with pillar ring and obelisk,
## chapel ruin, round tower stump, walled graveyard, war camp, banners along the trails and rubble.
## Registers obstacles, fire lights and fire spots on the world.

var world: World
var rng := RandomNumberGenerator.new()
var stone := SurfaceTool.new()
var wood := SurfaceTool.new()
var iron := SurfaceTool.new()
var canvas := SurfaceTool.new()
var cloth := SurfaceTool.new()
var ember := SurfaceTool.new()
var rubble: Array = []  # Transform3D for rubble chunks

const BOX_FACES := [
	[Vector3.RIGHT, Vector3.UP, Vector3.BACK], [Vector3.LEFT, Vector3.UP, Vector3.FORWARD],
	[Vector3.UP, Vector3.BACK, Vector3.RIGHT], [Vector3.DOWN, Vector3.FORWARD, Vector3.RIGHT],
	[Vector3.BACK, Vector3.UP, Vector3.LEFT], [Vector3.FORWARD, Vector3.UP, Vector3.RIGHT],
]


func build() -> void:
	rng.seed = 4242
	for st in [stone, wood, iron, canvas, cloth, ember]:
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_shrine()
	_chapel()
	_tower()
	_graveyard()
	_camp()
	_banners()
	_commit()


# --- geometry helpers ----------------------------------------------------------------------

func _gy(x: float, z: float) -> float:
	return world.height_at(x, z)


func _v(st: SurfaceTool, p: Vector3, n: Vector3, uv := Vector2.ZERO) -> void:
	st.set_normal(n)
	st.set_color(Color(clampf((p.y - _gy(p.x, p.z)) / 1.8, 0.0, 1.0), 0, 0))
	st.set_uv(uv)
	st.add_vertex(p)


func _box(st: SurfaceTool, xf: Transform3D, size: Vector3) -> void:
	var h := size * 0.5
	for f in BOX_FACES:
		var n: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		var c := n * h
		var pts := [c - u * h - v * h, c + u * h - v * h, c + u * h + v * h, c - u * h + v * h]
		var wn := (xf.basis * n).normalized()
		for i in [0, 1, 2, 0, 2, 3]:
			var lp: Vector3 = pts[i]
			_v(st, xf * lp, wn, Vector2(lp.dot(u), lp.dot(v)))


## Cylinder along local +Y from 0 to h; `jag` randomly breaks the top ring (broken columns).
func _cyl(st: SurfaceTool, xf: Transform3D, r0: float, r1: float, h: float, segs: int, jag := 0.0, caps := true) -> void:
	var tops: Array[float] = []
	for s in segs:
		tops.append(h - rng.randf() * jag)
	for s in segs:
		var a0 := s * TAU / segs
		var a1 := (s + 1) * TAU / segs
		var d0 := Vector3(cos(a0), 0, sin(a0))
		var d1 := Vector3(cos(a1), 0, sin(a1))
		var b0 := d0 * r0
		var b1 := d1 * r0
		var t0 := d0 * r1 + Vector3(0, tops[s], 0)
		var t1 := d1 * r1 + Vector3(0, tops[(s + 1) % segs], 0)
		var n0 := (xf.basis * d0).normalized()
		var n1 := (xf.basis * d1).normalized()
		_v(st, xf * b0, n0)
		_v(st, xf * b1, n1)
		_v(st, xf * t1, n1)
		_v(st, xf * b0, n0)
		_v(st, xf * t1, n1)
		_v(st, xf * t0, n0)
		if caps:
			var up := (xf.basis * Vector3.UP).normalized()
			_v(st, xf * Vector3(0, h - jag * 0.5, 0), up)
			_v(st, xf * t0, up)
			_v(st, xf * t1, up)


func _at(x: float, z: float, y_off := 0.0, yaw := 0.0) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, yaw), Vector3(x, _gy(x, z) + y_off, z))


func _obstacle(x: float, z: float, r: float) -> void:
	world.obstacles.append(Vector3(x, z, r))


func _light(p: Vector3, color: Color, energy: float, rng_m: float) -> void:
	var l := OmniLight3D.new()
	l.light_volumetric_fog_energy = 0.25
	l.light_color = color
	l.light_energy = energy
	l.omni_range = rng_m
	l.omni_attenuation = 1.3
	l.set_meta("base", energy)
	add_child(l)
	l.position = p
	world.fire_lights.append(l)


func _fire(p: Vector3, s: float) -> void:
	world.fire_spots.append([p, s])


func _scatter_rubble(c: Vector2, radius: float, n: int) -> void:
	for i in n:
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * radius
		var x := c.x + cos(a) * r
		var z := c.y + sin(a) * r
		var s := rng.randf_range(0.12, 0.45)
		var b := Basis(Vector3(rng.randf(), rng.randf(), rng.randf()).normalized(), rng.randf() * TAU).scaled(Vector3(s * 1.3, s * 0.7, s))
		rubble.append(Transform3D(b, Vector3(x, _gy(x, z) + s * 0.15, z)))


# --- shrine plaza --------------------------------------------------------------------------

func _pillar(x: float, z: float, kind: String) -> void:
	var y := _gy(x, z)
	var yaw := rng.randf() * TAU
	_box(stone, Transform3D(Basis(Vector3.UP, yaw), Vector3(x, y + 0.2, z)), Vector3(1.15, 0.5, 1.15))
	match kind:
		"full", "lintel":
			var hy := y + 0.45
			for d in 4:
				var off := Vector3(rng.randf_range(-0.03, 0.03), 0, rng.randf_range(-0.03, 0.03))
				_cyl(stone, Transform3D(Basis(Vector3.UP, rng.randf()), Vector3(x, hy, z) + off), 0.42, 0.4, 1.12, 12)
				hy += 1.15
			_box(stone, Transform3D(Basis(Vector3.UP, yaw), Vector3(x, hy + 0.2, z)), Vector3(1.2, 0.42, 1.2))
		"broken":
			var hy := y + 0.45
			var drums := rng.randi_range(1, 3)
			for d in drums:
				var last := d == drums - 1
				_cyl(stone, Transform3D(Basis(Vector3.UP, rng.randf()), Vector3(x, hy, z)), 0.42, 0.4, 1.12, 12, 0.7 if last else 0.0)
				hy += 1.15
			_scatter_rubble(Vector2(x, z), 1.8, 6)
		"stump":
			_cyl(stone, Transform3D(Basis(Vector3.UP, rng.randf()), Vector3(x, y + 0.45, z)), 0.42, 0.4, 0.6, 12, 0.4)
			_scatter_rubble(Vector2(x, z), 2.0, 7)
	_obstacle(x, z, 0.75)


func _shrine() -> void:
	var c := World.PLAZA
	var y := World.PLAZA_H
	# stepped octagonal dais
	_cyl(stone, Transform3D(Basis(Vector3.UP, PI / 8.0), Vector3(c.x, y - 0.2, c.y)), 4.4, 4.4, 0.6, 8)
	_cyl(stone, Transform3D(Basis(Vector3.UP, PI / 8.0), Vector3(c.x, y + 0.4, c.y)), 3.4, 3.4, 0.4, 8)
	_cyl(stone, Transform3D(Basis(Vector3.UP, PI / 8.0), Vector3(c.x, y + 0.8, c.y)), 2.3, 2.3, 0.35, 8)
	# obelisk with pyramidion, slightly leaning
	var lean := Basis(Vector3.FORWARD, 0.04) * Basis(Vector3.UP, PI / 4.0)
	_cyl(stone, Transform3D(lean, Vector3(c.x, y + 1.15, c.y - 0.3)), 0.75, 0.42, 5.6, 4, 0.0, false)
	_cyl(stone, Transform3D(lean, Vector3(c.x, y + 1.15, c.y - 0.3) + lean * Vector3(0, 5.6, 0)), 0.42, 0.02, 0.8, 4)
	# altar with a glowing ember bed
	_box(stone, Transform3D(Basis.IDENTITY, Vector3(c.x, y + 1.6, c.y + 1.3)), Vector3(1.7, 0.9, 0.95))
	_box(ember, Transform3D(Basis.IDENTITY, Vector3(c.x, y + 2.07, c.y + 1.3)), Vector3(1.4, 0.06, 0.7))
	_light(Vector3(c.x, y + 3.0, c.y + 1.6), Color(1.0, 0.42, 0.15), 3.0, 9.0)
	_fire(Vector3(c.x, y + 2.1, c.y + 1.3), 0.6)
	# fire bowls on the lower step corners
	for sx: float in [-1.0, 1.0]:
		var p := Vector3(c.x + sx * 3.0, y + 0.4, c.y + 2.6)
		_cyl(iron, Transform3D(Basis.IDENTITY, p), 0.08, 0.08, 1.0, 6)
		_cyl(iron, Transform3D(Basis.IDENTITY, p + Vector3(0, 1.0, 0)), 0.22, 0.48, 0.3, 10)
		_fire(p + Vector3(0, 1.25, 0), 0.8)
		_light(p + Vector3(0, 2.0, 0), Color(1.0, 0.55, 0.22), 2.6, 9.0)
	_obstacle(c.x, c.y, 4.6)
	# pillar ring with a fallen column and one surviving lintel
	var kinds := ["lintel", "lintel", "broken", "stump", "full", "fallen", "broken", "full", "stump", "broken"]
	var ring_r := 8.0
	for i in kinds.size():
		var a := -PI * 0.5 + i * TAU / kinds.size() + 0.16
		var x := c.x + cos(a) * ring_r
		var z := c.y + sin(a) * ring_r
		if World.PLAZA.distance_to(Vector2(x, z)) > 0 and world.path_at(x, z) > 0.6:
			a += 0.2
			x = c.x + cos(a) * ring_r
			z = c.y + sin(a) * ring_r
		if kinds[i] == "fallen":
			var base := Vector3(x, _gy(x, z), z)
			_box(stone, Transform3D(Basis.IDENTITY, base + Vector3(0, 0.2, 0)), Vector3(1.15, 0.5, 1.15))
			var dir := Vector3(cos(a + 1.9), 0, sin(a + 1.9))
			for d in 4:
				var p := base + dir * (1.0 + d * 1.2) + Vector3(0, 0.38, 0)
				p.y = _gy(p.x, p.z) + 0.36
				_cyl(stone, Transform3D(Basis(Vector3.UP, atan2(dir.x, dir.z)) * Basis(Vector3.RIGHT, PI * 0.5), p - dir * 0.56), 0.42, 0.4, 1.1, 12)
				_obstacle(p.x, p.z, 0.5)
			_scatter_rubble(Vector2(x, z) + Vector2(dir.x, dir.z) * 3.0, 2.5, 8)
			_obstacle(x, z, 0.75)
		else:
			_pillar(x, z, kinds[i])
	# lintel across the first two pillars
	var a0 := -PI * 0.5 + 0.16
	var a1 := a0 + TAU / kinds.size()
	var p0 := Vector3(c.x + cos(a0) * ring_r, 0, c.y + sin(a0) * ring_r)
	var p1 := Vector3(c.x + cos(a1) * ring_r, 0, c.y + sin(a1) * ring_r)
	var top := _gy(p0.x, p0.z) + 0.45 + 4 * 1.15 + 0.62
	var mid := (p0 + p1) * 0.5
	_box(stone, Transform3D(Basis(Vector3.UP, atan2(p1.x - p0.x, p1.z - p0.z)), Vector3(mid.x, top, mid.z)), Vector3(0.8, 0.55, p0.distance_to(p1) + 1.0))
	_scatter_rubble(c, 7.0, 14)


# --- chapel ruin ---------------------------------------------------------------------------

## A broken ashlar wall from a to b (ground-following), with optional gaps [t0, t1, top_of_gap_row].
func _wall(a: Vector2, b: Vector2, height: float, thick: float, gaps := [], noise_seed := 0) -> void:
	var length := a.distance_to(b)
	var dir := (b - a) / length
	var yaw := atan2(dir.x, dir.y)
	var n := FastNoiseLite.new()
	n.seed = noise_seed
	n.frequency = 0.25
	var rows := int(height / 0.55)
	for row in rows:
		var t := (0.4 if row % 2 == 1 else 0.0)
		while t < length:
			var blen := minf(rng.randf_range(0.8, 1.5), length - t)
			if blen < 0.3:
				break
			var mid_t := t + blen * 0.5
			var limit := height * (0.35 + 0.65 * clampf(n.get_noise_1d(mid_t * 0.35) * 1.6 + 0.6, 0.0, 1.0)) + rng.randf_range(-0.15, 0.1)
			var gap := false
			for g in gaps:
				if mid_t > g[0] and mid_t < g[1] and row * 0.55 >= g[2] and row * 0.55 < g[3]:
					gap = true
			if row * 0.55 + 0.55 <= limit and not gap:
				var p := a + dir * mid_t
				var y := _gy(p.x, p.y) - 0.15 + row * 0.55 + 0.275
				var jitter := Vector3(rng.randf_range(-0.04, 0.04), 0, rng.randf_range(-0.04, 0.04))
				_box(stone, Transform3D(Basis(Vector3.UP, yaw + rng.randf_range(-0.03, 0.03)), Vector3(p.x, y, p.y) + jitter),
					Vector3(thick * rng.randf_range(0.92, 1.0), 0.52, blen - 0.04))
			t += blen
	var s := 0.0
	while s < length:
		var p := a + dir * s
		var blocked := true
		for g in gaps:
			if s > g[0] and s < g[1] and g[2] <= 0.0:
				blocked = false
		if blocked:
			_obstacle(p.x, p.y, thick * 0.75)
		s += 0.9
	_scatter_rubble((a + b) * 0.5, length * 0.45, int(length * 0.9))


func _chapel() -> void:
	var c := World.CHAPEL
	var hl := 6.5
	var hw := 4.0
	var nw := c + Vector2(-hl, -hw)
	var ne := c + Vector2(hl, -hw)
	var sw := c + Vector2(-hl, hw)
	var se := c + Vector2(hl, hw)
	# long walls with tall window openings, east facade with a door facing the plaza, west apse wall
	_wall(nw, ne, 5.2, 0.9, [[2.5, 3.6, 1.6, 4.5], [6.0, 7.1, 1.6, 4.5], [9.5, 10.6, 1.6, 4.5]], 1)
	_wall(sw, se, 4.6, 0.9, [[2.5, 3.6, 1.6, 4.5], [9.5, 10.6, 1.6, 4.5]], 2)
	_wall(ne, se, 6.4, 1.0, [[3.0, 5.0, 0.0, 3.3]], 3)
	_wall(sw, nw, 5.6, 1.0, [[3.4, 4.6, 2.2, 5.0]], 4)
	# buttresses
	for i in 4:
		var x := c.x - hl + 1.5 + i * 3.3
		for zs: float in [-1.0, 1.0]:
			var z := c.y + zs * (hw + 0.75)
			_box(stone, Transform3D(Basis.IDENTITY, Vector3(x, _gy(x, z) + 1.2, z)), Vector3(0.8, 2.6 - i * 0.3, 0.7))
			_obstacle(x, z, 0.5)
	# door braziers
	for zs: float in [-1.0, 1.0]:
		var p := Vector3(c.x + hl + 1.6, 0, c.y + zs * 1.8)
		p.y = _gy(p.x, p.z)
		_cyl(stone, Transform3D(Basis.IDENTITY, p), 0.32, 0.26, 1.1, 8)
		_cyl(iron, Transform3D(Basis.IDENTITY, p + Vector3(0, 1.1, 0)), 0.25, 0.5, 0.3, 10)
		_fire(p + Vector3(0, 1.35, 0), 0.75)
		_obstacle(p.x, p.z, 0.5)
	_light(Vector3(c.x + hl + 2.2, _gy(c.x + hl, c.y) + 2.2, c.y), Color(1.0, 0.55, 0.22), 3.0, 10.0)
	_scatter_rubble(c, 5.0, 25)


# --- tower stump ---------------------------------------------------------------------------

func _tower() -> void:
	var c := World.TOWER
	var r := 3.4
	var door_dir := (World.PLAZA - c).normalized()
	var door_a := atan2(door_dir.y, door_dir.x)
	var n := FastNoiseLite.new()
	n.seed = 77
	n.frequency = 0.5
	for row in 14:
		var a := 0.0 if row % 2 == 0 else 0.15
		while a < TAU:
			var step := rng.randf_range(0.8, 1.3) / r
			var mid := a + step * 0.5
			var limit := 3.0 + 4.5 * clampf(n.get_noise_1d(mid * 0.6) * 1.4 + 0.55, 0.0, 1.0) + rng.randf_range(-0.15, 0.1)
			var door := absf(wrapf(mid - door_a, -PI, PI)) < 0.28 and row < 6
			if row * 0.55 + 0.55 <= limit and not door:
				var p := c + Vector2(cos(mid), sin(mid)) * r
				var y := _gy(p.x, p.y) - 0.15 + row * 0.55 + 0.275
				_box(stone, Transform3D(Basis(Vector3.UP, -mid + PI * 0.5), Vector3(p.x, y, p.y)), Vector3(r * step - 0.04, 0.52, 1.0))
			a += step
	for k in 28:
		var a := k * TAU / 28.0
		if absf(wrapf(a - door_a, -PI, PI)) > 0.3:
			var p := c + Vector2(cos(a), sin(a)) * r
			_obstacle(p.x, p.y, 0.7)
	var tp := c + door_dir * (r + 1.2) + Vector2(door_dir.y, -door_dir.x) * 1.4
	var ty := _gy(tp.x, tp.y)
	_cyl(wood, Transform3D(Basis.IDENTITY, Vector3(tp.x, ty, tp.y)), 0.07, 0.05, 2.0, 6)
	_fire(Vector3(tp.x, ty + 2.1, tp.y), 0.45)
	_light(Vector3(tp.x, ty + 2.6, tp.y), Color(1.0, 0.55, 0.22), 2.2, 8.0)
	_scatter_rubble(c, 7.5, 30)


# --- graveyard -----------------------------------------------------------------------------

func _graveyard() -> void:
	var c := World.GRAVES
	for row in 4:
		for col in 5:
			if rng.randf() < 0.18:
				continue
			var x := c.x - 4.4 + col * 2.2 + rng.randf_range(-0.3, 0.3)
			var z := c.y - 3.6 + row * 2.4 + rng.randf_range(-0.2, 0.2)
			var y := _gy(x, z)
			var tilt := Basis(Vector3.UP, rng.randf_range(-0.2, 0.2)) * Basis(Vector3.RIGHT, rng.randf_range(-0.18, 0.12)) * Basis(Vector3.FORWARD, rng.randf_range(-0.12, 0.12))
			var kind := rng.randi() % 3
			if kind == 0:
				_box(stone, Transform3D(tilt, Vector3(x, y + 0.4, z)), Vector3(0.7, 1.0, 0.18))
				_box(stone, Transform3D(tilt, Vector3(x, y + 0.4, z)) * Transform3D(Basis.IDENTITY, Vector3(0, 0.55, 0)), Vector3(0.5, 0.14, 0.18))
			elif kind == 1:
				_box(stone, Transform3D(tilt, Vector3(x, y + 0.6, z)), Vector3(0.17, 1.4, 0.17))
				_box(stone, Transform3D(tilt, Vector3(x, y + 0.6, z)) * Transform3D(Basis.IDENTITY, Vector3(0, 0.35, 0)), Vector3(0.75, 0.17, 0.17))
			else:
				_box(stone, Transform3D(Basis(Vector3.UP, rng.randf_range(-0.1, 0.1)), Vector3(x, y + 0.05, z + 0.9)), Vector3(0.9, 0.2, 1.8))
			_obstacle(x, z, 0.35)
	# low broken boundary wall with a gate toward the trail
	var h := 6.5
	_wall(c + Vector2(-h, -h), c + Vector2(h, -h), 1.4, 0.6, [[5.5, 7.5, 0.0, 9.0]], 11)
	_wall(c + Vector2(h, -h), c + Vector2(h, h), 1.2, 0.6, [], 12)
	_wall(c + Vector2(h, h), c + Vector2(-h, h), 1.4, 0.6, [[4.0, 6.0, 0.0, 9.0]], 13)
	_wall(c + Vector2(-h, h), c + Vector2(-h, -h), 1.1, 0.6, [[2.0, 4.5, 0.0, 9.0], [8.0, 9.5, 0.0, 9.0]], 14)


# --- war camp ------------------------------------------------------------------------------

func _tent(p: Vector2, yaw: float, w: float, d: float, h: float) -> void:
	var xf := _at(p.x, p.y, -0.05, yaw)
	var hw := w * 0.5
	var hd := d * 0.5
	var ridge_f := Vector3(0, h, hd)
	var ridge_b := Vector3(0, h, -hd)
	for side: float in [-1.0, 1.0]:
		var eave_f := Vector3(side * hw, 0, hd)
		var eave_b := Vector3(side * hw, 0, -hd)
		var nrm := (xf.basis * Vector3(side * h, hw, 0)).normalized()
		for q in [ridge_f, eave_f, eave_b, ridge_f, eave_b, ridge_b]:
			_v(canvas, xf * q, nrm)
	var back := (xf.basis * Vector3.FORWARD).normalized()
	for q in [ridge_b, Vector3(-hw, 0, -hd), Vector3(hw, 0, -hd)]:
		_v(canvas, xf * q, back)
	for z: float in [hd + 0.05, -hd - 0.05]:
		_cyl(wood, xf * Transform3D(Basis.IDENTITY, Vector3(0, 0, z)), 0.05, 0.04, h + 0.25, 5)
	_obstacle(p.x, p.y, maxf(w, d) * 0.45)


func _camp() -> void:
	var c := World.CAMP
	# campfire: stone ring, crossed logs, big fire
	for k in 9:
		var a := k * TAU / 9.0
		var p := c + Vector2(cos(a), sin(a)) * 0.9
		_box(stone, Transform3D(Basis(Vector3.UP, a) * Basis(Vector3.RIGHT, rng.randf_range(-0.3, 0.3)), Vector3(p.x, _gy(p.x, p.y) + 0.1, p.y)), Vector3(0.35, 0.25, 0.3))
	for k in 3:
		var a := k * TAU / 3.0 + 0.3
		var xf := _at(c.x, c.y, 0.15, a) * Transform3D(Basis(Vector3.RIGHT, PI * 0.5 - 0.35), Vector3(0, 0, -0.55))
		_cyl(wood, xf, 0.09, 0.07, 1.2, 6)
	_fire(Vector3(c.x, _gy(c.x, c.y) + 0.3, c.y), 1.2)
	_light(Vector3(c.x, _gy(c.x, c.y) + 1.8, c.y), Color(1.0, 0.5, 0.2), 4.0, 12.0)
	_obstacle(c.x, c.y, 1.0)
	# log benches
	for k in 2:
		var a := k * PI + 0.6
		var p := c + Vector2(cos(a), sin(a)) * 2.4
		_cyl(wood, _at(p.x, p.y, 0.2, a) * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.9, 0, 0)), 0.2, 0.2, 1.8, 7)
	_tent(c + Vector2(-4.2, -2.2), 0.5, 2.6, 3.2, 2.0)
	_tent(c + Vector2(3.8, -3.4), -0.4, 2.4, 3.0, 1.9)
	_tent(c + Vector2(-1.0, -5.2), 0.1, 2.2, 2.8, 1.8)
	# crates and barrels
	for k in 5:
		var p := c + Vector2(rng.randf_range(2.5, 5.0), rng.randf_range(0.5, 3.5))
		if rng.randf() < 0.5:
			var s := rng.randf_range(0.6, 0.85)
			_box(wood, _at(p.x, p.y, s * 0.5, rng.randf() * TAU), Vector3(s, s, s))
		else:
			_cyl(wood, _at(p.x, p.y), 0.36, 0.36, 0.9, 10)
		_obstacle(p.x, p.y, 0.45)
	# broken cart
	var cp := c + Vector2(-5.5, 3.0)
	var cyaw := 1.1
	_box(wood, _at(cp.x, cp.y, 0.55, cyaw) * Transform3D(Basis(Vector3.FORWARD, 0.18), Vector3.ZERO), Vector3(1.4, 0.3, 2.4))
	_box(wood, _at(cp.x, cp.y, 0.85, cyaw) * Transform3D(Basis.IDENTITY, Vector3(0.65, 0, 0)), Vector3(0.08, 0.5, 2.4))
	_cyl(wood, _at(cp.x, cp.y, 0.55, cyaw) * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.8, 0, 0.6)), 0.55, 0.55, 0.12, 10)
	var wp := cp + Vector2(1.6, -1.2)
	_cyl(wood, _at(wp.x, wp.y, 0.02, 0.4), 0.55, 0.55, 0.12, 10)
	_obstacle(cp.x, cp.y, 1.3)
	# weapon rack
	var rp := c + Vector2(1.5, 4.0)
	var rx := _at(rp.x, rp.y)
	_box(wood, rx * Transform3D(Basis.IDENTITY, Vector3(0, 1.0, 0)), Vector3(2.0, 0.1, 0.1))
	for sx: float in [-0.9, 0.9]:
		_box(wood, rx * Transform3D(Basis.IDENTITY, Vector3(sx, 0.6, 0)), Vector3(0.1, 1.2, 0.1))
	for k in 5:
		_cyl(iron, rx * Transform3D(Basis(Vector3.RIGHT, -0.25), Vector3(-0.7 + k * 0.35, 0.0, 0.25)), 0.025, 0.02, 2.1, 4)
	_obstacle(rp.x, rp.y, 0.8)
	_scatter_rubble(c, 6.0, 8)


# --- banners -------------------------------------------------------------------------------

func _banner(p: Vector2, yaw: float) -> void:
	var xf := _at(p.x, p.y, 0.0, yaw)
	_cyl(wood, xf, 0.07, 0.05, 4.4, 6)
	_cyl(wood, xf * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.55, 4.0, 0)), 0.035, 0.035, 1.1, 5)
	var w := 0.95
	var top := 3.95
	var bot := 1.7
	var nrm := (xf.basis * Vector3.BACK).normalized()
	var sway := Vector3(0, 0, rng.randf_range(0.05, 0.2))
	var quad := [[Vector3(0.05, top, 0.06), Vector2(0, 0)], [Vector3(0.05 + w, top, 0.06), Vector2(1, 0)],
		[Vector3(0.05 + w, bot, 0.06) + sway, Vector2(1, 1)], [Vector3(0.05, bot, 0.06) + sway, Vector2(0, 1)]]
	for i in [0, 1, 2, 0, 2, 3]:
		_v(cloth, xf * quad[i][0], nrm, quad[i][1])
	_obstacle(p.x, p.y, 0.3)


func _banners() -> void:
	for t in World.TRAILS.slice(0, 4):
		var a: Vector2 = t[0]
		var b: Vector2 = t[1]
		var dir := (b - a).normalized()
		var side := Vector2(dir.y, -dir.x)
		var base := a + dir * (World.PLAZA_R + 1.2)
		_banner(base + side * 2.4, atan2(dir.x, dir.y))
		_banner(base - side * 2.4, atan2(dir.x, dir.y) + PI)
	var cp := World.CHAPEL + Vector2(8.2, 3.4)
	_banner(cp, PI * 0.5)
	_banner(World.CAMP + Vector2(-2.0, 2.8), 0.7)
	_banner(World.CAMP + Vector2(3.0, -0.5), -0.9)


# --- materials & commit --------------------------------------------------------------------

func _banner_tex() -> ImageTexture:
	var w := 64
	var h := 128
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	var n := FastNoiseLite.new()
	n.frequency = 0.08
	for y in h:
		for x in w:
			var u := float(x) / (w - 1)
			var v := float(y) / (h - 1)
			# swallow-tail ragged bottom
			var tail := 0.86 - absf(u - 0.5) * -0.25 - (0.12 if absf(u - 0.5) < 0.18 else 0.0) + n.get_noise_2d(x * 3.0, 0) * 0.05
			if v > tail or n.get_noise_2d(x, y) > 0.55:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
				continue
			var c := Color(0.36, 0.05, 0.04)
			# faded sigil: chevron and ring
			var p := Vector2(u - 0.5, v - 0.4)
			var ring := absf(p.length() - 0.2) < 0.025
			var chev := absf(absf(p.x) * 1.2 - (p.y + 0.12)) < 0.03 and p.y > -0.12 and p.y < 0.18
			if ring or chev:
				c = Color(0.62, 0.48, 0.25)
			if u < 0.06 or u > 0.94 or v < 0.04:
				c = Color(0.2, 0.03, 0.02)
			c = c * (0.85 + n.get_noise_2d(x * 2.0, y * 2.0) * 0.3)
			c.a = 1.0
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _mi(st: SurfaceTool, mat: Material, shadows := true) -> void:
	var mesh := st.commit()
	if mesh.get_surface_count() == 0:
		return
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _commit() -> void:
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/ruin.gdshader")
	sm.set_shader_parameter("brick_a", world._tex("castle_brick_broken_06", "diff"))
	sm.set_shader_parameter("brick_r", world._tex("castle_brick_broken_06", "rough"))
	sm.set_shader_parameter("moss_a", world._tex("mossy_rock", "diff"))
	sm.set_shader_parameter("noise_tex", world._noise_tex(0.02, 71))
	_mi(stone, sm)
	var wm := StandardMaterial3D.new()
	wm.albedo_texture = world._tex("pine_bark", "diff")
	wm.uv1_triplanar = true
	wm.uv1_scale = Vector3(0.8, 0.8, 0.8)
	wm.albedo_color = Color(0.5, 0.4, 0.32)
	wm.roughness = 0.9
	wm.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mi(wood, wm)
	var im := StandardMaterial3D.new()
	im.albedo_color = Color(0.08, 0.075, 0.07)
	im.metallic = 0.85
	im.roughness = 0.45
	im.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mi(iron, im)
	var cm := StandardMaterial3D.new()
	cm.albedo_color = Color(0.36, 0.3, 0.22)
	cm.albedo_texture = world._noise_tex(0.05, 81)
	cm.roughness = 0.95
	cm.cull_mode = BaseMaterial3D.CULL_DISABLED
	cm.backlight_enabled = true
	cm.backlight = Color(0.2, 0.15, 0.08)
	_mi(canvas, cm)
	var bm := StandardMaterial3D.new()
	bm.albedo_texture = _banner_tex()
	bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	bm.alpha_scissor_threshold = 0.5
	bm.cull_mode = BaseMaterial3D.CULL_DISABLED
	bm.roughness = 0.9
	bm.backlight_enabled = true
	bm.backlight = Color(0.35, 0.06, 0.03)
	_mi(cloth, bm)
	var em := StandardMaterial3D.new()
	em.albedo_color = Color(0.1, 0.03, 0.01)
	em.emission_enabled = true
	em.emission = Color(1.0, 0.35, 0.08)
	em.emission_energy_multiplier = 3.0
	em.emission_texture = world._noise_tex(0.15, 91)
	_mi(ember, em, false)
	# rubble chunks share the masonry material
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = world.rock_meshes[0]
	mm.instance_count = rubble.size()
	for i in rubble.size():
		mm.set_instance_transform(i, rubble[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = sm
	add_child(mmi)
