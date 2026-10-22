class_name Skeleton
extends Actor
## Skeleton minion / warrior: rises from the ground, chases the hero, telegraphed melee swings,
## hit reactions, frozen state, death collapse and sink.

var kind := "minion"
var dmg := 9.0
var atk_cd := 0.0
var attack_t := -1.0
var hit_done := false
var death_t := 0.0
var aggro := false


func setup(k: String) -> void:
	kind = k
	var warrior := k == "warrior"
	var caster := k == "mage"
	load_model({"warrior": "Skeleton_Warrior", "mage": "Skeleton_Mage"}.get(k, "Skeleton_Minion"), 1.08 if warrior else 1.0)
	max_hp = 110.0 if warrior else (45.0 if caster else 55.0)
	hp = max_hp
	speed = 3.1 if warrior else (3.3 if caster else 3.7)
	dmg = 16.0 if warrior else (12.0 if caster else 9.0)
	radius = 0.55 if warrior else 0.45
	_attach({"warrior": "Skeleton_Axe", "mage": "Skeleton_Staff"}.get(k, "Skeleton_Blade"), "handslot.r")
	if warrior:
		_attach("Skeleton_Shield_Large_A", "handslot.l")
	var eye := StandardMaterial3D.new()
	eye.albedo_color = Color.BLACK
	eye.emission_enabled = true
	eye.emission = Color(0.55, 1.0, 0.45) if caster else Color(0.3, 1.0, 0.95)
	eye.emission_energy_multiplier = 6.0
	for m in meshes:
		if m.name.ends_with("_Eyes"):
			m.material_override = eye
	for m in meshes:
		if m.material_override == null:
			_grade(m)
	rim_color = Color(0.45, 0.8, 1.0)
	rim = 0.25
	facing = randf() * TAU
	rotation.y = facing
	play("Idle", 0.0)
	anim.seek(randf() * 1.5, true)


static var _graded := {}


## Bone-white atlas reads as a glowing blob at game distance: darken and desaturate it (shared per material).
func _grade(m: MeshInstance3D) -> void:
	for i in m.mesh.get_surface_count():
		var src := m.mesh.surface_get_material(i)
		if src == null:
			continue
		if not _graded.has(src):
			var g: StandardMaterial3D = src.duplicate()
			g.albedo_color = Color(0.6, 0.57, 0.52)
			g.roughness = 0.85
			_graded[src] = g
		m.set_surface_override_material(i, _graded[src])


func _attach(file: String, bone: String) -> void:
	var ba := BoneAttachment3D.new()
	ba.bone_name = bone
	skel.add_child(ba)
	var w: Node3D = (load("res://assets/characters/weapons/%s.gltf" % file) as PackedScene).instantiate()
	ba.add_child(w)
	for m in w.find_children("*", "MeshInstance3D", true, false):
		_register_mesh(m)


func rise() -> void:
	play("Spawn_Ground_Skeletons", 0.0, 1.0, true)
	lock = clip_len("Spawn_Ground_Skeletons") * 0.9
	game.fx.dust(position)


