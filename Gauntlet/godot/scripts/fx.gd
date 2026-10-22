class_name FX
extends Node3D
## GPU-particle spell effects, decals, light flashes and floating damage numbers.

var game
var noise: NoiseTexture2D
var flame_mat: ShaderMaterial
var glow_mat: ShaderMaterial
var spark_mat: ShaderMaterial
var smoke_mat: ShaderMaterial
var scorch_tex: ImageTexture
var ember_tex: ImageTexture
var ring_tex: ImageTexture
var fill_tex: ImageTexture
var frost_tex: ImageTexture
var lava_mat: StandardMaterial3D
var ice_mat: StandardMaterial3D


func _ready() -> void:
	noise = NoiseTexture2D.new()
	var n := FastNoiseLite.new()
	n.frequency = 0.012
	n.fractal_octaves = 4
	noise.noise = n
	noise.seamless = true
	noise.width = 256
	noise.height = 256
	flame_mat = _add_mat(0.75, 1.4, 1.7)
	glow_mat = _add_mat(0.15, 2.2, 1.2)
	spark_mat = _add_mat(0.0, 3.0, 6.0)
	smoke_mat = ShaderMaterial.new()
	smoke_mat.shader = load("res://shaders/fx_smoke.gdshader")
	smoke_mat.set_shader_parameter("noise_tex", noise)
	scorch_tex = _radial(Color(0.02, 0.018, 0.015, 0.95), Color(0.08, 0.06, 0.045, 0.0), 0.35, 0.15, 1.0)
	ember_tex = _embers()
	ring_tex = _ring(Color(1.0, 0.45, 0.12))
	fill_tex = _radial(Color(1.0, 0.35, 0.08, 0.5), Color(1.0, 0.3, 0.05, 0.25), 0.05, 0.85, 0.95)
	frost_tex = _radial(Color(0.75, 0.9, 1.0, 0.85), Color(0.5, 0.75, 1.0, 0.0), 0.45, 0.3, 1.0)
	lava_mat = StandardMaterial3D.new()
	lava_mat.albedo_color = Color(0.12, 0.06, 0.04)
	lava_mat.emission_enabled = true
	lava_mat.emission = Color(1.0, 0.35, 0.08)
	lava_mat.emission_energy_multiplier = 3.5
	lava_mat.emission_texture = noise
	ice_mat = StandardMaterial3D.new()
	ice_mat.albedo_color = Color(0.7, 0.88, 1.0, 0.82)
	ice_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ice_mat.roughness = 0.08
	ice_mat.metallic = 0.2
	ice_mat.emission_enabled = true
	ice_mat.emission = Color(0.35, 0.65, 1.0)
	ice_mat.emission_energy_multiplier = 0.9
	ice_mat.rim_enabled = true
	ice_mat.rim = 0.8


