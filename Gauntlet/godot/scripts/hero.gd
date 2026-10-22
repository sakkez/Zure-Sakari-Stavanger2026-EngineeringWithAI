class_name Hero
extends Actor
## Playable hero (Sorceress / Warrior / Ranger): WASD movement, mouse aim, four abilities.
## Locomotion blends idle->run; an upper-body one-shot layer lets attacks play on the move and a
## full-body one-shot carries spins, slams and dodges.

const CLASSES := {
	"mage": {
		"name": "Sorceress", "role": "Fire and frost from afar", "model": "Mage", "hp": 140.0, "speed": 5.0, "idle": "Idle",
		"hide": ["1H_Wand", "Spellbook", "Spellbook_open"], "resource": Color(0.13, 0.3, 0.9), "regen": 11.0, "icons": [0, 1, 2, 3],
		"kit": {
			"primary": {"name": "Fireball", "cd": 0.55, "mana": 6.0},
			"secondary": {"name": "Frost Nova", "cd": 6.0, "mana": 30.0},
			"ultimate": {"name": "Meteor", "cd": 12.0, "mana": 55.0},
			"dodge": {"name": "Blink", "cd": 3.0, "mana": 15.0},
		},
	},
	"warrior": {
		"name": "Warrior", "role": "Plate, steel and fury", "model": "Knight", "hp": 220.0, "speed": 5.2, "idle": "2H_Melee_Idle",
		"hide": ["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword"],
		"resource": Color(0.85, 0.42, 0.08), "regen": 14.0, "icons": [4, 5, 6, 7],
		"kit": {
			"primary": {"name": "Cleave", "cd": 0.7, "mana": 0.0},
			"secondary": {"name": "Whirlwind", "cd": 5.0, "mana": 25.0},
			"ultimate": {"name": "Earthshatter", "cd": 14.0, "mana": 50.0},
			"dodge": {"name": "Charge", "cd": 4.0, "mana": 10.0},
		},
	},
	"archer": {
		"name": "Ranger", "role": "Swift bolts and arrow storms", "model": "Rogue_Hooded", "hp": 160.0, "speed": 5.6, "idle": "2H_Ranged_Aiming",
		"hide": ["Knife_Offhand", "1H_Crossbow", "Knife", "Throwable"], "resource": Color(0.2, 0.68, 0.32), "regen": 13.0, "icons": [8, 9, 10, 11],
		"kit": {
			"primary": {"name": "Bolt", "cd": 0.45, "mana": 0.0},
			"secondary": {"name": "Multishot", "cd": 4.0, "mana": 25.0},
			"ultimate": {"name": "Rain of Arrows", "cd": 12.0, "mana": 50.0},
			"dodge": {"name": "Roll", "cd": 2.5, "mana": 5.0},
		},
	},
}
const UPPER := ["spine", "chest", "head", "upperarm", "lowerarm", "wrist", "hand", "elbowIK", "handIK"]

var cls := "mage"
var data: Dictionary
var kit: Dictionary
var mana := 100.0
var max_mana := 100.0
var cds := {"primary": 0.0, "secondary": 0.0, "ultimate": 0.0, "dodge": 0.0}
var preview := false  # class-select mannequin: no input, no regen
var tree: AnimationTree
var cast_node: AnimationNodeAnimation
var full_node: AnimationNodeAnimation
var cast_face := 0.0
var cast_aim := Vector3.ZERO
var slow := 0.0
var invuln := 0.0
var dash_t := 0.0
var dash_vel := Vector3.ZERO
var dash_hits := {}
var spin_t := 0.0
var swing := 1.0
var _prev_keys := {}


func setup(c: String) -> void:
	cls = c
	data = CLASSES[c]
	kit = data.kit
	load_model(data.model)
	for m in meshes:
		if m.name in data.hide:
			m.visible = false
	max_hp = data.hp
	hp = max_hp
	speed = data.speed
	rim_color = Color(1.0, 0.78, 0.45)
	rim = 0.35
	_build_tree()
	var fill := OmniLight3D.new()
	fill.light_volumetric_fog_energy = 0.0
	fill.light_color = Color(1.0, 0.85, 0.7)
	fill.light_energy = 0.8
	fill.omni_range = 5.0
	fill.position = Vector3(0, 3.0, 1.5)
	add_child(fill)


