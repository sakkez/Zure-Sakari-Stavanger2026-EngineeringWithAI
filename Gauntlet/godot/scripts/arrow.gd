class_name Arrow
extends Node3D
## Ranger crossbow bolt: fast, single target; sticks into the ground or cover when it misses.

var game
var owner_actor: Actor
var vel := Vector3.ZERO
var dmg := 24.0
var life := 0.75
var visual: Node3D
var done := false


func _ready() -> void:
	visual = game.fx.arrow_visual()


func _process(dt: float) -> void:
	if done:
		return
	global_position += vel * dt
	visual.global_position = global_position
	visual.look_at(global_position + vel, Vector3.UP)
	life -= dt
	var p := global_position
	if life <= 0.0 or p.y < game.world.height_at(p.x, p.z) + 0.1:
		_finish(p, null)
		return
	for e in game.hostiles_of(owner_actor):
		if Vector2(e.position.x - p.x, e.position.z - p.z).length() < e.radius + 0.3:
			_finish(p, e)
			return
	for o in game.world.obstacles:
		if Vector2(o.x - p.x, o.y - p.z).length() < o.z and p.y < game.world.height_at(o.x, o.y) + 4.0:
			_finish(p, null)
			return


func _finish(p: Vector3, target) -> void:
	done = true
	var dir := vel.normalized()
	if target:
		game.deal(target, dmg * randf_range(0.9, 1.1), owner_actor, Color(1.0, 0.9, 0.7), 0.4)
		game.fx.hit_spark(p, dir)
		game.fx.retire(visual)
	else:
		game.fx.stick_arrow(visual, p, dir)
	queue_free()