func _process(dt: float) -> void:
	update_overlay(dt)
	if dead:
		death_t += dt
		if death_t > 3.5:
			position.y -= dt * 0.7
		if death_t > 5.5:
			game.enemies.erase(self)
			game.units.erase(self)
			queue_free()
		return
	if frozen > 0.0:
		frozen -= dt
		anim.speed_scale = 0.0 if frozen > 0.0 else 1.0
		return
	lock -= dt
	atk_cd -= dt
	var p: Actor = game.nearest_hero(self, 26.0 if aggro else 22.0)
	if p == null:
		aggro = false
		play("Idle")
		move(_separation() * 0.3, dt, speed)
		return
	var to := p.position - position
	to.y = 0
	var d := to.length()
	if attack_t >= 0.0:
		attack_t += dt
		face_dir(to, dt, 6.0)
		if not hit_done and attack_t > 0.5:
			hit_done = true
			var fwd := Vector3(sin(facing), 0, cos(facing))
			if d < 2.4 and not p.dead and fwd.dot(to.normalized()) > 0.3:
				game.deal(p, dmg, self, Color(1.0, 0.25, 0.2))
		if attack_t > 1.0:
			attack_t = -1.0
		move(Vector3.ZERO, dt, 0.0)
		return
	if lock > 0.0:
		move(Vector3.ZERO, dt, 0.0)
		return
	aggro = true
	if p.dead:
		play("Idle")
		move(Vector3.ZERO, dt, 0.0)
		return
	if kind == "mage":
		_caster_ai(dt, to, d)
		return
	if d < 1.8 and atk_cd <= 0.0:
		attack_t = 0.0
		hit_done = false
		atk_cd = randf_range(1.5, 2.1)
		play("1H_Melee_Attack_Chop" if kind == "warrior" else "1H_Melee_Attack_Slice_Diagonal", 0.1, 1.0, true)
		return
	if d > 1.5:
		var dir := to / d
		dir += _separation() * 0.8
		dir = dir.normalized()
		move(dir, dt, speed)
		face_dir(dir, dt)
		play("Running_A")
	else:
		face_dir(to, dt)
		move(_separation() * 0.5, dt, speed)
		play("Idle_Combat" if anim.has_animation("Idle_Combat") else "Idle")


## Skeleton mage: hold 8-13 m from the hero, back off when crowded, and lob necrotic bolts.
func _caster_ai(dt: float, to: Vector3, d: float) -> void:
	var dir := to / maxf(d, 0.001)
	if d < 13.5 and atk_cd <= 0.0:
		atk_cd = randf_range(2.4, 3.2)
		face_now(to)
		play("Spellcast_Shoot", 0.1, 1.0, true)
		lock = 0.8
		game.fx.cast_glow(self, FX.NECRO)
		get_tree().create_timer(0.45).timeout.connect(_shoot)
		return
	var want := Vector3.ZERO
	if d > 12.0:
		want = dir
	elif d < 8.0:
		want = -dir
	want += _separation() * 0.8
	if want.length() > 0.1:
		want = want.normalized()
		move(want, dt, speed)
		face_dir(want, dt)
		play("Walking_Backwards" if want.dot(dir) < -0.5 and anim.has_animation("Walking_Backwards") else "Running_A")
	else:
		move(Vector3.ZERO, dt, 0.0)
		face_dir(to, dt)
		play("Idle_Combat" if anim.has_animation("Idle_Combat") else "Idle")


func _shoot() -> void:
	if dead or frozen > 0.0:
		return
	var tgt: Actor = game.nearest_hero(self, 30.0)
	if tgt == null:
		return
	var target: Vector3 = tgt.position
	var start := position + Vector3(sin(facing), 0, cos(facing)) * 0.7 + Vector3(0, 1.4, 0)
	var dir := target + Vector3(0, 1.0, 0) - start
	dir.y = 0
	var b := Bolt.new()
	b.game = game
	b.owner_actor = self
	b.vel = dir.normalized() * 12.0
	b.dmg = dmg
	game.add_child(b)
	b.global_position = start


func _separation() -> Vector3:
	var push := Vector3.ZERO
	for o in game.enemies:
		if o == self or not is_instance_valid(o) or o.dead:
			continue
		var d: Vector3 = position - o.position
		d.y = 0
		var l := d.length()
		var min_d: float = radius + o.radius + 0.5
		if l < min_d and l > 0.001:
			push += d / l * (1.0 - l / min_d)
	return push


func on_hit() -> void:
	aggro = true
	if attack_t < 0.0 and frozen <= 0.0:
		play("Hit_A" if randf() < 0.5 else "Hit_B", 0.05, 1.2, true)
		lock = 0.35


func die() -> void:
	dead = true
	anim.speed_scale = 1.0
	play("Death_A" if randf() < 0.5 else "Death_B", 0.08, 1.0, true)
	game.on_death(self)
