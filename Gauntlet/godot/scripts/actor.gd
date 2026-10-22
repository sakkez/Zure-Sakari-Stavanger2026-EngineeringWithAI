class_name Actor
extends Node3D
## Base for animated KayKit characters: model loading, crossfaded clips, overlay (rim / hit flash /
## frozen tint), ground-following movement and damage.

## Characters are drawn 15% larger than the KayKit rigs so they read at the 58 m camera.
const SCALE := 1.15
const LOOPS := ["Idle", "Idle_Combat", "Running_A", "Running_B", "Walking_A", "Walking_D_Skeletons", "Spellcasting", "2H_Melee_Idle"]

static var overlay: ShaderMaterial

var game
var model: Node3D
var anim: AnimationPlayer
var skel: Skeleton3D
var meshes: Array[MeshInstance3D] = []
var hp := 100.0
var max_hp := 100.0
var radius := 0.5
var speed := 3.0
var facing := 0.0
var lock := 0.0
var frozen := 0.0
var dead := false
var flash := 0.0
var knock := Vector3.ZERO
var current := ""
var rim_color := Color(0.45, 0.6, 0.9)
var rim := 0.3
var team := "mob"  # "player", "rival<N>" or "mob"; different teams are hostile
var display_name := ""
var last_attacker: Actor = null


func load_model(file: String, s := 1.0) -> void:
	model = (load("res://assets/characters/%s.glb" % file) as PackedScene).instantiate()
	add_child(model)
	model.scale = Vector3.ONE * s * SCALE
	anim = model.find_child("AnimationPlayer", true, false)
	skel = model.find_children("*", "Skeleton3D", true, false)[0]
	skel.add_child(BodyScale.new())
	if overlay == null:
		overlay = ShaderMaterial.new()
		overlay.shader = load("res://shaders/actor_overlay.gdshader")
	for m in model.find_children("*", "MeshInstance3D", true, false):
		_register_mesh(m)
	for n in LOOPS:
		if anim.has_animation(n):
			anim.get_animation(n).loop_mode = Animation.LOOP_LINEAR


func _register_mesh(m: MeshInstance3D) -> void:
	m.material_overlay = overlay
	meshes.append(m)


func play(n: String, blend := 0.15, spd := 1.0, force := false) -> void:
	if n == current and not force:
		return
	current = n
	anim.play(n, blend, spd)
	if force:
		anim.seek(0.0, true)


func clip_len(n: String) -> float:
	return anim.get_animation(n).length if anim.has_animation(n) else 0.0


func face_dir(dir: Vector3, dt: float, rate := 14.0) -> void:
	if dir.length_squared() < 1e-4:
		return
	facing = lerp_angle(facing, atan2(dir.x, dir.z), 1.0 - exp(-rate * dt))
	rotation.y = facing


func face_now(dir: Vector3) -> void:
	if dir.length_squared() > 1e-4:
		facing = atan2(dir.x, dir.z)
		rotation.y = facing


func move(dir: Vector3, dt: float, spd: float) -> void:
	var want := position + dir * spd * dt + knock * dt
	knock = knock.lerp(Vector3.ZERO, 1.0 - exp(-8.0 * dt))
	position = game.world.resolve(position, want, radius)


func update_overlay(dt: float) -> void:
	flash = maxf(flash - dt * 11.0, 0.0)
	var fr := 1.0 if frozen > 0.0 else 0.0
	for m in meshes:
		m.set_instance_shader_parameter("flash", flash)
		m.set_instance_shader_parameter("frost", fr)
		m.set_instance_shader_parameter("rim_color", Vector3(rim_color.r, rim_color.g, rim_color.b))
		m.set_instance_shader_parameter("rim", rim)


func hurt(amount: float, from: Vector3, knockback := 0.0) -> void:
	if dead:
		return
	hp -= amount
	flash = 1.0
	if knockback > 0.0:
		var away := position - from
		away.y = 0
		knock += away.normalized() * knockback * 6.0
	if hp <= 0.0:
		hp = 0.0
		die()
	else:
		on_hit()


func on_hit() -> void:
	pass


func die() -> void:
	dead = true