func _build_tree() -> void:
	tree = AnimationTree.new()
	model.add_child(tree)
	tree.anim_player = tree.get_path_to(anim)
	var bt := AnimationNodeBlendTree.new()
	var loco := AnimationNodeBlendSpace1D.new()
	var idle := AnimationNodeAnimation.new()
	idle.animation = data.idle
	var run := AnimationNodeAnimation.new()
	run.animation = "Running_A"
	loco.add_blend_point(idle, 0.0, -1, &"idle")
	loco.add_blend_point(run, 1.0, -1, &"run")
	bt.add_node("loco", loco)
	cast_node = AnimationNodeAnimation.new()
	cast_node.animation = "Spellcast_Shoot"
	bt.add_node("cast_anim", cast_node)
	var shot := AnimationNodeOneShot.new()
	shot.fadein_time = 0.06
	shot.fadeout_time = 0.2
	shot.filter_enabled = true
	var a := anim.get_animation("Spellcast_Shoot")
	for i in a.get_track_count():
		var path := a.track_get_path(i)
		var bone := path.get_concatenated_subnames()
		for u in UPPER:
			if bone.begins_with(u):
				shot.set_filter_path(path, true)
				break
	bt.add_node("cast", shot)
	full_node = AnimationNodeAnimation.new()
	full_node.animation = "Dodge_Forward"
	bt.add_node("full_anim", full_node)
	var full := AnimationNodeOneShot.new()
	full.fadein_time = 0.05
	full.fadeout_time = 0.15
	bt.add_node("full", full)
	var spd := AnimationNodeTimeScale.new()
	bt.add_node("full_speed", spd)
	bt.connect_node("cast", 0, "loco")
	bt.connect_node("cast", 1, "cast_anim")
	bt.connect_node("full_speed", 0, "full_anim")
	bt.connect_node("full", 0, "cast")
	bt.connect_node("full", 1, "full_speed")
	bt.connect_node("output", 0, "full")
	tree.tree_root = bt
	tree.active = true


