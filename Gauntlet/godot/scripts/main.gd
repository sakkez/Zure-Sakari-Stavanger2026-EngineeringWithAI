extends Node3D
## Gauntlet (Godot): pick a champion at the shrine, then fight endless skeleton packs.
## Builds environment, world, camera, player, spawner and HUD procedurally.
##
## Screenshot mode (deterministic):
##   godot --path godot --fixed-fps 60 --resolution 1600x900 -- --shot=shots/a.png --stage=battle [--frames=95] [--nohud]

const CAM_PITCH := 52.0
const CAM_FOV := 27.0

var world: World
var fx: FX
var hud: Hud
var cam: Camera3D
var player: Hero
var enemies: Array = []
var kills := 0
var aim := Vector3.ZERO
var shot_mode := false
var opts := {}
var cam_dist := 58.0
var env: Environment
var sun: DirectionalLight3D
var _dist := 58.0
var _cam_target := Vector3.ZERO
var _shake := 0.0
var _frame := 0
var _spawn_t := 1.0
var _captured := false


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv: PackedStringArray = a.trim_prefix("--").split("=", true, 1)
		opts[kv[0]] = kv[1] if kv.size() > 1 else "1"
	shot_mode = opts.has("shot")
	if opts.has("bench"):
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	if shot_mode:
		seed(int(opts.get("seed", "7")))
	_build_environment()
	world = World.new()
	add_child(world)
	world.build()
	fx = FX.new()
	fx.game = self
	add_child(fx)
	for f in world.fire_spots:
		fx.brazier_fire(f[0], f[1])
	cam = Camera3D.new()
	cam.fov = CAM_FOV
	cam.near = 1.0
	cam.far = 400.0
	add_child(cam)
	var grade_layer := CanvasLayer.new()
	grade_layer.layer = 0
	var grade := ColorRect.new()
	grade.set_anchors_preset(Control.PRESET_FULL_RECT)
	grade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grade.material = ShaderMaterial.new()
	grade.material.shader = load("res://shaders/grade.gdshader")
	grade_layer.add_child(grade)
	add_child(grade_layer)
	hud = Hud.new()
	hud.game = self
	add_child(hud)
	if opts.has("nohud"):
		hud.visible = false
	if opts.has("dist"):
		cam_dist = float(opts.dist)
	_dist = cam_dist
	var preset: String = {"sorceress": "mage", "ranger": "archer", "knight": "warrior"}.get(opts.get("class", ""), opts.get("class", ""))
	if not Hero.CLASSES.has(preset) and shot_mode and opts.get("stage", "") != "select":
		preset = "mage"
	if Hero.CLASSES.has(preset):
		start(preset)
	else:
		_open_select()


# --- class select --------------------------------------------------------------------------

const SELECT_ORDER := ["warrior", "mage", "archer"]
var selecting := false
var _previews: Array[Hero] = []
var _hover := -1


## The three champions stand on the shrine's south apron, lit by the altar and fire bowls.
func _open_select() -> void:
	selecting = true
	for i in SELECT_ORDER.size():
		var h := Hero.new()
		h.game = self
		h.preview = true
		add_child(h)
		h.setup(SELECT_ORDER[i])
		var x := -2.3 + i * 2.3
		var z := World.PLAZA.y + 5.0 - absf(i - 1.0) * 0.5
		h.position = Vector3(x, world.height_at(x, z), z)
		h.face_now(Vector3(-x * 0.15, 0, 1))
		_previews.append(h)
	hud.show_select(SELECT_ORDER)
	player = null


func _select_tick(dt: float) -> void:
	var target := Vector3(0, World.PLAZA_H + 1.25, World.PLAZA.y + 4.6)
	_cam_target = _cam_target.lerp(target, 1.0 - exp(-4.0 * dt)) if _frame > 1 else target
	var pitch := deg_to_rad(16.0)
	cam.fov = 40.0
	cam.position = _cam_target + Vector3(0, sin(pitch), cos(pitch)) * 8.8
	cam.look_at(_cam_target, Vector3.UP)
	var hover := -1
	if not shot_mode:
		var mp := get_viewport().get_mouse_position()
		var best := 140.0
		for i in _previews.size():
			var sp := cam.unproject_position(_previews[i].position + Vector3(0, 1.1, 0))
			if sp.distance_to(mp) < best:
				best = sp.distance_to(mp)
				hover = i
	else:
		hover = 1
	if hover != _hover:
		_hover = hover
		hud.highlight(hover)
		for i in _previews.size():
			_previews[i].rim = 0.9 if i == hover else 0.35
	if not shot_mode:
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and _hover >= 0:
			start(SELECT_ORDER[_hover])
		for i in 3:
			if Input.is_key_pressed(KEY_1 + i):
				start(SELECT_ORDER[i])


