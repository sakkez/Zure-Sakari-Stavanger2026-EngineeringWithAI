class_name Fireball
extends Node3D
## Fireball projectile: flies straight, explodes on the first enemy, obstacle, hill or at max range.

var game
var owner_actor: Node3D
var vel := Vector3.ZERO
var life := 1.1
var visual: Node3D
var done := false


func _ready() -> void:
	visual = game.fx.fireball_visual()


func _process(dt: float) -> void:
	if done:
		return
	global_position += vel * dt
	visual.global_position = global_position
	life -= dt
	var hit := life <= 0.0
	var p := global_position
	if p.y < game.world.height_at(p.x, p.z) + 0.2:
		hit = true
	for e in game.hostiles_of(owner_actor):
		if Vector2(e.position.x - p.x, e.position.z - p.z).length() < e.radius + 0.45:
			hit = true
			break
	if not hit:
		for o in game.world.obstacles:
			if Vector2(o.x - p.x, o.y - p.z).length() < o.z + 0.2 and p.y < game.world.height_at(o.x, o.y) + 4.0:
				hit = true
				break
	if hit:
		done = true
		game.fx.retire(visual)
		game.fx.explosion(p - vel.normalized() * 0.3)
		game.aoe(p, 2.2, 30.0, owner_actor, Color(1.0, 0.7, 0.3), 1.0)
		queue_free()