func _upper(clip: String) -> void:
	cast_node.animation = clip
	tree.set("parameters/cast/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)


func _full(clip: String, spd := 1.0) -> void:
	full_node.animation = clip
	tree.set("parameters/full_speed/scale", spd)
	tree.set("parameters/full/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)


func can_cast(slot: String) -> bool:
	return not dead and cds[slot] <= 0.0 and mana >= kit[slot].mana and dash_t <= 0.0


func fwd() -> Vector3:
	return Vector3(sin(facing), 0, cos(facing))


func cast(slot: String, aim: Vector3) -> bool:
	if not can_cast(slot):
		return false
	cds[slot] = kit[slot].cd
	mana -= kit[slot].mana
	var to := aim - position
	to.y = 0
	if to.length() < 0.1:
		to = fwd()
	face_now(to)
	cast_face = 0.45
	cast_aim = aim
	call("_%s_%s" % [cls, slot], aim, to.normalized())
	return true


func _after(t: float, f: Callable) -> void:
	get_tree().create_timer(t).timeout.connect(f)


# --- Sorceress ------------------------------------------------------------------------------

func _mage_primary(aim: Vector3, _dir: Vector3) -> void:
	_upper("Spellcast_Shoot")
	slow = 0.3
	game.fx.cast_glow(self, FX.FIRE)
	_after(0.18, _launch_fireball.bind(aim))


func _mage_secondary(_aim: Vector3, _dir: Vector3) -> void:
	_upper("Spellcast_Raise")
	slow = 0.4
	game.fx.cast_glow(self, FX.FROST)
	_after(0.25, _nova)


func _mage_ultimate(aim: Vector3, dir: Vector3) -> void:
	_upper("Spellcast_Long")
	slow = 0.7
	game.fx.cast_glow(self, FX.FIRE)
	var target := aim
	if target.distance_to(position) > 16.0:
		target = position + dir * 16.0
		target.y = game.world.height_at(target.x, target.z)
	game.fx.meteor(target, 5.0, 1.0, game.world.rock_meshes[1])
	_after(1.0, game.aoe.bind(target, 5.0, 80.0, self, Color(1.0, 0.45, 0.15), 2.5))


func _mage_dodge(aim: Vector3, dir: Vector3) -> void:
	var from := position
	var dist := minf(8.0, maxf((aim - position).length(), 3.0))
	var ok := 0.0
	var s := 0.5
	while s <= dist:
		var p := from + dir * s
		if not game.world.walkable(p.x, p.z, radius):
			break
		ok = s
		s += 0.5
	position = from + dir * ok
	position.y = game.world.height_at(position.x, position.z)
	game.fx.blink(from, position)


func _launch_fireball(aim: Vector3) -> void:
	if dead:
		return
	var d := aim - position
	d.y = 0
	d = d.normalized() if d.length() > 0.01 else fwd()
	var fb := Fireball.new()
	fb.game = game
	fb.owner_actor = self
	fb.vel = d * 22.0
	game.add_child(fb)
	fb.global_position = position + d * 0.8 + Vector3(0, 1.3, 0)


func _nova() -> void:
	if dead:
		return
	game.fx.frost_nova(position, 5.0)
	game.aoe(position, 5.0, 24.0, self, Color(0.6, 0.85, 1.0), 2.0)
	for e in game.hostiles_of(self):
		if e.position.distance_to(position) < 5.0 + e.radius:
			e.frozen = 2.0 if e is Skeleton else 1.0


# --- Warrior --------------------------------------------------------------------------------

## Melee arc in front of the hero after `delay`; returns nothing, damage + sparks on each target.
func _melee(delay: float, reach: float, arc: float, dmg: float, knockback := 0.6) -> void:
	swing = -swing
	_after(delay, _melee_hit.bind(reach, arc, dmg, knockback, swing))


func _melee_hit(reach: float, arc: float, dmg: float, knockback: float, sweep: float) -> void:
	if dead:
		return
	game.fx.cleave(position, facing, sweep, reach)
	var f := fwd()
	var hit_any := false
	for e in game.hostiles_of(self):
		var d: Vector3 = e.position - position
		d.y = 0
		if d.length() < reach + e.radius and f.angle_to(d.normalized()) < arc * 0.5:
			game.deal(e, dmg * randf_range(0.9, 1.1), self, Color(1.0, 0.85, 0.6), knockback)
			game.fx.hit_spark(e.position + Vector3(0, 1.1, 0), d.normalized())
			hit_any = true
	if hit_any:
		game.add_shake(0.05)


func _warrior_primary(_aim: Vector3, _dir: Vector3) -> void:
	_upper("2H_Melee_Attack_Slice")
	slow = 0.45
	_melee(0.25, 2.7, 1.9, 26.0)


func _warrior_secondary(_aim: Vector3, _dir: Vector3) -> void:
	_full("2H_Melee_Attack_Spin", 2.4)
	spin_t = 1.0
	game.fx.whirlwind(self, 1.0)
	for i in 4:
		_after(0.15 + i * 0.22, _spin_tick)


func _spin_tick() -> void:
	if not dead:
		game.aoe(position, 3.3, 14.0, self, Color(1.0, 0.85, 0.6), 0.8)


func _warrior_ultimate(_aim: Vector3, _dir: Vector3) -> void:
	_full("2H_Melee_Attack_Chop", 1.25)
	slow = 1.0
	_after(0.5, _shatter)


func _shatter() -> void:
	if dead:
		return
	var c := position + fwd() * 0.8
	game.fx.earthshatter(c, 5.0, game.world.rock_meshes[2])
	game.aoe(c, 5.0, 60.0, self, Color(1.0, 0.7, 0.3), 3.0)
	for e in game.hostiles_of(self):
		if e.position.distance_to(c) < 5.0 + e.radius:
			e.lock = maxf(e.lock, 1.0 if e is Skeleton else 0.5)


func _warrior_dodge(_aim: Vector3, dir: Vector3) -> void:
	_full("Dodge_Forward", 0.9)
	_dash(dir, 5.8, 0.3, 18.0)
	game.fx.charge(self, 0.32)


# --- Ranger ---------------------------------------------------------------------------------

func _shoot_arrow(dir: Vector3, dmg: float) -> void:
	if dead:
		return
	var a := Arrow.new()
	a.game = game
	a.owner_actor = self
	a.vel = dir * 34.0
	a.dmg = dmg
	game.add_child(a)
	a.global_position = position + dir * 0.8 + Vector3(0, 1.15, 0)


func _archer_primary(_aim: Vector3, dir: Vector3) -> void:
	_upper("2H_Ranged_Shoot")
	slow = 0.25
	_after(0.12, _shoot_arrow.bind(dir, 24.0))


func _archer_secondary(_aim: Vector3, dir: Vector3) -> void:
	_upper("2H_Ranged_Shoot")
	slow = 0.35
	_after(0.15, _multishot.bind(dir))


func _multishot(dir: Vector3) -> void:
	game.fx.muzzle(position + dir * 0.9 + Vector3(0, 1.15, 0), FX.SPARKS)
	for i in range(-3, 4):
		_shoot_arrow(dir.rotated(Vector3.UP, i * 0.12), 18.0)


func _archer_ultimate(aim: Vector3, dir: Vector3) -> void:
	_full("2H_Ranged_Shooting", 0.9)
	slow = 0.7
	var c := aim
	if c.distance_to(position) > 16.0:
		c = position + dir * 16.0
		c.y = game.world.height_at(c.x, c.z)
	game.fx.arrow_rain(c, 3.5, 1.2, 0.3)
	for i in 10:
		var p := c + Vector3(randf_range(-3.0, 3.0), 0, randf_range(-3.0, 3.0))
		_after(0.62 + i * 0.12, game.aoe.bind(p, 2.0, 12.0, self, Color(1.0, 0.9, 0.7), 0.3))


func _archer_dodge(_aim: Vector3, dir: Vector3) -> void:
	_full("Dodge_Forward", 1.0)
	_dash(dir, 4.8, 0.35, 0.0)
	invuln = 0.4
	game.fx.dust(position)


func _dash(dir: Vector3, dist: float, dur: float, dmg: float) -> void:
	dash_t = dur
	dash_vel = dir * (dist / dur)
	dash_hits = {"dmg": dmg}


# --- frame ----------------------------------------------------------------------------------

func _process(dt: float) -> void:
	for k in cds:
		cds[k] = maxf(cds[k] - dt, 0.0)
	update_overlay(dt)
	if dead or preview:
		return
	mana = minf(max_mana, mana + data.regen * dt)
	hp = minf(max_hp, hp + 1.5 * dt)
	slow = maxf(slow - dt, 0.0)
	invuln = maxf(invuln - dt, 0.0)
	cast_face = maxf(cast_face - dt, 0.0)
	spin_t = maxf(spin_t - dt, 0.0)
	if dash_t > 0.0:
		dash_t -= dt
		position = game.world.resolve(position, position + dash_vel * dt, radius)
		var dmg: float = dash_hits.get("dmg", 0.0)
		if dmg > 0.0:
			for e in game.hostiles_of(self):
				if not dash_hits.has(e) and e.position.distance_to(position) < 1.4:
					dash_hits[e] = true
					game.deal(e, dmg, self, Color(1.0, 0.85, 0.6), 2.0)
					game.fx.hit_spark(e.position + Vector3(0, 1.1, 0), dash_vel.normalized())
		return
	var dir := Vector3.ZERO
	if not is_player:
		dir = _steer(_ai(dt), dt)
	elif not game.shot_mode:
		dir = Vector3(float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)), 0,
			float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))
		_read_casts()
	if dir.length() > 0.0:
		dir = dir.normalized()
	var spd := speed * (0.35 if slow > 0.0 else (0.75 if spin_t > 0.0 else 1.0))
	move(dir, dt, spd)
	if cast_face > 0.0 and spin_t <= 0.0:
		var to := cast_aim - position
		to.y = 0
		face_dir(to, dt, 20.0)
	elif spin_t <= 0.0:
		face_dir(dir, dt)
	var blend: float = tree.get("parameters/loco/blend_position")
	tree.set("parameters/loco/blend_position", move_toward(blend, dir.length() * (spd / speed), dt * 6.0))


