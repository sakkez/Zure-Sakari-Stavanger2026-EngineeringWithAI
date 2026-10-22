class_name Zone
extends Node3D
## Shrinking storm: waits, previews the next circle, then closes in toward a drifting centre.
## Champions outside the storm take damage every half second (mobs ignore it).

const START_R := 52.0
const STAGES := [
	{"r": 1.0, "wait": 40.0, "shrink": 0.0, "dps": 3.0},
	{"r": 0.7, "wait": 32.0, "shrink": 18.0, "dps": 4.0},
	{"r": 0.48, "wait": 28.0, "shrink": 16.0, "dps": 6.0},
	{"r": 0.3, "wait": 24.0, "shrink": 14.0, "dps": 9.0},
	{"r": 0.16, "wait": 20.0, "shrink": 12.0, "dps": 13.0},
	{"r": 0.06, "wait": 9999.0, "shrink": 10.0, "dps": 18.0},
]

var game
var center := Vector3.ZERO
var radius := START_R
var stage := 0
var timer := 40.0
var shrinking := false
var next_center := Vector3.ZERO
var next_radius := START_R
var dps := 3.0
var _from_c := Vector3.ZERO
var _from_r := START_R
var _shrink_t := 0.0
var _shrink_dur := 1.0
var _tick := 0.0
var _pulse := 0.0
var wall: MeshInstance3D
var wall_mat: ShaderMaterial


func _ready() -> void:
	timer = STAGES[0].wait
	var cm := CylinderMesh.new()
	cm.top_radius = 1.0
	cm.bottom_radius = 1.0
	cm.height = 18.0
	cm.radial_segments = 128
	cm.rings = 4
	cm.cap_top = false
	cm.cap_bottom = false
	wall = MeshInstance3D.new()
	wall.mesh = cm
	wall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wall_mat = ShaderMaterial.new()
	wall_mat.shader = load("res://shaders/storm.gdshader")
	wall_mat.set_shader_parameter("noise_tex", game.world._noise_tex(0.02, 99))
	wall.material_override = wall_mat
	add_child(wall)
	_pick_next()


func danger(p: Vector3, margin := 0.0) -> bool:
	return Vector2(p.x - center.x, p.z - center.z).length() > radius - margin


func _pick_next() -> void:
	if stage + 1 >= STAGES.size():
		next_center = center
		next_radius = radius
		return
	next_radius = START_R * STAGES[stage + 1].r
	var max_off := maxf(0.0, radius - next_radius) * 0.85
	for i in 30:
		var a := randf() * TAU
		var c := center + Vector3(cos(a), 0, sin(a)) * randf() * max_off
		if c.length() < World.PLAY_R - next_radius * 0.5 and game.world.height_at(c.x, c.z) > World.WATER_Y + 0.2:
			next_center = c
			return
	next_center = center


func _process(dt: float) -> void:
	timer -= dt
	if not shrinking and timer <= 0.0 and stage + 1 < STAGES.size():
		shrinking = true
		_from_c = center
		_from_r = radius
		_shrink_t = 0.0
		_shrink_dur = STAGES[stage + 1].shrink
		game.feed("The storm is closing in", Color(0.75, 0.55, 1.0))
	if shrinking:
		_shrink_t += dt
		var k := smoothstep(0.0, 1.0, _shrink_t / _shrink_dur)
		center = _from_c.lerp(next_center, k)
		radius = lerpf(_from_r, next_radius, k)
		if _shrink_t >= _shrink_dur:
			shrinking = false
			stage += 1
			dps = STAGES[stage].dps
			timer = STAGES[stage].wait
			_pick_next()
	wall.position = Vector3(center.x, 4.0, center.z)
	wall.scale = Vector3(radius, 1.0, radius)
	_pulse = maxf(_pulse - dt * 3.0, 0.0)
	if randf() < dt * 0.25:
		_pulse = 1.0
	wall_mat.set_shader_parameter("pulse", _pulse)
	game.world.set_zone(center, radius, next_center, next_radius)
	_tick -= dt
	if _tick <= 0.0:
		_tick = 0.5
		for h in game.heroes():
			if danger(h.position):
				game.deal(h, dps * 0.5, null, Color(0.75, 0.5, 1.0))


## Seconds until the storm next moves (0 while it is moving).
func time_left() -> float:
	return 0.0 if shrinking else maxf(timer, 0.0)