## Spawns the chosen hero at the south trail and hands control over.
func start(cls: String) -> void:
	for h in _previews:
		h.queue_free()
	_previews.clear()
	selecting = false
	cam.fov = CAM_FOV
	player = Hero.new()
	player.game = self
	player.is_player = true
	player.team = "player"
	player.display_name = "You"
	add_child(player)
	player.setup(cls)
	player.position = Vector3(1.0, world.height_at(1.0, 6.0), 6.0)
	player.face_now(Vector3(0.3, 0, -1))
	player.cds["primary"] = 0.3
	units.append(player)
	_cam_target = player.position
	hud.bind_hero(player)
	_spawn_t = 2.0
	pickups = Pickups.new()
	pickups.game = self
	add_child(pickups)
	if not opts.has("norivals"):
		_spawn_rivals()
	if not shot_mode or opts.has("zone"):
		zone = Zone.new()
		zone.game = self
		add_child(zone)
	_update_camera(1.0)


# --- factions, damage, deaths ----------------------------------------------------------------

const RIVAL_NAMES := ["Vex the Ashen", "Morrigan Vale", "Brother Hask", "Sable Thorn", "Garrik Ironvow"]
var units: Array = []
var zone: Zone
var pickups: Pickups
var placement := 0
var over := false


func _spawn_rivals() -> void:
	var classes := ["warrior", "mage", "archer", "warrior", "archer"]
	classes.shuffle()
	for i in RIVAL_NAMES.size():
		var a := float(i) / RIVAL_NAMES.size() * TAU + 0.4
		var p := Vector3.ZERO
		for k in 30:
			var r := World.PLAY_R * randf_range(0.62, 0.8)
			p = Vector3(cos(a) * r, 0, sin(a) * r)
			if world.walkable(p.x, p.z, 1.0):
				break
			a += 0.15
		var h := Hero.new()
		h.game = self
		h.team = "rival%d" % i
		h.display_name = RIVAL_NAMES[i]
		add_child(h)
		h.setup(classes[i])
		h.rim_color = Color(1.0, 0.3, 0.2)
		h.rim = 0.3
		h.position = Vector3(p.x, world.height_at(p.x, p.z), p.z)
		h.face_now(-h.position)
		h.plate = _nameplate(h)
		units.append(h)


## Name + life bar floating over a rival (constant screen size).
func _nameplate(h: Hero) -> Node3D:
	var root := Node3D.new()
	h.add_child(root)
	root.position = Vector3(0, 2.5, 0)
	var l := Label3D.new()
	l.text = h.display_name
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.fixed_size = true
	l.pixel_size = 0.00019
	l.font_size = 40
	l.outline_size = 10
	l.modulate = Color(1.0, 0.55, 0.45)
	l.outline_modulate = Color(0.05, 0.02, 0.02, 0.9)
	l.no_depth_test = true
	l.position = Vector3(0, 0.75, 0)
	root.add_child(l)
	var img := Image.create(4, 4, false, Image.FORMAT_RGBA8)
	img.fill(Color.WHITE)
	var tex := ImageTexture.create_from_image(img)
	for k in 2:
		var s := Sprite3D.new()
		s.texture = tex
		s.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		s.fixed_size = true
		s.no_depth_test = true
		s.shaded = false
		s.centered = false
		s.pixel_size = 0.0003
		s.scale = Vector3(16.0, 2.8, 1.0) if k == 0 else Vector3(15.6, 2.2, 1.0)
		s.offset = Vector2(-2.0, 0.0)
		s.modulate = Color(0.05, 0.03, 0.02, 0.85) if k == 0 else Color(0.8, 0.12, 0.08)
		s.render_priority = k
		root.add_child(s)
	root.set_meta("label", l)
	return root


func hostile(a: Actor, b: Actor) -> bool:
	return a != b and (a == null or b == null or a.team != b.team)