func _edge(key: String, down: bool) -> bool:
	var was: bool = _prev_keys.get(key, false)
	_prev_keys[key] = down
	return down and not was


func _read_casts() -> void:
	var aim: Vector3 = game.aim
	var rmb := _edge("rmb", Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT))
	var q := _edge("q", Input.is_key_pressed(KEY_Q))
	var e := _edge("e", Input.is_key_pressed(KEY_E))
	var sp := _edge("space", Input.is_key_pressed(KEY_SPACE))
	if sp and cast("dodge", aim):
		return
	if e and cast("ultimate", aim):
		return
	if (rmb or q) and cast("secondary", aim):
		return
	if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and not game.hud_hovered():
		cast("primary", aim)


func hurt(amount: float, from: Vector3, knockback := 0.0) -> void:
	if invuln > 0.0 or preview:
		return
	super.hurt(amount, from, knockback)


func on_hit() -> void:
	game.add_shake(0.06)


func die() -> void:
	dead = true
	tree.active = false
	anim.play("Death_A", 0.1)
	if plate:
		plate.queue_free()
		plate = null
	game.on_death(self)


# --- rival AI --------------------------------------------------------------------------------
# Picks the nearest threat (mobs or champions), kites at range or closes in for melee, uses every
# ability situationally, retreats to regenerate at low life, and always respects the storm.