func _add_mat(breakup: float, softness: float, boost: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/fx_add.gdshader")
	m.set_shader_parameter("noise_tex", noise)
	m.set_shader_parameter("breakup", breakup)
	m.set_shader_parameter("softness", softness)
	m.set_shader_parameter("boost", boost)
	return m


# --- procedural decal textures ---------------------------------------------------------------

func _radial(inner: Color, outer: Color, noise_amt: float, from: float, to: float) -> ImageTexture:
	var s := 128
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var n := FastNoiseLite.new()
	n.frequency = 0.05
	n.fractal_octaves = 4
	for y in s:
		for x in s:
			var p := Vector2(x, y) / (s - 1) * 2.0 - Vector2.ONE
			var r := p.length() + n.get_noise_2d(x, y) * noise_amt
			var c := inner.lerp(outer, clampf(r, 0.0, 1.0))
			c.a = c.a * (1.0 - smoothstep(from, to, r)) if r < 1.0 else 0.0
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _embers() -> ImageTexture:
	var s := 128
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var n := FastNoiseLite.new()
	n.frequency = 0.09
	n.noise_type = FastNoiseLite.TYPE_CELLULAR
	n.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
	for y in s:
		for x in s:
			var p := Vector2(x, y) / (s - 1) * 2.0 - Vector2.ONE
			var cracks := 1.0 - smoothstep(0.0, 0.12, n.get_noise_2d(x, y) + 0.5)
			var a := cracks * (1.0 - smoothstep(0.1, 0.8, p.length()))
			img.set_pixel(x, y, Color(1.0, 0.4, 0.08) * a)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _ring(c: Color) -> ImageTexture:
	var s := 256
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	for y in s:
		for x in s:
			var r := (Vector2(x, y) / (s - 1) * 2.0 - Vector2.ONE).length()
			var a := smoothstep(0.86, 0.94, r) * (1.0 - smoothstep(0.95, 1.0, r))
			a += (1.0 - smoothstep(0.0, 0.9, r)) * 0.12 * (1.0 if r < 0.95 else 0.0)
			img.set_pixel(x, y, Color(c.r, c.g, c.b, clampf(a, 0.0, 1.0)))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


# --- building blocks -------------------------------------------------------------------------

func _grad(stops: Array) -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array(stops.map(func(s): return s[0]))
	g.colors = PackedColorArray(stops.map(func(s): return s[1]))
	var t := GradientTexture1D.new()
	t.gradient = g
	return t


func _curve(pts: Array) -> CurveTexture:
	var c := Curve.new()
	for p in pts:
		c.add_point(p)
	var t := CurveTexture.new()
	t.curve = c
	return t


## Creates a GPU particle emitter from a compact option dictionary.
func emitter(o: Dictionary) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = o.get("amount", 16)
	p.lifetime = o.get("life", 1.0)
	p.one_shot = o.get("one_shot", true)
	p.explosiveness = o.get("explode", 1.0)
	p.randomness = 0.6
	p.local_coords = o.get("local", false)
	p.visibility_aabb = AABB(Vector3(-25, -10, -25), Vector3(50, 40, 50))
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var m := ParticleProcessMaterial.new()
	m.direction = o.get("dir", Vector3.UP)
	m.spread = o.get("spread", 180.0)
	m.initial_velocity_min = o.get("vmin", 1.0)
	m.initial_velocity_max = o.get("vmax", 3.0)
	m.gravity = o.get("gravity", Vector3.ZERO)
	m.damping_min = o.get("damp", 0.0)
	m.damping_max = o.get("damp", 0.0) * 1.3
	m.scale_min = o.get("smin", 0.5)
	m.scale_max = o.get("smax", 1.0)
	m.angle_min = 0.0
	m.angle_max = 360.0
	m.angular_velocity_min = -o.get("spin", 40.0)
	m.angular_velocity_max = o.get("spin", 40.0)
	m.radial_velocity_min = o.get("radial", 0.0)
	m.radial_velocity_max = o.get("radial", 0.0) * 1.15
	if o.has("ring"):
		m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
		m.emission_ring_axis = Vector3.UP
		m.emission_ring_radius = o.ring
		m.emission_ring_inner_radius = o.ring * 0.7
		m.emission_ring_height = 0.1
	elif o.has("box"):
		m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		m.emission_box_extents = o.box
	else:
		m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		m.emission_sphere_radius = o.get("radius", 0.2)
	m.scale_curve = _curve(o.get("curve", [Vector2(0, 0.6), Vector2(0.3, 1.0), Vector2(1, 0.2)]))
	m.color_ramp = _grad(o.colors)
	p.process_material = m
	var q := QuadMesh.new()
	q.size = Vector2.ONE * o.get("size", 1.0)
	q.material = o.get("mat", flame_mat)
	p.draw_pass_1 = q
	return p


func spawn(p: GPUParticles3D, pos: Vector3, parent: Node = null) -> GPUParticles3D:
	(parent if parent else self).add_child(p)
	p.global_position = pos
	p.emitting = true
	if p.one_shot:
		get_tree().create_timer(p.lifetime + 0.6).timeout.connect(p.queue_free)
	return p


func flash(pos: Vector3, color: Color, energy: float, rng: float, dur: float) -> void:
	var l := OmniLight3D.new()
	l.light_volumetric_fog_energy = 0.0
	l.light_color = color
	l.light_energy = energy
	l.omni_range = rng
	l.omni_attenuation = 1.6
	add_child(l)
	l.global_position = pos
	var tw := create_tween()
	tw.tween_property(l, "light_energy", 0.0, dur).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_callback(l.queue_free)


func decal(pos: Vector3, size: float, tex: Texture2D, color: Color, life: float, emission: Texture2D = null, glow := 0.0) -> Decal:
	var d := Decal.new()
	d.size = Vector3(size, 4.0, size)
	d.texture_albedo = tex
	d.modulate = color
	d.upper_fade = 0.25
	d.lower_fade = 0.25
	d.cull_mask = 1
	if emission:
		d.texture_emission = emission
		d.emission_energy = glow
	add_child(d)
	d.global_position = pos
	d.rotation.y = randf() * TAU
	var tw := create_tween()
	if emission:
		tw.parallel().tween_property(d, "emission_energy", 0.0, life * 0.5)
	tw.tween_interval(life * 0.6)
	tw.tween_property(d, "modulate:a", 0.0, life * 0.4)
	tw.tween_callback(d.queue_free)
	return d


# --- palettes --------------------------------------------------------------------------------

const FIRE := [[0.0, Color(1.0, 0.78, 0.42, 0.8)], [0.25, Color(1.0, 0.45, 0.1, 0.7)], [0.6, Color(0.75, 0.16, 0.03, 0.5)], [1.0, Color(0.3, 0.04, 0.01, 0.0)]]
const SPARKS := [[0.0, Color(1.0, 0.9, 0.6, 1.0)], [0.5, Color(1.0, 0.5, 0.1, 1.0)], [1.0, Color(0.8, 0.2, 0.02, 0.0)]]
const SMOKE := [[0.0, Color(0.26, 0.22, 0.19, 0.0)], [0.12, Color(0.24, 0.21, 0.18, 0.5)], [1.0, Color(0.34, 0.33, 0.32, 0.0)]]
const DUST := [[0.0, Color(0.36, 0.3, 0.22, 0.0)], [0.1, Color(0.38, 0.32, 0.24, 0.55)], [1.0, Color(0.42, 0.38, 0.32, 0.0)]]
const FROST := [[0.0, Color(0.9, 0.97, 1.0, 1.0)], [0.35, Color(0.45, 0.75, 1.0, 0.8)], [1.0, Color(0.15, 0.35, 0.9, 0.0)]]
const ARCANE := [[0.0, Color(0.95, 0.85, 1.0, 1.0)], [0.4, Color(0.65, 0.35, 1.0, 0.8)], [1.0, Color(0.3, 0.1, 0.8, 0.0)]]
const NECRO := [[0.0, Color(0.8, 1.0, 0.75, 1.0)], [0.3, Color(0.35, 0.95, 0.45, 0.8)], [0.7, Color(0.35, 0.15, 0.6, 0.45)], [1.0, Color(0.15, 0.05, 0.3, 0.0)]]
const SOUL := [[0.0, Color(0.7, 1.0, 0.95, 1.0)], [0.5, Color(0.2, 0.8, 0.9, 0.7)], [1.0, Color(0.05, 0.3, 0.5, 0.0)]]


# --- spell effects ---------------------------------------------------------------------------

## A flying fireball: hot core, glow halo, flame + smoke trails and a moving light.
func fireball_visual(pal: Array = FIRE, core_col := Color(1.0, 0.7, 0.35)) -> Node3D:
	var root := Node3D.new()
	add_child(root)
	var core := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.24
	sm.height = 0.48
	core.mesh = sm
	var cm := StandardMaterial3D.new()
	cm.albedo_color = Color.BLACK
	cm.emission_enabled = true
	cm.emission = core_col
	cm.emission_energy_multiplier = 9.0
	core.material_override = cm
	core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(core)
	var halo := emitter({"amount": 6, "life": 0.25, "one_shot": false, "explode": 0.0, "local": true, "vmin": 0.0, "vmax": 0.2,
		"smin": 1.6, "smax": 2.0, "size": 1.0, "mat": glow_mat, "colors": [[0.0, Color(core_col, 0.0)], [0.3, Color(core_col, 0.7)], [1.0, Color(core_col, 0.0)]]})
	root.add_child(halo)
	halo.emitting = true
	var trail := emitter({"amount": 90, "life": 0.4, "one_shot": false, "explode": 0.0, "vmin": 0.2, "vmax": 1.0, "radius": 0.18,
		"smin": 0.5, "smax": 0.9, "size": 1.0, "gravity": Vector3(0, 1.5, 0), "colors": pal,
		"curve": [Vector2(0, 1.0), Vector2(1, 0.15)]})
	root.add_child(trail)
	trail.emitting = true
	var smoke := emitter({"amount": 30, "life": 1.1, "one_shot": false, "explode": 0.0, "vmin": 0.1, "vmax": 0.5, "radius": 0.2,
		"smin": 0.6, "smax": 1.1, "size": 1.0, "gravity": Vector3(0, 0.8, 0), "mat": smoke_mat, "colors": SMOKE,
		"curve": [Vector2(0, 0.4), Vector2(1, 1.4)]})
	root.add_child(smoke)
	smoke.emitting = true
	var l := OmniLight3D.new()
	l.light_volumetric_fog_energy = 0.0
	l.light_color = core_col
	l.light_energy = 4.0
	l.omni_range = 7.0
	root.add_child(l)
	root.set_meta("trails", [halo, trail, smoke])
	root.set_meta("core", core)
	root.set_meta("light", l)
	return root


## Stops a projectile visual: trails finish in place, then the node frees itself.
func retire(root: Node3D) -> void:
	for t in root.get_meta("trails", []):
		t.emitting = false
	if root.has_meta("core"):
		(root.get_meta("core") as Node3D).visible = false
	if root.has_meta("light"):
		(root.get_meta("light") as Node3D).visible = false
	get_tree().create_timer(1.3).timeout.connect(root.queue_free)


func explosion(pos: Vector3, s := 1.0) -> void:
	var up := pos + Vector3(0, 0.4, 0)
	spawn(emitter({"amount": int(40 * s), "life": 0.7, "vmin": 2.0 * s, "vmax": 6.5 * s, "damp": 7.0, "radius": 0.3 * s,
		"gravity": Vector3(0, 2.5, 0), "smin": 0.9 * s, "smax": 1.8 * s, "size": 1.3, "colors": FIRE,
		"curve": [Vector2(0, 0.5), Vector2(0.2, 1.0), Vector2(1, 0.3)]}), up)
	spawn(emitter({"amount": 2, "life": 0.3, "vmin": 0.0, "vmax": 0.0, "smin": 3.0 * minf(s, 1.5), "smax": 3.4 * minf(s, 1.5), "size": 1.0, "mat": glow_mat,
		"colors": [[0.0, Color(1, 0.6, 0.25, 0.55)], [1.0, Color(1, 0.3, 0.05, 0.0)]], "curve": [Vector2(0, 0.5), Vector2(1, 1.2)]}), up)
	spawn(emitter({"amount": int(28 * s), "life": 0.8, "vmin": 5.0, "vmax": 11.0 * s, "dir": Vector3.UP, "spread": 75.0,
		"gravity": Vector3(0, -14, 0), "smin": 0.08, "smax": 0.16, "size": 1.0, "mat": spark_mat, "colors": SPARKS,
		"curve": [Vector2(0, 1.0), Vector2(1, 0.3)]}), up)
	spawn(emitter({"amount": int(14 * s), "life": 2.4, "explode": 0.85, "vmin": 0.6, "vmax": 2.2 * s, "dir": Vector3.UP, "spread": 70.0,
		"damp": 1.2, "radius": 0.5 * s, "gravity": Vector3(0, 0.9, 0), "smin": 1.4 * s, "smax": 2.6 * s, "size": 1.0, "mat": smoke_mat,
		"colors": SMOKE, "curve": [Vector2(0, 0.4), Vector2(1, 1.6)]}), up)
	flash(pos + Vector3(0, 1.6, 0), Color(1.0, 0.55, 0.2), 7.0 * minf(s, 1.3), 6.0 + 2.0 * s, 0.45)
	decal(pos, 3.2 * s, scorch_tex, Color(1, 1, 1, 0.85), 7.0, ember_tex, 2.5)
	if game:
		game.add_shake(0.12 * s)


func frost_nova(pos: Vector3, radius: float) -> void:
	var up := pos + Vector3(0, 0.25, 0)
	spawn(emitter({"amount": 140, "life": 0.7, "vmin": 0.0, "vmax": 0.3, "radial": radius * 1.9, "damp": radius * 2.6, "ring": 0.5,
		"smin": 0.4, "smax": 0.9, "size": 1.0, "mat": glow_mat, "colors": FROST, "curve": [Vector2(0, 1.0), Vector2(1, 0.4)]}), up)
	spawn(emitter({"amount": 40, "life": 1.6, "vmin": 0.0, "vmax": 0.4, "radial": radius * 1.2, "damp": 2.5, "ring": 0.6,
		"gravity": Vector3(0, 0.3, 0), "smin": 1.2, "smax": 2.2, "size": 1.0, "mat": smoke_mat,
		"colors": [[0.0, Color(0.7, 0.85, 1.0, 0.0)], [0.15, Color(0.75, 0.88, 1.0, 0.45)], [1.0, Color(0.8, 0.9, 1.0, 0.0)]]}), up)
	spawn(emitter({"amount": 50, "life": 1.0, "vmin": 2.0, "vmax": 6.0, "dir": Vector3.UP, "spread": 80.0, "radius": radius * 0.6,
		"gravity": Vector3(0, -6, 0), "smin": 0.08, "smax": 0.15, "size": 1.0, "mat": spark_mat, "colors": FROST}), up)
	flash(pos + Vector3(0, 1.5, 0), Color(0.45, 0.7, 1.0), 7.0, radius * 2.0, 0.7)
	decal(pos, radius * 2.2, frost_tex, Color(1, 1, 1, 0.9), 3.5)
	# ice spikes erupting in a ring
	for i in 16:
		var a := i * TAU / 16.0 + randf_range(-0.15, 0.15)
		var r := randf_range(radius * 0.35, radius * 0.9)
		var p := pos + Vector3(cos(a) * r, 0, sin(a) * r)
		if game:
			p.y = game.world.height_at(p.x, p.z)
		var spike := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.0
		cm.bottom_radius = randf_range(0.14, 0.26)
		cm.height = randf_range(0.9, 1.7)
		cm.radial_segments = 5
		cm.rings = 1
		spike.mesh = cm
		spike.material_override = ice_mat
		add_child(spike)
		spike.global_position = p
		spike.rotation = Vector3(randf_range(-0.4, 0.4), randf() * TAU, randf_range(-0.4, 0.4))
		spike.scale = Vector3(1, 0.01, 1)
		var tw := create_tween()
		tw.tween_interval(r / radius * 0.12)
		tw.tween_property(spike, "scale", Vector3.ONE, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_interval(1.4)
		tw.tween_property(spike, "scale", Vector3(1, 0.01, 1), 0.35)
		tw.tween_callback(spike.queue_free)
	if game:
		game.add_shake(0.08)


## Meteor: red telegraph, a burning rock falling in from the sky, then a huge impact.
func meteor(target: Vector3, radius: float, delay: float, rock: Mesh) -> void:
	var ring := decal(target, radius * 2.0, ring_tex, Color(1, 1, 1, 1), delay + 0.3)
	ring.emission_energy = 0.0
	var fill := Decal.new()
	fill.size = Vector3(0.1, 4.0, 0.1)
	fill.texture_albedo = fill_tex
	add_child(fill)
	fill.global_position = target
	var tw := create_tween()
	tw.tween_property(fill, "size", Vector3(radius * 2.0, 4.0, radius * 2.0), delay)
	tw.tween_callback(fill.queue_free)
	var m := MeshInstance3D.new()
	m.mesh = rock
	m.material_override = lava_mat
	m.scale = Vector3.ONE * 1.1
	add_child(m)
	var start := target + Vector3(-9.0, 34.0, 7.0)
	m.global_position = start
	var trail := emitter({"amount": 120, "life": 0.55, "one_shot": false, "explode": 0.0, "vmin": 0.3, "vmax": 1.5, "radius": 0.8,
		"smin": 1.2, "smax": 2.2, "size": 1.0, "colors": FIRE, "curve": [Vector2(0, 1.0), Vector2(1, 0.2)]})
	var smoke := emitter({"amount": 50, "life": 1.6, "one_shot": false, "explode": 0.0, "vmin": 0.2, "vmax": 0.8, "radius": 0.8,
		"smin": 1.5, "smax": 2.6, "size": 1.0, "mat": smoke_mat, "colors": SMOKE, "curve": [Vector2(0, 0.6), Vector2(1, 1.6)]})
	for e in [trail, smoke]:
		m.add_child(e)
	var l := OmniLight3D.new()
	l.light_volumetric_fog_energy = 0.0
	l.light_color = Color(1.0, 0.5, 0.2)
	l.light_energy = 6.0
	l.omni_range = 14.0
	m.add_child(l)
	var fall := create_tween()
	fall.tween_interval(maxf(delay - 0.6, 0.0))
	fall.tween_callback(_set_emitting.bind([trail, smoke], true))
	fall.tween_property(m, "global_position", target, 0.6).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	fall.parallel().tween_property(m, "rotation", Vector3(4.0, 2.0, 1.0), 0.6)
	fall.tween_callback(_meteor_impact.bind(target, radius, rock, m, [trail, smoke]))


func _set_emitting(list: Array, on: bool) -> void:
	for e in list:
		e.emitting = on


func _meteor_impact(target: Vector3, radius: float, rock: Mesh, m: Node3D, trails: Array) -> void:
	explosion(target, 2.3)
	decal(target, radius * 2.0, scorch_tex, Color(1, 1, 1, 0.95), 10.0, ember_tex, 5.0)
	_debris(target, rock)
	spawn(emitter({"amount": 60, "life": 1.4, "vmin": 0.0, "vmax": 0.3, "radial": 11.0, "damp": 7.0, "ring": 1.0,
		"gravity": Vector3(0, 0.5, 0), "smin": 1.4, "smax": 2.4, "size": 1.0, "mat": smoke_mat, "colors": DUST}), target + Vector3(0, 0.3, 0))
	if game:
		game.add_shake(0.55)
	m.visible = false
	_set_emitting(trails, false)
	get_tree().create_timer(1.8).timeout.connect(m.queue_free)


func _debris_step(t: float, d: Node3D, from: Vector3, end: Vector3, peak: float) -> void:
	if is_instance_valid(d):
		d.global_position = from.lerp(end, t) + Vector3(0, sin(t * PI) * peak, 0)
		d.rotation += Vector3(0.2, 0.15, 0.1)


func _debris(pos: Vector3, rock: Mesh) -> void:
	for i in 10:
		var d := MeshInstance3D.new()
		d.mesh = rock
		d.material_override = lava_mat if i % 3 == 0 else (game.world.rock_mat if game else lava_mat)
		d.scale = Vector3.ONE * randf_range(0.12, 0.26)
		add_child(d)
		d.global_position = pos + Vector3(0, 0.5, 0)
		var a := randf() * TAU
		var dist := randf_range(2.5, 6.0)
		var end := pos + Vector3(cos(a) * dist, 0, sin(a) * dist)
		if game:
			end.y = game.world.height_at(end.x, end.z) + 0.05
		var peak := randf_range(2.0, 4.5)
		var from := d.global_position
		var tw := create_tween()
		tw.tween_method(_debris_step.bind(d, from, end, peak), 0.0, 1.0, randf_range(0.6, 0.9))
		tw.tween_interval(3.0)
		tw.tween_property(d, "scale", Vector3.ZERO, 0.6)
		tw.tween_callback(d.queue_free)


func blink(from: Vector3, to: Vector3) -> void:
	for p in [from, to]:
		spawn(emitter({"amount": 40, "life": 0.6, "vmin": 1.0, "vmax": 4.0, "damp": 4.0, "radius": 0.5, "gravity": Vector3(0, 2, 0),
			"smin": 0.3, "smax": 0.7, "size": 1.0, "mat": glow_mat, "colors": ARCANE}), p + Vector3(0, 1.0, 0))
		flash(p + Vector3(0, 1.2, 0), Color(0.6, 0.35, 1.0), 4.0, 6.0, 0.4)
	var mid := (from + to) * 0.5 + Vector3(0, 1.0, 0)
	var e := emitter({"amount": 50, "life": 0.5, "vmin": 0.0, "vmax": 0.5, "box": Vector3(0.15, 0.3, from.distance_to(to) * 0.5),
		"smin": 0.15, "smax": 0.35, "size": 1.0, "mat": spark_mat, "colors": ARCANE})
	add_child(e)
	e.global_position = mid
	if from.distance_to(to) > 0.1:
		e.look_at(to + Vector3(0, 1.0, 0), Vector3.UP)
	e.emitting = true
	get_tree().create_timer(1.2).timeout.connect(e.queue_free)


func cast_glow(parent: Node3D, color_stops: Array) -> void:
	var e := emitter({"amount": 24, "life": 0.45, "vmin": 0.5, "vmax": 1.5, "radius": 0.35, "gravity": Vector3(0, 2, 0),
		"smin": 0.2, "smax": 0.45, "size": 1.0, "mat": glow_mat, "colors": color_stops, "local": true})
	parent.add_child(e)
	e.position = Vector3(0, 1.4, 0.5)
	e.emitting = true
	get_tree().create_timer(1.0).timeout.connect(e.queue_free)


func necro_burst(pos: Vector3) -> void:
	spawn(emitter({"amount": 30, "life": 0.6, "vmin": 1.5, "vmax": 4.5, "damp": 5.0, "radius": 0.25, "gravity": Vector3(0, 1.5, 0),
		"smin": 0.4, "smax": 0.9, "size": 1.0, "mat": glow_mat, "colors": NECRO}), pos)
	spawn(emitter({"amount": 8, "life": 1.6, "vmin": 0.3, "vmax": 1.2, "radius": 0.3, "gravity": Vector3(0, 0.6, 0),
		"smin": 0.9, "smax": 1.6, "size": 1.0, "mat": smoke_mat,
		"colors": [[0.0, Color(0.15, 0.2, 0.15, 0.0)], [0.15, Color(0.16, 0.22, 0.16, 0.45)], [1.0, Color(0.2, 0.2, 0.22, 0.0)]]}), pos)
	flash(pos + Vector3(0, 0.8, 0), Color(0.4, 1.0, 0.5), 3.0, 5.0, 0.35)


func dust(pos: Vector3) -> void:
	spawn(emitter({"amount": 18, "life": 1.6, "vmin": 0.4, "vmax": 1.6, "dir": Vector3.UP, "spread": 60.0, "radius": 0.6, "damp": 1.0,
		"gravity": Vector3(0, 0.4, 0), "smin": 1.0, "smax": 1.8, "size": 1.0, "mat": smoke_mat, "colors": DUST}), pos + Vector3(0, 0.2, 0))
	spawn(emitter({"amount": 16, "life": 0.9, "vmin": 0.5, "vmax": 2.0, "dir": Vector3.UP, "spread": 30.0, "radius": 0.4,
		"gravity": Vector3(0, 1.0, 0), "smin": 0.15, "smax": 0.3, "size": 1.0, "mat": glow_mat, "colors": SOUL}), pos + Vector3(0, 0.3, 0))


func brazier_fire(pos: Vector3, s := 1.0) -> void:
	spawn(emitter({"amount": int(36 * s), "life": 0.7, "one_shot": false, "explode": 0.0, "vmin": 0.6, "vmax": 1.6 * s, "dir": Vector3.UP,
		"spread": 12.0, "radius": 0.3 * s, "gravity": Vector3(0, 1.5, 0), "smin": 0.45, "smax": 0.85, "size": s, "colors": FIRE,
		"curve": [Vector2(0, 0.7), Vector2(0.25, 1.0), Vector2(1, 0.1)]}), pos)
	spawn(emitter({"amount": int(10 * s), "life": 1.8, "one_shot": false, "explode": 0.0, "vmin": 0.8, "vmax": 2.2, "dir": Vector3.UP,
		"spread": 25.0, "radius": 0.3 * s, "gravity": Vector3(0.3, 0.6, 0), "smin": 0.05, "smax": 0.1, "size": 1.0, "mat": spark_mat,
		"colors": SPARKS}), pos)
	spawn(emitter({"amount": 10, "life": 3.0, "one_shot": false, "explode": 0.0, "vmin": 0.5, "vmax": 1.0, "dir": Vector3.UP,
		"spread": 10.0, "radius": 0.2 * s, "gravity": Vector3(0.25, 0.3, 0), "smin": 0.8, "smax": 1.4, "size": s, "mat": smoke_mat,
		"colors": [[0.0, Color(0.2, 0.18, 0.16, 0.0)], [0.2, Color(0.2, 0.18, 0.16, 0.25)], [1.0, Color(0.3, 0.3, 0.3, 0.0)]],
		"curve": [Vector2(0, 0.5), Vector2(1, 1.8)]}), pos + Vector3(0, 0.6, 0))


func damage_number(pos: Vector3, amount: float, color: Color, big := false) -> void:
	var l := Label3D.new()
	l.text = str(int(round(amount)))
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.fixed_size = true
	l.pixel_size = 0.0004 if big else 0.00028
	l.font_size = 40
	l.outline_size = 10
	l.modulate = color
	l.outline_modulate = Color(0.05, 0.02, 0.01, 0.9)
	l.no_depth_test = true
	l.render_priority = 10
	add_child(l)
	l.global_position = pos + Vector3(randf_range(-0.9, 0.9), 2.2 + randf_range(0.0, 0.8), 0)
	var tw := create_tween()
	tw.tween_property(l, "global_position", l.global_position + Vector3(0, 1.6, 0), 0.9).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.9).set_delay(0.35)
	tw.parallel().tween_property(l, "outline_modulate:a", 0.0, 0.9).set_delay(0.35)
	tw.tween_callback(l.queue_free)


# --- melee and archery -----------------------------------------------------------------------

var _crack_tex: ImageTexture
var _gold_ring: ImageTexture


## Annulus sector on the ground plane, UV.x along the arc, UV.y inner->outer.
func _arc_mesh(r0: float, r1: float, span: float, segs := 24) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for s in segs:
		var t0 := float(s) / segs
		var t1 := float(s + 1) / segs
		var a0 := (t0 - 0.5) * span
		var a1 := (t1 - 0.5) * span
		var q := [[a0, r0, t0, 0.0], [a1, r0, t1, 0.0], [a1, r1, t1, 1.0], [a0, r0, t0, 0.0], [a1, r1, t1, 1.0], [a0, r1, t0, 1.0]]
		for v in q:
			st.set_uv(Vector2(v[2], v[3]))
			st.set_normal(Vector3.UP)
			st.add_vertex(Vector3(sin(v[0]) * v[1], 0, cos(v[0]) * v[1]))
	return st.commit()


func _slash_mat(color: Color) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/slash.gdshader")
	m.set_shader_parameter("noise_tex", noise)
	m.set_shader_parameter("color", color)
	return m


func cleave(pos: Vector3, facing: float, sweep: float, reach: float) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = _arc_mesh(reach * 0.55, reach + 0.3, 2.1)
	var m := _slash_mat(Color(1.0, 0.86, 0.62, 0.75))
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	mi.global_position = pos + Vector3(0, 1.0, 0)
	mi.rotation = Vector3(0.12 * sweep, facing, 0)
	mi.scale = Vector3(sweep, 1, 1)
	var tw := create_tween()
	tw.tween_method(func(v: float): m.set_shader_parameter("progress", v), 0.0, 1.3, 0.14)
	tw.tween_method(func(v: float): m.set_shader_parameter("fade", v), 1.0, 0.0, 0.12)
	tw.tween_callback(mi.queue_free)


func hit_spark(pos: Vector3, dir: Vector3) -> void:
	spawn(emitter({"amount": 14, "life": 0.35, "vmin": 4.0, "vmax": 9.0, "dir": (dir + Vector3.UP * 0.4).normalized(), "spread": 40.0,
		"gravity": Vector3(0, -10, 0), "smin": 0.06, "smax": 0.12, "size": 1.0, "mat": spark_mat, "colors": SPARKS}), pos)
	spawn(emitter({"amount": 2, "life": 0.15, "vmin": 0.0, "vmax": 0.0, "smin": 0.9, "smax": 1.1, "size": 1.0, "mat": glow_mat,
		"colors": [[0.0, Color(1, 0.9, 0.7, 0.8)], [1.0, Color(1, 0.6, 0.2, 0.0)]]}), pos)


## Whirlwind: two counter-rotating blade arcs around the hero plus sparks and a dust ring.
func whirlwind(actor: Node3D, dur: float) -> void:
	var root := Node3D.new()
	actor.add_child(root)
	root.position = Vector3(0, 0.9, 0)
	var mats: Array[ShaderMaterial] = []
	for k in 2:
		var mi := MeshInstance3D.new()
		mi.mesh = _arc_mesh(2.0 - k * 0.3, 3.1 - k * 0.4, 4.2)
		var m := _slash_mat(Color(1.0, 0.85, 0.6, 0.8) if k == 0 else Color(0.85, 0.9, 1.0, 0.5))
		m.set_shader_parameter("progress", 1.0)
		mi.material_override = m
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.position.y = k * 0.3
		root.add_child(mi)
		mats.append(m)
	var sparks := emitter({"amount": 40, "life": 0.4, "one_shot": false, "explode": 0.0, "vmin": 3.0, "vmax": 7.0, "radial": 4.0, "ring": 2.6,
		"gravity": Vector3(0, -6, 0), "smin": 0.05, "smax": 0.1, "size": 1.0, "mat": spark_mat, "colors": SPARKS})
	root.add_child(sparks)
	sparks.emitting = true
	var dust_e := emitter({"amount": 12, "life": 0.8, "one_shot": false, "explode": 0.0, "vmin": 0.2, "vmax": 0.8, "radial": 2.0, "ring": 1.8,
		"gravity": Vector3.ZERO, "smin": 0.5, "smax": 0.9, "size": 1.0, "mat": smoke_mat,
		"colors": [[0.0, Color(0.36, 0.3, 0.22, 0.0)], [0.15, Color(0.38, 0.32, 0.24, 0.28)], [1.0, Color(0.42, 0.38, 0.32, 0.0)]]})
	root.add_child(dust_e)
	dust_e.position.y = -0.8
	dust_e.emitting = true
	var tw := create_tween()
	tw.tween_method(_spin_root.bind(root), 0.0, -TAU * 3.0, dur)
	tw.tween_callback(_set_emitting.bind([sparks, dust_e], false))
	for m in mats:
		tw.parallel().tween_method(func(v: float): m.set_shader_parameter("fade", v), 1.0, 0.0, 0.2)
	tw.tween_interval(1.0)
	tw.tween_callback(root.queue_free)


func _cracks() -> ImageTexture:
	if _crack_tex:
		return _crack_tex
	var s := 256
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var r := RandomNumberGenerator.new()
	r.seed = 5
	for k in 11:
		var a := k * TAU / 11.0 + r.randf_range(-0.2, 0.2)
		var p := Vector2(s * 0.5, s * 0.5)
		var width := 4.0
		for step in 60:
			a += r.randf_range(-0.35, 0.35)
			p += Vector2(cos(a), sin(a)) * 2.0
			width = maxf(width * 0.985, 1.0)
			for dy in range(-3, 4):
				for dx in range(-3, 4):
					if Vector2(dx, dy).length() <= width * 0.5:
						var q := Vector2i(int(p.x) + dx, int(p.y) + dy)
						if q.x >= 0 and q.y >= 0 and q.x < s and q.y < s:
							img.set_pixelv(q, Color(0.05, 0.03, 0.02, 0.95))
	var c := Vector2(s * 0.5, s * 0.5)
	for y in s:
		for x in s:
			var d := Vector2(x, y).distance_to(c) / (s * 0.5)
			if d < 0.35:
				var px := img.get_pixel(x, y)
				img.set_pixel(x, y, Color(0.04, 0.03, 0.02, maxf(px.a, (1.0 - d / 0.35) * 0.8)))
	img.generate_mipmaps()
	_crack_tex = ImageTexture.create_from_image(img)
	return _crack_tex


## Earthshatter: cracked ground, rock spikes bursting up in a ring, dust shockwave and debris.
func earthshatter(c: Vector3, radius: float, rock: Mesh) -> void:
	decal(c, radius * 2.2, _cracks(), Color(1, 1, 1, 1), 6.0, ember_tex, 1.5)
	var rmat: Material = game.world.rock_mat if game else lava_mat
	for i in 14:
		var a := i * TAU / 14.0 + randf_range(-0.2, 0.2)
		var r := randf_range(radius * 0.3, radius * 0.85)
		var p := c + Vector3(cos(a), 0, sin(a)) * r
		if game:
			p.y = game.world.height_at(p.x, p.z)
		var spike := MeshInstance3D.new()
		spike.mesh = rock
		spike.material_override = rmat
		add_child(spike)
		spike.global_position = p
		var s := randf_range(0.45, 0.85)
		spike.rotation = Vector3(randf_range(-0.5, 0.5), randf() * TAU, randf_range(-0.5, 0.5))
		spike.scale = Vector3(s * 0.6, 0.01, s * 0.6)
		var tw := create_tween()
		tw.tween_interval(r / radius * 0.1)
		tw.tween_property(spike, "scale", Vector3(s * 0.6, s * 1.6, s * 0.6), 0.1).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_interval(1.5)
		tw.tween_property(spike, "scale", Vector3(s * 0.6, 0.01, s * 0.6), 0.4)
		tw.tween_callback(spike.queue_free)
	spawn(emitter({"amount": 70, "life": 1.3, "vmin": 0.0, "vmax": 0.3, "radial": radius * 2.0, "damp": 5.0, "ring": 0.8,
		"gravity": Vector3(0, 0.6, 0), "smin": 1.2, "smax": 2.2, "size": 1.0, "mat": smoke_mat, "colors": DUST}), c + Vector3(0, 0.3, 0))
	spawn(emitter({"amount": 40, "life": 0.9, "vmin": 4.0, "vmax": 9.0, "dir": Vector3.UP, "spread": 50.0, "radius": radius * 0.5,
		"gravity": Vector3(0, -16, 0), "smin": 0.08, "smax": 0.2, "size": 1.0, "mat": smoke_mat, "colors": DUST}), c)
	flash(c + Vector3(0, 1.0, 0), Color(1.0, 0.6, 0.3), 5.0, radius * 1.8, 0.4)
	if game:
		_debris(c, rock)
		game.add_shake(0.4)


func charge(actor: Node3D, dur: float) -> void:
	var e := emitter({"amount": 30, "life": 0.9, "one_shot": false, "explode": 0.0, "vmin": 0.2, "vmax": 1.0, "radius": 0.4,
		"gravity": Vector3(0, 0.5, 0), "smin": 0.7, "smax": 1.3, "size": 1.0, "mat": smoke_mat, "colors": DUST})
	actor.add_child(e)
	e.position = Vector3(0, 0.3, 0)
	e.emitting = true
	var g := emitter({"amount": 20, "life": 0.3, "one_shot": false, "explode": 0.0, "vmin": 0.0, "vmax": 0.4, "radius": 0.5,
		"smin": 0.4, "smax": 0.8, "size": 1.0, "mat": glow_mat, "colors": [[0.0, Color(1, 0.8, 0.5, 0.0)], [0.3, Color(1, 0.7, 0.4, 0.5)], [1.0, Color(1, 0.5, 0.2, 0.0)]]})
	actor.add_child(g)
	g.position = Vector3(0, 1.0, 0)
	g.emitting = true
	get_tree().create_timer(dur).timeout.connect(_set_emitting.bind([e, g], false))
	get_tree().create_timer(dur + 1.2).timeout.connect(e.queue_free)
	get_tree().create_timer(dur + 1.2).timeout.connect(g.queue_free)


func _arrow_mesh() -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.05, 0.05, 1.0)
	mi.mesh = bm
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.2, 0.15, 0.1)
	m.emission_enabled = true
	m.emission = Color(1.0, 0.85, 0.6)
	m.emission_energy_multiplier = 2.5
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