## Living units hostile to `a` (a == null: everyone, e.g. the storm).
func hostiles_of(a: Actor) -> Array:
	var out := []
	for u in units:
		if is_instance_valid(u) and not u.dead and hostile(a, u) and not (u is Hero and u.preview):
			out.append(u)
	return out


func heroes() -> Array:
	var out := []
	for u in units:
		if is_instance_valid(u) and not u.dead and u is Hero:
			out.append(u)
	return out


func nearest_hostile(a: Actor, max_d: float, hero_d := 999.0) -> Actor:
	var best: Actor = null
	var bd := max_d
	for u in hostiles_of(a):
		var d: float = u.position.distance_to(a.position)
		if u is Hero:
			if d > hero_d:
				continue
			d *= 0.85  # champions are the bigger prize
		if d < bd:
			bd = d
			best = u
	return best


func nearest_hero(a: Actor, max_d: float) -> Actor:
	var best: Actor = null
	var bd := max_d
	for u in hostiles_of(a):
		if u is Hero:
			var d: float = u.position.distance_to(a.position)
			if d < bd:
				bd = d
				best = u
	return best


## All damage flows through here: hostility, kill credit and damage numbers involving the player.
func deal(target: Actor, amount: float, src: Actor, color: Color, knockback := 0.0) -> void:
	if target == null or target.dead or not hostile(src, target):
		return
	# AI-vs-AI fights are softened so the field thins out over the storm stages, not in the first minute
	if target is Hero and not target.is_player and src != player and src != null:
		amount *= 0.4 if src is Hero else 0.6
	target.last_attacker = src
	target.hurt(amount, src.position if src else target.position, knockback)
	if target == player:
		fx.damage_number(target.position, amount, Color(1.0, 0.25, 0.2))
	elif src == player:
		fx.damage_number(target.position, amount, color, amount > 50.0)


func on_death(u: Actor) -> void:
	var killer := u.last_attacker
	if killer == player and u != player:
		kills += 1
	if u is Skeleton:
		var r := randf()
		if r < 0.2:
			pickups.drop(u.position, "health")
		elif r < 0.32:
			pickups.drop(u.position, "mana")
		return
	# a champion has fallen
	var alive := heroes().size()
	if u == player:
		placement = alive + 1
		_end(false)
		return
	pickups.drop(u.position, "health")
	pickups.drop(u.position, "mana")
	var by := " by %s" % (killer.display_name if killer is Hero else "the dead") if killer else " to the storm"
	if killer == player:
		by = " by your hand"
	feed("%s has fallen%s" % [u.display_name, by], Color(1.0, 0.6, 0.4))
	if alive == 1 and not player.dead:
		_end(true)


func feed(text: String, color := Color(0.92, 0.84, 0.68)) -> void:
	hud.feed(text, color)
	if opts.has("log"):
		print("[%6.1f] %s" % [_frame / 60.0, text])


func _end(won: bool) -> void:
	if over:
		return
	over = true
	if opts.has("log"):
		print("[%6.1f] END won=%s place=%d kills=%d" % [_frame / 60.0, won, placement, kills])
	if won:
		hud.show_message("VICTORY", "Last champion standing  ·  %d slain  ·  press R to play again" % kills, Color(0.95, 0.78, 0.4))
	else:
		hud.show_message("YOU HAVE FALLEN", "Placed #%d of 6  ·  %d slain  ·  press R to rise again" % [placement, kills])