var is_player := false
var plate: Node3D
var _ai_target: Actor
var _ai_think := 0.0
var _ai_strafe := 1.0
var _ai_retreat := false
var _ai_wp := Vector3.ZERO
var _stuck_t := 0.0
var _stuck_pos := Vector3.ZERO
var _detour_t := 0.0
var _detour := 1.0
var _ai_wp_t := 0.0


func _ranged() -> bool:
	return cls != "warrior"


func _ai(dt: float) -> Vector3:
	_ai_think -= dt
	if _ai_think <= 0.0:
		_ai_think = randf_range(0.35, 0.6)
		var zs: int = game.zone.stage if game.zone else 0
		var shrinking: bool = game.zone != null and game.zone.shrinking
		_ai_target = game.nearest_hostile(self, 24.0, 12.0 if zs == 0 and not shrinking else 24.0)
		if randf() < 0.2:
			_ai_strafe = -_ai_strafe
	if hp < max_hp * 0.3:
		_ai_retreat = true
	elif hp > max_hp * 0.65:
		_ai_retreat = false
	var zone: Zone = game.zone
	var to_safe := Vector3.ZERO
	if zone and zone.danger(position, 3.0):
		to_safe = zone.center - position
		to_safe.y = 0
		to_safe = to_safe.normalized()
	if zone:
		# outside the storm: nothing matters but getting back in (still firing at anything in range)
		if zone.danger(position, 0.5):
			if _ai_target and is_instance_valid(_ai_target) and not _ai_target.dead:
				var tt := _ai_target.position - position
				_ai_cast(_ai_target, tt.length(), tt.normalized(), _ai_target.position)
			return to_safe
		# head into the next circle before it closes
		var dn := Vector2(position.x - zone.next_center.x, position.z - zone.next_center.z).length()
		if dn > zone.next_radius - 3.0 and (zone.shrinking or zone.timer < 14.0):
			var tn := zone.next_center - position
			tn.y = 0
			to_safe = tn.normalized()
	var t := _ai_target
	if t == null or t.dead or not is_instance_valid(t):
		# roam between waypoints inside the storm, drifting inward as it closes
		_ai_wp_t -= get_process_delta_time()
		if _ai_wp_t <= 0.0 or position.distance_to(_ai_wp) < 3.0 or (zone and zone.danger(_ai_wp, 4.0)):
			_ai_wp_t = randf_range(8.0, 14.0)
			var c: Vector3 = zone.center if zone else Vector3.ZERO
			var r: float = (zone.radius if zone else 40.0) * 0.6
			var a := randf() * TAU
			_ai_wp = c + Vector3(cos(a), 0, sin(a)) * r * sqrt(randf())
		var w := _ai_wp - position
		w.y = 0
		return ((w.normalized() * 0.8 if w.length() > 2.0 else Vector3.ZERO) + to_safe).limit_length(1.0)
	var to := t.position - position
	to.y = 0
	var d := to.length()
	var dir := to / maxf(d, 0.001)
	var side := dir.cross(Vector3.UP) * _ai_strafe
	var aim := t.position + t.knock * 0.1
	_ai_cast(t, d, dir, aim)
	if _ai_retreat:
		return ((-dir + side * 0.4).normalized() + to_safe * 1.5).normalized()
	var want := Vector3.ZERO
	if _ranged():
		var band := 10.0 if cls == "mage" else 12.0
		if d > band + 3.0:
			want = dir
		elif d < band - 4.0:
			want = -dir + side * 0.5
		else:
			want = side * 0.6
	else:
		want = dir if d > 1.8 else side * 0.3
	return (want + to_safe * 1.5).normalized() if (want + to_safe).length() > 0.05 else Vector3.ZERO