func arrow_visual() -> Node3D:
	var root := Node3D.new()
	add_child(root)
	var mi := _arrow_mesh()
	root.add_child(mi)
	var trail := emitter({"amount": 30, "life": 0.18, "one_shot": false, "explode": 0.0, "vmin": 0.0, "vmax": 0.1, "radius": 0.05,
		"smin": 0.18, "smax": 0.3, "size": 1.0, "mat": glow_mat, "colors": [[0.0, Color(1, 0.9, 0.7, 0.7)], [1.0, Color(1, 0.6, 0.3, 0.0)]]})
	root.add_child(trail)
	trail.emitting = true
	root.set_meta("trails", [trail])
	root.set_meta("core", mi)
	return root


## A missed bolt stays stuck in the ground for a few seconds, then fades.
func stick_arrow(visual: Node3D, p: Vector3, dir: Vector3) -> void:
	for t in visual.get_meta("trails", []):
		t.emitting = false
	visual.global_position = p - dir * 0.3
	var core: MeshInstance3D = visual.get_meta("core")
	(core.material_override as StandardMaterial3D).emission_energy_multiplier = 0.0
	spawn(emitter({"amount": 6, "life": 0.6, "vmin": 0.3, "vmax": 1.0, "dir": Vector3.UP, "spread": 60.0, "smin": 0.25, "smax": 0.45,
		"size": 1.0, "mat": smoke_mat, "colors": DUST}), p)
	var tw := create_tween()
	tw.tween_interval(3.0)
	tw.tween_property(visual, "scale", Vector3(1, 1, 0.01), 0.4)
	tw.tween_callback(visual.queue_free)