func _build_environment() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var pano := PanoramaSkyMaterial.new()
	pano.panorama = load("res://assets/env/kloppenheim_02_1k.hdr")
	pano.energy_multiplier = 0.9
	sky.sky_material = pano
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.42
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.02
	env.ssao_enabled = true
	env.ssao_radius = 1.4
	env.ssao_intensity = 2.2
	env.ssao_power = 1.6
	env.ssil_enabled = true
	env.ssil_intensity = 0.8
	env.sdfgi_enabled = true
	env.sdfgi_use_occlusion = true
	env.sdfgi_energy = 0.8
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_strength = 1.0
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.1
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.set_glow_level(1, 1.0)
	env.set_glow_level(3, 0.8)
	env.set_glow_level(5, 0.5)
	env.fog_enabled = true
	env.fog_light_color = Color(0.3, 0.34, 0.4)
	env.fog_density = 0.0012
	env.fog_sun_scatter = 0.25
	env.fog_aerial_perspective = 0.15
	env.fog_height = 1.0
	env.fog_height_density = 0.015
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.0028
	env.volumetric_fog_albedo = Color(0.75, 0.78, 0.82)
	env.volumetric_fog_anisotropy = 0.55
	env.volumetric_fog_length = 110.0
	env.volumetric_fog_ambient_inject = 0.05
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.14
	env.adjustment_saturation = 0.82
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.82, 0.62)
	sun.light_energy = 1.8
	sun.light_angular_distance = 1.2
	sun.shadow_enabled = true
	sun.shadow_blur = 1.2
	sun.directional_shadow_max_distance = 120.0
	sun.directional_shadow_blend_splits = true
	sun.light_volumetric_fog_energy = 1.4
	sun.rotation_degrees = Vector3(-38.0, -140.0, 0.0)
	add_child(sun)


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP:
			cam_dist = maxf(cam_dist - 4.0, 26.0)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cam_dist = minf(cam_dist + 4.0, 100.0)
	if e is InputEventKey and e.pressed and e.keycode == KEY_R and player and (player.dead or over):
		get_tree().reload_current_scene()
	if e is InputEventKey and e.pressed and e.keycode == KEY_ESCAPE:
		get_tree().quit()


func hud_hovered() -> bool:
	return hud.hovered(get_viewport().get_mouse_position())


func add_shake(v: float) -> void:
	_shake = minf(_shake + v, 0.8)


func aoe(pos: Vector3, r: float, dmg: float, src: Actor, color: Color, knockback := 0.0) -> void:
	for e in hostiles_of(src):
		var d := Vector2(e.position.x - pos.x, e.position.z - pos.z).length()
		if d < r + e.radius:
			var amount := dmg * lerpf(1.0, 0.65, clampf(d / r, 0.0, 1.0)) * randf_range(0.9, 1.1)
			deal(e, amount, src, color, knockback)


func _update_plates() -> void:
	for h in heroes():
		if h.plate:
			var fill: Sprite3D = h.plate.get_child(2)
			fill.scale.x = 15.6 * clampf(h.hp / h.max_hp, 0.0, 1.0)


func _process(dt: float) -> void:
	_frame += 1
	if opts.has("bench") and _frame % 120 == 0:
		print("fps ", Engine.get_frames_per_second())
	if selecting:
		_select_tick(dt)
		if shot_mode:
			_stage_tick()
		return
	if shot_mode:
		_stage_tick()
	else:
		_update_aim()
		_spawner(dt)
	_update_plates()
	world.set_player_pos(player.position)
	_update_camera(dt)


func _update_aim() -> void:
	var mp := get_viewport().get_mouse_position()
	var o := cam.project_ray_origin(mp)
	var d := cam.project_ray_normal(mp)
	var y := player.position.y
	var p := o
	for i in 4:
		if absf(d.y) < 1e-4:
			break
		p = o + d * ((y - o.y) / d.y)
		y = world.height_at(p.x, p.z)
	aim = Vector3(p.x, y, p.z)


func _update_camera(dt: float) -> void:
	var look := player.position + Vector3(0, 1.0, 0)
	if not shot_mode:
		var ahead := aim - player.position
		ahead.y = 0
		look += ahead.limit_length(16.0) * 0.15
	_cam_target = _cam_target.lerp(look, 1.0 - exp(-6.0 * dt))
	var pitch := deg_to_rad(CAM_PITCH)
	_dist = lerpf(_dist, cam_dist, 1.0 - exp(-10.0 * dt))
	cam.position = _cam_target + Vector3(0, sin(pitch), cos(pitch)) * _dist
	# shadows and volumetric fog must reach the ground at every zoom level (26-100 m)
	sun.directional_shadow_max_distance = _dist + 70.0
	env.volumetric_fog_length = _dist + 60.0
	cam.look_at(_cam_target, Vector3.UP)
	if _shake > 0.001:
		cam.position += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * _shake * 0.5
		_shake = maxf(_shake - dt * 1.8, 0.0)


func alive_enemies() -> int:
	var n := 0
	for e in enemies:
		if is_instance_valid(e) and not e.dead:
			n += 1
	return n