func _ai_cast(t: Actor, d: float, dir: Vector3, aim: Vector3) -> void:
	if slow > 0.0 or spin_t > 0.0:
		return
	var crowd := 0
	for e in game.hostiles_of(self):
		if e.position.distance_to(position) < 4.0:
			crowd += 1
	var jitter := Vector3(randf_range(-0.8, 0.8), 0, randf_range(-0.8, 0.8))
	match cls:
		"mage":
			if crowd >= 2 and cast("secondary", aim):
				return
			if d < 4.0 and (_ai_retreat or crowd >= 1) and cast("dodge", position - dir * 8.0):
				return
			if d < 16.0 and (t is Hero or crowd >= 2 or _cluster(t.position) >= 3) and randf() < 0.3 and cast("ultimate", aim):
				return
			if d < 17.0:
				cast("primary", aim + jitter)
		"warrior":
			if crowd >= 2 and cast("secondary", aim):
				return
			if d > 4.5 and d < 9.0 and not _ai_retreat and cast("dodge", aim):
				return
			if _ai_retreat and d < 5.0 and cast("dodge", position - dir * 8.0 + dir.cross(Vector3.UP) * 4.0):
				return
			if crowd >= 3 and cast("ultimate", aim):
				return
			if d < 2.8:
				cast("primary", aim)
		"archer":
			if d < 3.5 and cast("dodge", position - dir * 6.0 + dir.cross(Vector3.UP) * _ai_strafe * 3.0):
				return
			if d < 14.0 and (crowd >= 1 or _cluster(t.position) >= 2) and cast("secondary", aim):
				return
			if d < 16.0 and _cluster(t.position) >= 3 and cast("ultimate", aim):
				return
			if d < 19.0:
				cast("primary", aim + jitter * 0.6)


func _cluster(p: Vector3) -> int:
	var n := 0
	for e in game.hostiles_of(self):
		if e.position.distance_to(p) < 4.0:
			n += 1
	return n


## Obstacle/shoreline avoidance for AI: when barely moving while trying to, swing the heading
## 70 degrees to one side for a moment.
func _steer(dir: Vector3, dt: float) -> Vector3:
	if dir.length() < 0.1:
		return dir
	_stuck_t += dt
	if _stuck_t > 0.5:
		if position.distance_to(_stuck_pos) < 0.5 and _detour_t <= 0.0:
			_detour_t = randf_range(0.9, 1.6)
			_detour = 1.0 if randf() < 0.5 else -1.0
		_stuck_t = 0.0
		_stuck_pos = position
	if _detour_t > 0.0:
		_detour_t -= dt
		return dir.rotated(Vector3.UP, 1.2 * _detour)
	return dir