func muzzle(pos: Vector3, pal: Array) -> void:
	spawn(emitter({"amount": 16, "life": 0.25, "vmin": 2.0, "vmax": 5.0, "spread": 60.0, "smin": 0.08, "smax": 0.15, "size": 1.0,
		"mat": spark_mat, "colors": pal}), pos)


## Rain of Arrows: golden telegraph ring, then bolts streak down from the sky over `dur`.
func arrow_rain(c: Vector3, radius: float, dur: float, delay: float) -> void:
	if _gold_ring == null:
		_gold_ring = _ring(Color(1.0, 0.8, 0.35))
	decal(c, radius * 2.0, _gold_ring, Color(1, 1, 1, 1), delay + dur + 0.5)
	for i in 30:
		var t := delay + dur * float(i) / 30.0
		var off := Vector2(randf_range(-1, 1), randf_range(-1, 1)).limit_length(1.0) * radius
		get_tree().create_timer(t).timeout.connect(_rain_arrow.bind(c + Vector3(off.x, 0, off.y)))


func _rain_arrow(p: Vector3) -> void:
	if game:
		p.y = game.world.height_at(p.x, p.z)
	var a := _arrow_mesh()
	add_child(a)
	var start := p + Vector3(-2.5, 14.0, 1.5)
	a.global_position = start
	a.look_at(p, Vector3.UP)
	var tw := create_tween()
	tw.tween_property(a, "global_position", p + (p - start).normalized() * 0.35, 0.22).set_ease(Tween.EASE_IN)
	tw.tween_callback(_rain_land.bind(a, p))
	tw.tween_interval(2.5)
	tw.tween_property(a, "scale", Vector3(1, 1, 0.01), 0.3)
	tw.tween_callback(a.queue_free)


func _spin_root(a: float, root: Node3D) -> void:
	if is_instance_valid(root):
		root.rotation.y = a
		root.get_child(1).rotation.y = -a * 0.6


func _rain_land(a: MeshInstance3D, p: Vector3) -> void:
	(a.material_override as StandardMaterial3D).emission_energy_multiplier = 0.3
	spawn(emitter({"amount": 5, "life": 0.5, "vmin": 0.5, "vmax": 1.5, "dir": Vector3.UP, "spread": 60.0, "smin": 0.25, "smax": 0.4,
		"size": 1.0, "mat": smoke_mat, "colors": DUST}), p)