func _spawner(dt: float) -> void:
	_spawn_t -= dt
	if _spawn_t > 0.0 or player.dead:
		return
	_spawn_t = 3.0
	if over or alive_enemies() >= 16:
		return
	# packs rise near a living champion (the player most often), always inside the storm
	var hs := heroes()
	var near: Actor = player if randf() < 0.5 or hs.is_empty() else hs[randi() % hs.size()]
	var close := 0
	for e in enemies:
		if is_instance_valid(e) and not e.dead and e.position.distance_to(near.position) < 22.0:
			close += 1
	if close >= 6:
		return
	for attempt in 20:
		var a := randf() * TAU
		var c := near.position + Vector3(cos(a), 0, sin(a)) * randf_range(15.0, 21.0)
		if world.walkable(c.x, c.z, 1.5) and (zone == null or not zone.danger(c, 4.0)):
			spawn_pack(c, randi_range(4, 6), true)
			return


func spawn_pack(center: Vector3, n: int, rise: bool) -> void:
	for i in n:
		var a := randf() * TAU
		var r := randf_range(0.8, 3.2)
		var p := center + Vector3(cos(a) * r, 0, sin(a) * r)
		if not world.walkable(p.x, p.z, 0.5):
			continue
		var s := Skeleton.new()
		s.game = self
		add_child(s)
		var roll := randf()
		s.setup("mage" if roll < 0.2 else ("warrior" if roll < 0.45 else "minion"))
		s.position = Vector3(p.x, world.height_at(p.x, p.z), p.z)
		enemies.append(s)
		units.append(s)
		if rise:
			s.rise()


# --- deterministic staging for screenshots -------------------------------------------------

func _nearest_enemy() -> Vector3:
	var best := player.position + Vector3(0, 0, -6)
	var bd := INF
	for e in enemies:
		if is_instance_valid(e) and not e.dead:
			var d: float = e.position.distance_to(player.position)
			if d < bd:
				bd = d
				best = e.position
	return best


func _stage_tick() -> void:
	var stage: String = opts.get("stage", "battle")
	var f := _frame
	if stage == "select":
		pass
	elif stage == "royale":
		if f == 2 and zone:
			zone.center = player.position + Vector3(4.0, 0, -9.0)
			zone.radius = 17.0
			zone.next_center = player.position + Vector3(2.0, 0, -6.0)
			zone.next_radius = 9.0
			zone.timer = 23.0
			var hs := heroes()
			for i in range(1, mini(3, hs.size())):
				var h: Hero = hs[i]
				h.position = player.position + Vector3(-7.0 + i * 9.0, 0, -6.0 - i * 2.0)
				h.position.y = world.height_at(h.position.x, h.position.z)
			spawn_pack(player.position + Vector3(-3, 0, -9), 4, false)
			feed("Sable Thorn has fallen by Brother Hask", Color(1.0, 0.6, 0.4))
			feed("The storm is closing in", Color(0.75, 0.55, 1.0))
		aim = _nearest_enemy()
		if f == 60:
			player.cast("primary", aim)
	elif f == 2 and stage != "explore":
		var ring := 7.5 if stage == "battle" else 3.2
		for i in 8:
			var a := -PI * 0.5 + (i - 3.5) * 0.36
			var p := player.position + Vector3(cos(a), 0, sin(a)) * ring * randf_range(0.85, 1.25)
			spawn_pack(p, 1, false)
		for e in enemies:
			e.aggro = true
	if stage == "battle":
		aim = _nearest_enemy()
		if f == 30:
			var c := Vector3.ZERO
			for e in enemies:
				c += e.position
			player.cast("ultimate", c / maxf(enemies.size(), 1))
		if f == 70 or f == 105:
			player.cast("primary", _nearest_enemy())
	elif stage == "nova" or stage == "melee":
		aim = _nearest_enemy()
		if f == 20 and stage == "melee":
			player.cast("primary", aim)
		if f == 40:
			player.cast("secondary", aim)
	var cap := int(opts.get("frames", {"battle": 96, "nova": 62, "melee": 62, "explore": 60, "select": 40, "royale": 75}.get(stage, 90)))
	if f >= cap and not _captured:
		_captured = true
		_capture()


func _capture() -> void:
	await RenderingServer.frame_post_draw
	var path: String = opts.shot
	if not path.is_absolute_path():
		path = ProjectSettings.globalize_path("res://").path_join(path)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	get_viewport().get_texture().get_image().save_png(path)
	print("saved ", path)
	get_tree().quit()
