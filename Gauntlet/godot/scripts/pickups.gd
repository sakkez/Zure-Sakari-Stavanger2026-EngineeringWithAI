class_name Pickups
extends Node3D
## Health and mana flasks dropped by the slain: bobbing glowing bottles with a soft ground pool.
## Any champion who walks over one drinks it.

const KINDS := {
	"health": {"color": Color(0.85, 0.08, 0.05), "glow": Color(1.0, 0.18, 0.1), "amount": 0.35},
	"mana": {"color": Color(0.12, 0.25, 0.9), "glow": Color(0.25, 0.45, 1.0), "amount": 0.45},
}

var game
var items: Array = []  # {kind, node, pos, life, t}
var _mesh: Mesh
var _mats := {}
var _pool_tex: ImageTexture


func _ready() -> void:
	var st := SurfaceTool.new()
	var body := SphereMesh.new()
	body.radius = 0.2
	body.height = 0.36
	st.append_from(body, 0, Transform3D(Basis.IDENTITY, Vector3(0, 0.18, 0)))
	var neck := CylinderMesh.new()
	neck.top_radius = 0.06
	neck.bottom_radius = 0.09
	neck.height = 0.2
	st.append_from(neck, 0, Transform3D(Basis.IDENTITY, Vector3(0, 0.44, 0)))
	var cork := CylinderMesh.new()
	cork.top_radius = 0.07
	cork.bottom_radius = 0.07
	cork.height = 0.07
	st.append_from(cork, 0, Transform3D(Basis.IDENTITY, Vector3(0, 0.57, 0)))
	_mesh = st.commit()
	for k in KINDS:
		var m := StandardMaterial3D.new()
		m.albedo_color = KINDS[k].color
		m.emission_enabled = true
		m.emission = KINDS[k].glow
		m.emission_energy_multiplier = 2.2
		m.roughness = 0.15
		m.rim_enabled = true
		_mats[k] = m
	var s := 64
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	for y in s:
		for x in s:
			var r := (Vector2(x, y) / (s - 1) * 2.0 - Vector2.ONE).length()
			img.set_pixel(x, y, Color(1, 1, 1, pow(maxf(1.0 - r, 0.0), 2.0)))
	_pool_tex = ImageTexture.create_from_image(img)


func drop(pos: Vector3, kind: String) -> void:
	var root := Node3D.new()
	add_child(root)
	var off := Vector3(randf_range(-0.8, 0.8), 0, randf_range(-0.8, 0.8))
	var p := pos + off
	p.y = game.world.height_at(p.x, p.z)
	root.global_position = p
	var mi := MeshInstance3D.new()
	mi.mesh = _mesh
	mi.material_override = _mats[kind]
	mi.scale = Vector3.ONE * 1.6
	root.add_child(mi)
	var d := Decal.new()
	d.size = Vector3(2.2, 2.0, 2.2)
	d.texture_albedo = _pool_tex
	d.texture_emission = _pool_tex
	d.modulate = Color(KINDS[kind].glow, 0.5)
	d.emission_energy = 1.2
	root.add_child(d)
	items.append({"kind": kind, "node": root, "mesh": mi, "life": 40.0, "t": randf() * TAU})


func _process(dt: float) -> void:
	for it in items.duplicate():
		it.life -= dt
		it.t += dt
		var mi: MeshInstance3D = it.mesh
		mi.position.y = 0.25 + sin(it.t * 2.5) * 0.12
		mi.rotation.y += dt * 1.5
		if it.life < 5.0:
			it.node.visible = fmod(it.life, 0.4) > 0.15
		if it.life <= 0.0:
			_remove(it)
			continue
		for h in game.heroes():
			if h.position.distance_to(it.node.global_position) < 1.3 and _wants(h, it.kind):
				_drink(h, it)
				break


func _wants(h: Hero, kind: String) -> bool:
	return h.hp < h.max_hp * 0.98 if kind == "health" else h.mana < h.max_mana * 0.95


func _drink(h: Hero, it: Dictionary) -> void:
	var k: Dictionary = KINDS[it.kind]
	if it.kind == "health":
		var amount: float = h.max_hp * k.amount
		h.hp = minf(h.max_hp, h.hp + amount)
		if h.is_player:
			game.fx.damage_number(h.position, amount, Color(0.4, 1.0, 0.4))
	else:
		h.mana = minf(h.max_mana, h.mana + h.max_mana * k.amount)
	game.fx.spawn(game.fx.emitter({"amount": 24, "life": 0.7, "vmin": 1.0, "vmax": 3.0, "dir": Vector3.UP, "spread": 40.0, "radius": 0.3,
		"gravity": Vector3(0, 1.5, 0), "smin": 0.15, "smax": 0.35, "size": 1.0, "mat": game.fx.glow_mat,
		"colors": [[0.0, Color(k.glow, 0.0)], [0.2, Color(k.glow, 0.9)], [1.0, Color(k.glow, 0.0)]]}), h.position + Vector3(0, 0.6, 0))
	_remove(it)


func _remove(it: Dictionary) -> void:
	items.erase(it)
	it.node.queue_free()
