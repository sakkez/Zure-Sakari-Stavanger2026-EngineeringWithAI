class_name Bolt
extends Node3D
## Enemy necrotic bolt: flies straight at where the hero was, bursts on the hero, cover or range.

var game
var owner_actor: Actor
var vel := Vector3.ZERO
var dmg := 12.0
var life := 2.0
var visual: Node3D
var done := false


func _ready() -> void:
	visual = game.fx.fireball_visual(FX.NECRO, Color(0.4, 1.0, 0.55))


func _process(dt: float) -> void:
	if done:
		return
	global_position += vel * dt
	visual.global_position = global_position
	life -= dt
	var p := global_position
	var hit: bool = life <= 0.0 or p.y < game.world.height_at(p.x, p.z) + 0.2
	for u in game.hostiles_of(owner_actor):
		if Vector2(u.position.x - p.x, u.position.z - p.z).length() < u.radius + 0.35:
			game.deal(u, dmg, owner_actor, Color(1.0, 0.25, 0.2))
			hit = true
			break
	if not hit:
		for o in game.world.obstacles:
			if Vector2(o.x - p.x, o.y - p.z).length() < o.z + 0.1:
				hit = true
				break
	if hit:
		done = true
		game.fx.retire(visual)
		game.fx.necro_burst(p)
		queue_free()
